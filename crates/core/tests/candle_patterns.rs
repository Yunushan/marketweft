use marketweft_core::{
    parse_csv, parse_exact_utc, parse_sessions, replay_candle_patterns, CandlePattern,
    CandlePatternHit,
};

#[test]
fn candle_patterns_use_observation_closes_and_reset_at_gaps_and_new_sessions() {
    let bars = parse_csv(include_str!("fixtures/synthetic-candle-patterns.csv")).unwrap();
    let sessions = parse_sessions(include_str!(
        "fixtures/synthetic-candle-pattern-sessions.csv"
    ))
    .unwrap();
    let utc = |value| parse_exact_utc(value).unwrap();
    let expected = [
        CandlePatternHit {
            kind: CandlePattern::BullishEngulfing,
            bar_index: 1,
            observed_at: utc("2026-01-12T14:02:00Z"),
        },
        CandlePatternHit {
            kind: CandlePattern::BearishEngulfing,
            bar_index: 2,
            observed_at: utc("2026-01-12T14:03:00Z"),
        },
        CandlePatternHit {
            kind: CandlePattern::Doji,
            bar_index: 4,
            observed_at: utc("2026-01-12T14:06:00Z"),
        },
        CandlePatternHit {
            kind: CandlePattern::Doji,
            bar_index: 9,
            observed_at: utc("2026-01-13T14:02:30Z"),
        },
    ];
    for (index, hit) in expected.iter().enumerate() {
        let after = replay_candle_patterns(&sessions, 60, &bars, hit.observed_at).unwrap();
        let before = replay_candle_patterns(&sessions, 60, &bars, hit.observed_at - 1).unwrap();
        assert_eq!(after, expected[..=index]);
        assert_eq!(before, expected[..index]);
        let captured = &bars[..=hit.bar_index];
        assert_eq!(
            replay_candle_patterns(&sessions, 60, captured, hit.observed_at).unwrap(),
            after
        );
    }
    assert_eq!(
        replay_candle_patterns(&sessions, 60, &bars, i64::MAX).unwrap(),
        expected
    );
}

#[test]
fn candle_validation_does_not_inspect_unobserved_prices() {
    let mut bars = parse_csv(include_str!("fixtures/synthetic-candle-patterns.csv")).unwrap();
    let sessions = parse_sessions(include_str!(
        "fixtures/synthetic-candle-pattern-sessions.csv"
    ))
    .unwrap();
    let bar = bars.last_mut().unwrap();
    bar.high = bar.low - 1;
    let observed = parse_exact_utc("2026-01-13T14:02:30Z").unwrap();
    assert_eq!(
        replay_candle_patterns(&sessions, 60, &bars, observed - 1)
            .unwrap()
            .len(),
        3
    );
    assert!(replay_candle_patterns(&sessions, 60, &bars, observed).is_err());
}
