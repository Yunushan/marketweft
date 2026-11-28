use marketweft_core::{
    normalized_average_true_range, parse_csv, percentage_price_oscillator, Bar, PpoValue, MAX_BARS,
    MAX_TICKS,
};

fn fixture() -> Vec<Bar> {
    parse_csv(include_str!("fixtures/synthetic-normalized-indicators.csv")).unwrap()
}

#[test]
fn price_oscillator_restarts_the_signal_each_time_the_slow_ema_is_zero() {
    let closes: Vec<_> = fixture().iter().map(|bar| bar.close).collect();
    let expected = [
        (None, None, None),
        (Some(-100_000_000), None, None),
        (Some(200_000_000), Some(50_000_000), Some(150_000_000)),
        (None, None, None),
        (Some(50_000_000), None, None),
        (Some(0), Some(25_000_000), Some(-25_000_000)),
        (Some(100_000_000), Some(75_000_000), Some(25_000_000)),
        (Some(0), Some(25_000_000), Some(-25_000_000)),
        (None, None, None),
        (Some(50_000_000), None, None),
        (Some(0), Some(25_000_000), Some(-25_000_000)),
        (Some(0), Some(8_333_333), Some(-8_333_333)),
    ]
    .map(|(line, signal, histogram)| PpoValue {
        line,
        signal,
        histogram,
    });
    for end in 0..=closes.len() {
        assert_eq!(
            percentage_price_oscillator(1, 2, 2, &closes[..end]).unwrap(),
            expected[..end]
        );
    }
    for (fast, slow, signal) in [
        (0, 2, 1),
        (2, 2, 1),
        (9, 1, 3),
        (1, 2, 0),
        (1, 2, MAX_BARS + 1),
    ] {
        assert!(percentage_price_oscillator(fast, slow, signal, &closes).is_err());
    }
    assert!(percentage_price_oscillator(1, 2, 1, &[MAX_TICKS + 1]).is_err());
}

#[test]
fn normalized_atr_distinguishes_signed_gaps_true_zero_and_missing_division() {
    let bars = fixture();
    let expected = [
        Some(-33_333_333),
        None,
        Some(133_333_333),
        Some(-800_000_000),
        Some(150_000_000),
        Some(50_000_000),
        Some(-175_000_000),
        Some(-100_000_000),
        Some(300_000_000),
        Some(66_666_667),
        Some(50_000_000),
        Some(0),
    ];
    for end in 0..=bars.len() {
        assert_eq!(
            normalized_average_true_range(1, &bars[..end]).unwrap(),
            expected[..end]
        );
    }
    let smoothed = normalized_average_true_range(2, &bars).unwrap();
    assert_eq!(&smoothed[..3], &[None, None, Some(141_666_667)]);
    assert_eq!(smoothed.last(), Some(&Some(45_043_950)));
    assert!(normalized_average_true_range(0, &bars).is_err());
}

#[test]
fn wide_percentages_are_preserved_beyond_signed_64_bit_values() {
    let price = [2 - MAX_TICKS, MAX_TICKS];
    let ppo = percentage_price_oscillator(1, 2, 1, &price).unwrap()[1];
    let expected = i128::from(MAX_TICKS - 1) * 100_000_000;
    assert_eq!(
        ppo,
        PpoValue {
            line: Some(expected),
            signal: Some(expected),
            histogram: Some(0)
        }
    );
    let range = Bar {
        time: 0,
        open: 0,
        high: MAX_TICKS,
        low: -MAX_TICKS,
        close: 1,
        volume: 0,
    };
    assert_eq!(
        normalized_average_true_range(1, &[range]).unwrap(),
        [Some(i128::from(MAX_TICKS) * 200_000_000)],
    );
}
