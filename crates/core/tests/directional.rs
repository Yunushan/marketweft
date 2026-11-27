use marketweft_core::{
    directional_movement, parse_csv, Bar, DirectionalMovement, MAX_BARS, MAX_TICKS,
};

fn point(plus_di: Option<i64>, minus_di: Option<i64>, adx: Option<i64>) -> DirectionalMovement {
    DirectionalMovement {
        plus_di,
        minus_di,
        adx,
    }
}

#[test]
fn checks_separate_warm_up_gaps_ties_and_exact_observed_prefixes() {
    let bars = parse_csv(include_str!("fixtures/synthetic-directional.csv")).unwrap();
    let expected = [
        point(None, None, None),
        point(None, None, None),
        point(Some(50000000), Some(21428571), None),
        point(Some(14000000), Some(74000000), Some(54090909)),
        point(Some(8974359), Some(67948718), Some(65378788)),
        point(Some(8974359), Some(67948718), Some(71022727)),
        point(Some(8974378), Some(67948704), Some(73844673)),
        point(Some(4929587), Some(37323931), Some(75255646)),
        point(Some(4929587), Some(37323931), Some(75961133)),
        point(Some(89567231), Some(4095827), Some(83607629)),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            directional_movement(2, 2, &bars[..end]).unwrap(),
            expected[..end]
        );
    }
    let alternate = [
        point(None, None, None),
        point(Some(77777778), Some(0), None),
        point(Some(0), Some(60000000), None),
        point(Some(0), Some(94444444), Some(100000000)),
        point(Some(0), Some(57142857), Some(100000000)),
        point(Some(0), Some(0), Some(66666667)),
        point(Some(100000000), Some(0), Some(77777778)),
        point(Some(0), Some(0), Some(51851852)),
        point(Some(0), Some(0), Some(34567901)),
        point(Some(100000000), Some(0), Some(56378601)),
    ];
    assert_eq!(directional_movement(1, 3, &bars).unwrap(), alternate);
    assert!(directional_movement(0, 2, &bars).is_err());
    assert!(directional_movement(2, MAX_BARS + 1, &bars).is_err());
    assert!(directional_movement(2, 2, &[bars[0], bars[0]])
        .unwrap_err()
        .contains("later"));
}

#[test]
fn keeps_flat_and_maximum_range_windows_defined_once_warm() {
    let flat: Vec<_> = (0..6)
        .map(|time| Bar {
            time,
            open: 0,
            high: 0,
            low: 0,
            close: 0,
            volume: 0,
        })
        .collect();
    let result = directional_movement(2, 3, &flat).unwrap();
    assert_eq!(result[2], point(Some(0), Some(0), None));
    assert_eq!(result[4], point(Some(0), Some(0), Some(0)));
    let bars: Vec<_> = (0..MAX_BARS)
        .map(|index| {
            let value = if index % 2 == 0 {
                -MAX_TICKS
            } else {
                MAX_TICKS
            };
            Bar {
                time: index as i64,
                open: value,
                high: value,
                low: value,
                close: value,
                volume: 0,
            }
        })
        .collect();
    let result = directional_movement(MAX_BARS - 2, 1, &bars).unwrap();
    assert_eq!(
        result[MAX_BARS - 2],
        point(Some(50_000_000), Some(50_000_000), Some(0))
    );
    assert!(result[MAX_BARS - 1]
        .adx
        .is_some_and(|value| (0..=100_000_000).contains(&value)));
}
