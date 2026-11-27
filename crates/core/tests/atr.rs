use marketweft_core::{average_true_range, parse_csv, Bar, MAX_BARS, MAX_TICKS};

#[test]
fn atr_matches_exact_reference_across_gaps_and_preserves_every_prefix() {
    let bars = parse_csv(include_str!("fixtures/synthetic-atr.csv")).unwrap();
    let ranges = [4_000_000, 9_000_000, 5_000_000, 18_000_000, 7_000_000, 0, 1];
    assert_eq!(average_true_range(1, &bars).unwrap(), ranges.map(Some));
    let expected = [
        None,
        None,
        Some(6_000_000),
        Some(10_000_000),
        Some(9_000_000),
        Some(6_000_000),
        Some(4_000_000),
    ];
    assert_eq!(average_true_range(3, &bars).unwrap(), expected);
    for known in 0..=bars.len() {
        assert_eq!(
            average_true_range(3, &bars[..known]).unwrap(),
            expected[..known]
        );
    }
}

#[test]
fn atr_accepts_the_full_signed_price_span_and_rejects_invalid_history() {
    let maximum = Bar {
        time: 0,
        open: 0,
        high: MAX_TICKS,
        low: -MAX_TICKS,
        close: 0,
        volume: 0,
    };
    assert_eq!(
        average_true_range(1, &[maximum]).unwrap(),
        [Some(2 * MAX_TICKS)]
    );
    assert!(average_true_range(3, &[maximum, maximum])
        .unwrap_err()
        .contains("later"));
    assert!(average_true_range(
        3,
        &[Bar {
            low: MAX_TICKS,
            ..maximum
        }]
    )
    .is_err());
    assert!(average_true_range(0, &[]).is_err());
    assert!(average_true_range(MAX_BARS + 1, &[]).is_err());
}
