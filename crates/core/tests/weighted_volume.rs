use marketweft_core::{
    money_flow_index, parse_csv, volume_oscillator, volume_rate_of_change, volume_weighted_average,
    Bar, MAX_BARS, MAX_TICKS,
};

#[test]
fn volume_changes_retain_zero_baselines_exact_averages_and_observed_prefixes() {
    let bars = parse_csv(include_str!("fixtures/synthetic-volume-change-studies.csv")).unwrap();
    let rates = [
        None,
        None,
        Some(-100_000_000),
        None,
        None,
        Some(0),
        Some(75_000_000),
        Some(-37_500_000),
    ];
    let oscillator = [
        None,
        None,
        Some(-333_333),
        Some(333_333),
        Some(666_667),
        Some(0),
        Some(250_000),
        Some(125_000),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            volume_rate_of_change(2, &bars[..end]).unwrap(),
            rates[..end]
        );
        assert_eq!(
            volume_oscillator(2, 3, &bars[..end]).unwrap(),
            oscillator[..end]
        );
    }
    let mut first = bars[0];
    first.volume = 1;
    assert_eq!(
        volume_oscillator(1, 2, &[first, bars[1]]).unwrap()[1],
        Some(-1)
    );
    let large = Bar {
        volume: MAX_TICKS,
        ..bars[1]
    };
    assert_eq!(
        volume_rate_of_change(1, &[first, large]).unwrap()[1],
        Some(199_999_999_999_999_900_000_000)
    );
    assert!(volume_oscillator(2, 2, &bars).is_err());
    assert!(volume_rate_of_change(0, &bars).is_err());
    assert!(volume_rate_of_change(1, &[bars[0], bars[0]]).is_err());
}

#[test]
fn verifies_signed_typical_price_ties_and_zero_volume_over_every_prefix() {
    let bars = parse_csv(include_str!("fixtures/synthetic-weighted-volume.csv")).unwrap();
    let mfi = [
        None,
        None,
        Some(100_000_000),
        Some(0),
        Some(0),
        None,
        Some(100_000_000),
        Some(89_552_239),
        Some(0),
    ];
    let vwma = [
        None,
        Some(-7_000_000),
        Some(-6_500_000),
        Some(-7_800_000),
        Some(-9_000_000),
        None,
        Some(6_000_000),
        Some(5_000_000),
        Some(500_000),
    ];
    for end in 0..=bars.len() {
        assert_eq!(money_flow_index(2, &bars[..end]).unwrap(), mfi[..end]);
        assert_eq!(
            volume_weighted_average(2, &bars[..end]).unwrap(),
            vwma[..end]
        );
    }
    for calculate in [money_flow_index, volume_weighted_average] {
        assert!(calculate(0, &bars).is_err());
        assert!(calculate(MAX_BARS + 1, &bars).is_err());
        assert!(calculate(3, &[bars[0], bars[0]])
            .unwrap_err()
            .contains("later"));
    }
}

#[test]
fn preserves_full_history_precision_and_signed_half_tick_ties() {
    let full: Vec<_> = (0..MAX_BARS)
        .map(|index| {
            let p = if index % 2 == 0 {
                -MAX_TICKS
            } else {
                MAX_TICKS
            };
            Bar {
                time: index as i64,
                open: p,
                high: p,
                low: p,
                close: p,
                volume: MAX_TICKS,
            }
        })
        .collect();
    let flow = money_flow_index(MAX_BARS - 1, &full).unwrap();
    assert_eq!(flow[MAX_BARS - 2], None);
    assert_eq!(flow[MAX_BARS - 1], Some(50_000_500));
    assert_eq!(
        volume_weighted_average(MAX_BARS, &full).unwrap()[MAX_BARS - 1],
        Some(0)
    );
    let tie = [
        Bar {
            time: 0,
            open: -1,
            high: -1,
            low: -1,
            close: -1,
            volume: 1,
        },
        Bar {
            time: 1,
            open: 0,
            high: 0,
            low: 0,
            close: 0,
            volume: 1,
        },
    ];
    assert_eq!(volume_weighted_average(2, &tie).unwrap(), [None, Some(-1)]);
}
