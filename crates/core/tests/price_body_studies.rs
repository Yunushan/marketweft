use marketweft_core::{
    center_of_gravity, qstick, williams_accumulation_distribution, Bar, CenterOfGravityValue,
    MAX_TICKS, SCALE,
};

const EXAMPLE: [[i64; 4]; 7] = [
    [-2, 1, -3, -1],
    [2, 6, 2, 5],
    [6, 8, 4, 5],
    [-3, -2, -5, -4],
    [1, 2, 0, 1],
    [-1, 1, -3, 1],
    [2, 4, 0, 0],
];

fn import_example() -> Vec<Bar> {
    EXAMPLE
        .iter()
        .enumerate()
        .map(|(index, &[open, high, low, close])| Bar {
            time: 1_748_872_800 + index as i64 * 60,
            open: open * SCALE,
            high: high * SCALE,
            low: low * SCALE,
            close: close * SCALE,
            volume: 10 * SCALE,
        })
        .collect()
}

#[test]
fn signed_candle_bodies_and_true_range_gaps_produce_exact_readouts() {
    let bars = import_example();
    let q = qstick(2, &bars).unwrap();
    assert_eq!(
        q,
        [
            None,
            Some(2_000_000),
            Some(1_000_000),
            Some(-1_000_000),
            Some(-500_000),
            Some(1_000_000),
            Some(0)
        ]
    );
    let wad = williams_accumulation_distribution(&bars).unwrap();
    assert_eq!(
        wad,
        [0, 6, 6, -3, 2, 2, -2].map(|value: i64| Some(i128::from(value * SCALE)))
    );
    let modified = bars
        .iter()
        .map(|bar| Bar { volume: 0, ..*bar })
        .collect::<Vec<_>>();
    assert_eq!(williams_accumulation_distribution(&modified).unwrap(), wad);
    for used in 0..=bars.len() {
        assert_eq!(qstick(2, &bars[..used]).unwrap(), q[..used]);
        assert_eq!(
            williams_accumulation_distribution(&bars[..used]).unwrap(),
            wad[..used]
        );
    }
    let mut invalid = bars;
    invalid[2].time = invalid[1].time;
    assert!(qstick(2, &invalid).is_err());
    assert!(williams_accumulation_distribution(&invalid).is_err());
}

#[test]
fn gravity_uses_recent_first_midpoints_and_distinguishes_a_gap_from_zero() {
    let bars = import_example();
    let rows = center_of_gravity(2, &bars).unwrap();
    assert_eq!(
        rows.iter().map(|row| row.line).collect::<Vec<_>>(),
        [
            None,
            Some(-666_667),
            Some(-1_400_000),
            Some(-3_400_000),
            Some(-2_400_000),
            None,
            Some(0)
        ]
    );
    assert_eq!(
        rows[5],
        CenterOfGravityValue {
            line: None,
            signal: Some(-2_400_000)
        }
    );
    assert_eq!(
        rows[6],
        CenterOfGravityValue {
            line: Some(0),
            signal: None
        }
    );
    for used in 0..=bars.len() {
        assert_eq!(center_of_gravity(2, &bars[..used]).unwrap(), rows[..used]);
    }
    let point = |time, value| Bar {
        time,
        open: value,
        high: value,
        low: value,
        close: value,
        volume: 0,
    };
    let wide = center_of_gravity(2, &[point(0, MAX_TICKS), point(60, -MAX_TICKS + 1)]).unwrap();
    assert_eq!(
        wide[1].line,
        Some(-i128::from(MAX_TICKS + 1) * i128::from(SCALE))
    );
    assert!(center_of_gravity(1, &bars).is_err());
}

#[test]
fn accumulation_retains_totals_wider_than_signed_64_bit() {
    let history: Vec<_> = (0..5000)
        .map(|index| Bar {
            time: index * 60,
            open: index,
            high: index,
            low: -MAX_TICKS,
            close: index,
            volume: 1,
        })
        .collect();
    let last = williams_accumulation_distribution(&history)
        .unwrap()
        .pop()
        .unwrap()
        .unwrap();
    assert_eq!(last, i128::from(MAX_TICKS) * 4999 + 4999 * 5000 / 2);
    assert!(last > i128::from(i64::MAX));
}
