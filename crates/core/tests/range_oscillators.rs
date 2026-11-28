use marketweft_core::{balance_of_power, vortex_indicator, Bar, VortexValue, MAX_TICKS};

const FIXTURE: [[i64; 5]; 6] = [
    [0, -4, -2, -5, -3],
    [60, -3, 0, -4, -1],
    [240, 1, 3, 0, 0],
    [300, 0, 0, 0, 0],
    [360, 0, 0, 0, 0],
    [500, 0, 2, -2, 0],
];

fn bar([time, open, high, low, close]: [i64; 5]) -> Bar {
    Bar {
        time,
        open,
        high,
        low,
        close,
        volume: 1,
    }
}

#[test]
fn vortex_and_balance_of_power_preserve_prefixes_and_unavailable_values() {
    let bars = FIXTURE.map(bar);
    let point = |positive, negative| Some(VortexValue { positive, negative });
    let vortex = [
        None,
        None,
        point(1_500_000, 250_000),
        point(1_750_000, 750_000),
        None,
        point(500_000, 500_000),
    ];
    let power = [
        Some(333_333),
        Some(500_000),
        Some(-333_333),
        None,
        None,
        Some(0),
    ];
    for end in 0..=bars.len() {
        assert_eq!(vortex_indicator(2, &bars[..end]).unwrap(), vortex[..end]);
        assert_eq!(balance_of_power(&bars[..end]).unwrap(), power[..end]);
    }
    assert_eq!(
        vortex_indicator(3, &bars).unwrap()[5],
        point(500_000, 1_250_000)
    );
    assert!(vortex_indicator(0, &bars).is_err());
    assert!(vortex_indicator(100_001, &bars).is_err());
    assert!(vortex_indicator(1, &[bars[1], bars[0]]).is_err());
    assert!(balance_of_power(&[bars[0], bars[0]]).is_err());
    assert!(balance_of_power(&[bar([0, 4, 5, 2, 6])]).is_err());
}

#[test]
fn range_oscillators_retain_extreme_ratios_and_full_windows() {
    let mut bars = [bar([0, 0, MAX_TICKS, -MAX_TICKS, 0]), bar([60, 0, 1, 0, 0])];
    let ratio = vortex_indicator(1, &bars).unwrap()[1].unwrap();
    assert_eq!(ratio.positive, (i128::from(MAX_TICKS) + 1) * 1_000_000);
    assert_eq!(ratio.negative, i128::from(MAX_TICKS) * 1_000_000);
    bars[1] = bar([60, MAX_TICKS, MAX_TICKS, -MAX_TICKS, -MAX_TICKS]);
    assert_eq!(balance_of_power(&bars).unwrap()[1], Some(-1_000_000));

    let flat_range: Vec<_> = (0..100_000)
        .map(|time| bar([time, -MAX_TICKS, MAX_TICKS, -MAX_TICKS, MAX_TICKS]))
        .collect();
    let last = vortex_indicator(99_999, &flat_range).unwrap()[99_999];
    assert_eq!(
        last,
        Some(VortexValue {
            positive: 1_000_000,
            negative: 1_000_000
        })
    );
}
