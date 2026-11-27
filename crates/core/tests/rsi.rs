use marketweft_core::{parse_csv, relative_strength_index, MAX_BARS, MAX_TICKS, SCALE};

#[test]
fn rsi_matches_a_rational_reference_and_keeps_closed_prefixes() {
    let bars = parse_csv(include_str!("fixtures/synthetic-rsi.csv")).unwrap();
    let closes: Vec<_> = bars.iter().map(|bar| bar.close).collect();
    let expected = [
        None,
        None,
        None,
        Some(77_777_778),
        Some(66_666_667),
        Some(66_666_667),
        Some(88_617_886),
        Some(66_666_667),
        Some(26_814_268),
    ];
    assert_eq!(relative_strength_index(3, &closes).unwrap(), expected);
    for known in 0..=closes.len() {
        assert_eq!(
            relative_strength_index(3, &closes[..known]).unwrap(),
            expected[..known]
        );
    }
}

#[test]
fn rsi_distinguishes_unchanged_prices_and_both_extremes() {
    assert_eq!(
        relative_strength_index(2, &[5, 5, 5, 5]).unwrap(),
        [None, None, Some(50 * SCALE), Some(50 * SCALE)]
    );
    assert_eq!(
        relative_strength_index(2, &[-MAX_TICKS, 0, MAX_TICKS]).unwrap()[2],
        Some(100 * SCALE)
    );
    assert_eq!(
        relative_strength_index(2, &[MAX_TICKS, 0, -MAX_TICKS]).unwrap()[2],
        Some(0)
    );
    assert_eq!(
        relative_strength_index(2, &[-MAX_TICKS, MAX_TICKS, -MAX_TICKS]).unwrap()[2],
        Some(50 * SCALE)
    );

    let mut thin = vec![0, 1, 0, 4];
    thin.resize(10_000, 4);
    let rsi = relative_strength_index(3, &thin).unwrap();
    assert_eq!(rsi[3], Some(83_333_333));
    assert!(rsi[3..].iter().all(|value| *value == rsi[3]));

    assert!(relative_strength_index(1, &[]).is_err());
    assert!(relative_strength_index(MAX_BARS + 1, &[]).is_err());
    assert!(relative_strength_index(3, &[MAX_TICKS + 1]).is_err());
}
