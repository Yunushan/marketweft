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
#[test]
fn true_range_retains_the_previous_observation_across_gaps() {
    use marketweft_core::{observed_true_ranges, parse_csv, TrueRangePoint, MAX_TICKS};

    let bars = parse_csv(include_str!("fixtures/synthetic-true-range.csv")).unwrap();
    let expected: Vec<_> = [4, 7, 0, 8, 0, 5, 0]
        .into_iter()
        .enumerate()
        .map(|(index, range)| TrueRangePoint {
            range_ticks: range * 1_000_000,
            prior_close: index
                .checked_sub(1)
                .map(|prior| (bars[prior].time, bars[prior].close)),
        })
        .collect();
    for end in 0..=bars.len() {
        assert_eq!(observed_true_ranges(&bars[..end]).unwrap(), expected[..end]);
    }
    assert!(observed_true_ranges(&[bars[0], bars[0]]).is_err());
    let mut wide = bars[0];
    wide.high = MAX_TICKS;
    wide.low = -MAX_TICKS;
    assert_eq!(
        observed_true_ranges(&[wide]).unwrap()[0].range_ticks,
        2 * MAX_TICKS
    );
}
