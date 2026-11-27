use marketweft_core::{
    parse_csv, stochastic_oscillator, Bar, StochasticValue, MAX_BARS, MAX_TICKS,
};

fn points(percent_k: Option<i64>, percent_d: Option<i64>) -> StochasticValue {
    StochasticValue {
        percent_k,
        percent_d,
    }
}

#[test]
fn verifies_warm_up_flat_range_and_complete_smoothing_after_gap() {
    let bars = parse_csv(include_str!("fixtures/synthetic-stochastic.csv")).unwrap();
    let expected = [
        points(None, None),
        points(None, None),
        points(Some(50_000_000), None),
        points(Some(20_000_000), Some(35_000_000)),
        points(Some(45_000_000), Some(32_500_000)),
        points(None, None),
        points(None, None),
        points(Some(75_000_000), None),
        points(Some(62_500_000), Some(68_750_000)),
        points(Some(37_500_000), Some(50_000_000)),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            stochastic_oscillator(2, 2, 2, &bars[..end]).unwrap(),
            expected[..end]
        );
    }
    let raw = stochastic_oscillator(2, 1, 1, &bars).unwrap();
    assert_eq!(raw[1], points(Some(100_000_000), Some(100_000_000)));
    assert_eq!(raw[2], points(Some(0), Some(0)));
    assert_eq!(raw[4], points(Some(50_000_000), Some(50_000_000)));
    assert_eq!(raw[5], points(None, None));
    assert_eq!(raw[6], points(Some(50_000_000), Some(50_000_000)));
}

#[test]
fn supports_full_signed_input_range_and_exact_half_tick_rounding() {
    let maximum = Bar {
        time: 0,
        open: 0,
        high: MAX_TICKS,
        low: -MAX_TICKS,
        close: 0,
        volume: 0,
    };
    let half_tick = Bar {
        time: 60,
        high: 200_000_000,
        low: 0,
        close: 1,
        ..maximum
    };
    assert_eq!(
        stochastic_oscillator(1, 1, 1, &[maximum, half_tick]).unwrap(),
        [
            points(Some(50_000_000), Some(50_000_000)),
            points(Some(1), Some(1))
        ]
    );
    assert!(stochastic_oscillator(1, 1, MAX_BARS + 1, &[]).is_err());
    assert!(stochastic_oscillator(1, 0, 1, &[]).is_err());
    assert!(stochastic_oscillator(0, 1, 1, &[]).is_err());
    assert!(stochastic_oscillator(2, 2, 2, &[maximum, maximum])
        .unwrap_err()
        .contains("later"));
}
