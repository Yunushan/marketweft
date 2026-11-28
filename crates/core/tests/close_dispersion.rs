use marketweft_core::{parse_csv, rolling_close_standard_deviation, MAX_BARS, MAX_TICKS};

#[test]
fn population_dispersion_preserves_prefixes_and_distinguishes_zero_from_warmup() {
    let bars = parse_csv(include_str!("fixtures/synthetic-close-dispersion.csv")).unwrap();
    let closes: Vec<_> = bars.iter().map(|bar| bar.close).collect();
    let expected = [None, Some(3_000_000), Some(0), Some(1_500_000), Some(0)];
    for end in 0..=closes.len() {
        assert_eq!(
            rolling_close_standard_deviation(2, &closes[..end]).unwrap(),
            expected[..end]
        );
    }
    assert_eq!(
        rolling_close_standard_deviation(3, &closes).unwrap(),
        [
            None,
            None,
            Some(2_828_427),
            Some(1_414_214),
            Some(1_414_214)
        ]
    );
    assert_eq!(
        rolling_close_standard_deviation(1, &closes).unwrap(),
        [Some(0); 5]
    );
}

#[test]
fn dispersion_rounds_half_ticks_and_supports_the_largest_signed_window() {
    assert_eq!(
        rolling_close_standard_deviation(2, &[-MAX_TICKS, -MAX_TICKS + 1]).unwrap(),
        [None, Some(1)]
    );
    assert_eq!(
        rolling_close_standard_deviation(3, &[-MAX_TICKS, -MAX_TICKS + 1, -MAX_TICKS]).unwrap(),
        [None, None, Some(0)]
    );
    let closes: Vec<_> = (0..MAX_BARS)
        .map(|index| {
            if index % 2 == 0 {
                MAX_TICKS
            } else {
                -MAX_TICKS
            }
        })
        .collect();
    let values = rolling_close_standard_deviation(MAX_BARS, &closes).unwrap();
    assert!(values[..MAX_BARS - 1].iter().all(Option::is_none));
    assert_eq!(values[MAX_BARS - 1], Some(MAX_TICKS));
    assert!(rolling_close_standard_deviation(0, &closes).is_err());
    assert!(rolling_close_standard_deviation(MAX_BARS + 1, &closes).is_err());
    assert!(rolling_close_standard_deviation(1, &[MAX_TICKS + 1]).is_err());
}
