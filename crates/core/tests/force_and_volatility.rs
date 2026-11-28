use marketweft_core::{chaikin_volatility, elder_force_index, Bar, MAX_TICKS, SCALE};

const OBSERVATIONS: [[i64; 6]; 6] = [
    [0, 1, 2, 0, 1, 1],
    [60, 1, 4, 0, 3, 2],
    [120, 3, 4, -2, -1, 1],
    [300, -1, 3, -1, 2, 3],
    [360, 2, 3, 1, 2, 0],
    [420, 2, 5, 1, 2, 2],
];

fn bar([time, open, high, low, close, volume]: [i64; 6]) -> Bar {
    Bar {
        time,
        open,
        high,
        low,
        close,
        volume,
    }
}

#[test]
fn force_and_volatility_keep_signed_prefixes_and_independent_window_sizes() {
    let bars = OBSERVATIONS.map(|[time, open, high, low, close, volume]| {
        bar([
            time,
            open * SCALE,
            high * SCALE,
            low * SCALE,
            close * SCALE,
            volume * SCALE,
        ])
    });
    let force = [
        None,
        None,
        Some(0),
        Some(6_000_000),
        Some(2_000_000),
        Some(666_667),
    ];
    let volatility = [
        None,
        None,
        None,
        Some(44_444_433),
        Some(-44_444_440),
        Some(-17_094_001),
    ];
    for end in 0..=bars.len() {
        assert_eq!(elder_force_index(2, &bars[..end]).unwrap(), force[..end]);
        assert_eq!(
            chaikin_volatility(2, 2, &bars[..end]).unwrap(),
            volatility[..end]
        );
    }
    assert_eq!(elder_force_index(1, &bars).unwrap()[2], Some(-4_000_000));
    assert_eq!(elder_force_index(1, &bars).unwrap()[4], Some(0));
    assert_eq!(
        chaikin_volatility(1, 1, &bars).unwrap()[5],
        Some(100_000_000)
    );
    assert!(elder_force_index(0, &bars).is_err());
    assert!(chaikin_volatility(2, 0, &bars).is_err());
    assert!(chaikin_volatility(100_001, 2, &bars).is_err());
    assert!(elder_force_index(1, &[bars[1], bars[0]]).is_err());
    assert!(chaikin_volatility(1, 1, &[bar([0, 0, 1, 0, 2, 1])]).is_err());
}

#[test]
fn wide_products_and_zero_baselines_are_exact() {
    let huge = [
        bar([0, -MAX_TICKS, -MAX_TICKS + 1, -MAX_TICKS, -MAX_TICKS, 0]),
        bar([1, MAX_TICKS, MAX_TICKS, -MAX_TICKS, MAX_TICKS, MAX_TICKS]),
    ];
    assert_eq!(
        elder_force_index(1, &huge).unwrap()[1],
        Some(8_000_000_000_000_000_000_000_000)
    );
    assert_eq!(
        chaikin_volatility(1, 1, &huge).unwrap()[1],
        Some(399_999_999_999_999_900_000_000)
    );
    let flat = [
        bar([0, 0, 0, 0, 0, 1]),
        bar([1, 0, 1, 0, 0, 1]),
        bar([2, 0, 0, 0, 0, 1]),
    ];
    assert_eq!(
        chaikin_volatility(1, 1, &flat).unwrap(),
        [None, None, Some(-100_000_000)]
    );
    let many: Vec<_> = (0..100_000)
        .map(|time| {
            bar([
                time,
                0,
                MAX_TICKS,
                -MAX_TICKS,
                if time % 2 == 0 { MAX_TICKS } else { -MAX_TICKS },
                MAX_TICKS,
            ])
        })
        .collect();
    let last = elder_force_index(99_999, &many).unwrap()[99_999].unwrap();
    assert_eq!(last, -80_000_800_008_000_080_001);
}
