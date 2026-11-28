use marketweft_core::{
    parse_csv, parse_exact_utc, parse_sessions, replay_candle_patterns, Bar, CandlePattern,
    CandlePatternHit, MAX_TICKS,
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

#[test]
fn piercing_and_dark_cloud_require_strict_price_bounds_and_observed_pairs() {
    let bars = parse_csv(include_str!("fixtures/synthetic-piercing-dark-cloud.csv")).unwrap();
    let sessions = parse_sessions(include_str!(
        "fixtures/synthetic-candle-pattern-sessions.csv"
    ))
    .unwrap();
    let utc = |time| parse_exact_utc(time).unwrap();
    let expected = [
        (CandlePattern::Piercing, 1, utc("2026-01-12T14:02:00Z")),
        (
            CandlePattern::DarkCloudCover,
            2,
            utc("2026-01-12T14:03:00Z"),
        ),
        (
            CandlePattern::BearishEngulfing,
            6,
            utc("2026-01-12T14:08:00Z"),
        ),
        (
            CandlePattern::DarkCloudCover,
            9,
            utc("2026-01-13T14:02:30Z"),
        ),
    ]
    .map(|(kind, bar_index, observed_at)| CandlePatternHit {
        kind,
        bar_index,
        observed_at,
    });
    let scan = |known| replay_candle_patterns(&sessions, 60, &bars, known).unwrap();
    for (index, hit) in expected.iter().enumerate() {
        assert_eq!(scan(hit.observed_at - 1), expected[..index]);
        assert_eq!(scan(hit.observed_at), expected[..=index]);
        assert_eq!(
            replay_candle_patterns(&sessions, 60, &bars[..=hit.bar_index], hit.observed_at)
                .unwrap(),
            expected[..=index],
        );
    }
    assert_eq!(scan(i64::MAX), expected);
    assert_eq!(scan(utc("2026-01-12T14:02:00Z")), expected[..1]);
}

#[test]
fn half_tick_reversals_remain_exact_at_both_signed_price_limits() {
    let sessions = parse_sessions(include_str!(
        "fixtures/synthetic-candle-pattern-sessions.csv"
    ))
    .unwrap();
    let time = parse_exact_utc("2026-01-12T14:00:00Z").unwrap();
    let floor = -MAX_TICKS;
    let prior = Bar {
        time,
        open: floor + 3,
        high: floor + 7,
        low: floor + 2,
        close: floor + 6,
        volume: 0,
    };
    let reversal = Bar {
        time: time + 60,
        open: floor + 8,
        high: floor + 10,
        low: floor + 3,
        close: floor + 4,
        volume: 0,
    };
    let scan = |pair: [Bar; 2]| replay_candle_patterns(&sessions, 60, &pair, time + 120).unwrap();
    assert_eq!(
        scan([prior, reversal])[0].kind,
        CandlePattern::DarkCloudCover
    );
    assert!(scan([
        prior,
        Bar {
            close: floor + 5,
            ..reversal
        }
    ])
    .is_empty());
    assert!(scan([
        prior,
        Bar {
            open: prior.high,
            ..reversal
        }
    ])
    .is_empty());
    let mirror = |bar: Bar| Bar {
        open: -bar.open,
        high: -bar.low,
        low: -bar.high,
        close: -bar.close,
        ..bar
    };
    assert_eq!(
        scan([mirror(prior), mirror(reversal)])[0].kind,
        CandlePattern::Piercing
    );
    assert!(scan([
        mirror(prior),
        mirror(Bar {
            close: floor + 5,
            ..reversal
        })
    ])
    .is_empty());
}

#[test]
fn harami_replay_discloses_signed_pairs_only_when_the_second_candle_closes() {
    let sessions = parse_sessions(include_str!(
        "fixtures/synthetic-candle-pattern-sessions.csv"
    ))
    .unwrap();
    let bars = parse_csv(include_str!("fixtures/synthetic-harami.csv")).unwrap();
    let expected: Vec<_> = [
        (CandlePattern::BullishHarami, 1, "2026-01-12T14:02:00Z"),
        (CandlePattern::BearishHarami, 3, "2026-01-12T14:04:00Z"),
        (CandlePattern::Doji, 4, "2026-01-12T14:06:00Z"),
        (CandlePattern::Doji, 6, "2026-01-12T14:08:00Z"),
        (CandlePattern::BullishHaramiCross, 6, "2026-01-12T14:08:00Z"),
        (CandlePattern::Doji, 9, "2026-01-13T14:02:30Z"),
        (CandlePattern::BearishHaramiCross, 9, "2026-01-13T14:02:30Z"),
    ]
    .into_iter()
    .map(|(kind, bar_index, time)| CandlePatternHit {
        kind,
        bar_index,
        observed_at: parse_exact_utc(time).unwrap(),
    })
    .collect();
    for hit in &expected {
        for cutoff in [hit.observed_at - 1, hit.observed_at] {
            let visible: Vec<_> = expected
                .iter()
                .copied()
                .filter(|hit| hit.observed_at <= cutoff)
                .collect();
            assert_eq!(
                replay_candle_patterns(&sessions, 60, &bars, cutoff).unwrap(),
                visible
            );
            let prefix = &bars[..=hit.bar_index];
            assert_eq!(
                replay_candle_patterns(&sessions, 60, prefix, cutoff).unwrap(),
                visible
            );
        }
    }
    assert_eq!(
        replay_candle_patterns(&sessions, 60, &bars, i64::MAX).unwrap(),
        expected
    );
}

#[test]
fn harami_rejects_body_ties_excess_width_same_direction_and_session_crossing() {
    let sessions = parse_sessions(include_str!(
        "fixtures/synthetic-candle-pattern-sessions.csv"
    ))
    .unwrap();
    let time = sessions[0].open;
    let first = Bar {
        time,
        open: 0,
        high: 2,
        low: -14,
        close: -8,
        volume: 0,
    };
    let second = Bar {
        time: time + 60,
        open: -6,
        high: 1,
        low: -9,
        close: -2,
        volume: 0,
    };
    let scan =
        |first, second| replay_candle_patterns(&sessions, 60, &[first, second], i64::MAX).unwrap();
    assert_eq!(scan(first, second)[0].kind, CandlePattern::BullishHarami);
    for excluded in [
        Bar {
            open: first.close,
            close: -4,
            ..second
        },
        Bar {
            open: -4,
            close: first.open,
            ..second
        },
        Bar { open: -7, ..second },
        Bar {
            open: -2,
            close: -6,
            ..second
        },
        Bar {
            time: time + 120,
            ..second
        },
    ] {
        assert!(scan(first, excluded).is_empty());
    }
    assert!(scan(Bar { high: 3, ..first }, second).is_empty());
    assert!(scan(
        Bar {
            time: sessions[0].close - 60,
            ..first
        },
        Bar {
            time: sessions[1].open,
            ..second
        },
    )
    .is_empty());
}
