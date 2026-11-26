use marketweft_core::{
    indicator, parse_csv, parse_sessions, parse_splits, replay, Average, Instrument, Split,
    SplitBook, SCALE,
};

const ACTIONS: &str = include_str!("fixtures/synthetic-split-actions.csv");
const BARS: &str = include_str!("fixtures/synthetic-split-ohlcv.csv");
const CALENDAR: &str = include_str!("fixtures/synthetic-split-sessions.csv");

fn instrument() -> Instrument {
    Instrument::new("demo", "split").unwrap()
}

#[test]
fn split_replay_matches_independent_raw_and_adjusted_prefixes_at_each_clock() {
    let bars = parse_csv(BARS).unwrap();
    let original = bars.clone();
    let times: Vec<_> = bars.iter().map(|bar| bar.time).collect();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let events = replay(&sessions, &times, 600).unwrap();
    let book = parse_splits(ACTIONS, &instrument()).unwrap();
    let split = book.records()[0];
    let mut count = 0;
    for event in events {
        count += usize::from(event.bar_index.is_some());
        let raw = &bars[..count];
        let adjusted = book.adjust(raw, event.observed_at).unwrap();
        let expected: Vec<_> = raw
            .iter()
            .map(|bar| {
                let mut row = *bar;
                if event.observed_at >= split.effective_at && row.time < split.effective_at {
                    row.open /= 2;
                    row.high /= 2;
                    row.low /= 2;
                    row.close /= 2;
                    row.volume *= 2;
                }
                row
            })
            .collect();
        assert_eq!(adjusted, expected);
        for (kind, period) in [(Average::Simple, 20), (Average::Exponential, 9)] {
            let closes: Vec<_> = adjusted.iter().map(|bar| bar.close).collect();
            let expected: Vec<_> = expected.iter().map(|bar| bar.close).collect();
            assert_eq!(
                indicator(kind, period, &closes),
                indicator(kind, period, &expected)
            );
        }
    }
    assert_eq!(count, 24);
    let before_effect = book.adjust(&bars[..12], split.effective_at - 1).unwrap();
    let at_effect = book.adjust(&bars[..12], split.effective_at).unwrap();
    assert_eq!(
        (before_effect[11].close, before_effect[11].volume),
        (106_500_000, 810_000_001)
    );
    assert_eq!(
        (at_effect[11].close, at_effect[11].volume),
        (53_250_000, 1_620_000_002)
    );
    let after = book.adjust(&bars[..13], split.effective_at + 600).unwrap();
    assert_eq!(after[12], bars[12]);
    assert_eq!(after[12].close, 53 * SCALE);
    assert_eq!(bars, original);
}

#[test]
fn late_observations_and_revisions_do_not_leak_into_earlier_cutoffs() {
    let bars = parse_csv(BARS).unwrap();
    let initial = parse_splits(ACTIONS, &instrument()).unwrap().records()[0];
    let t = initial.effective_at;
    let late = Split {
        observed_at: t + 630,
        ..initial
    };
    let revision = Split {
        observed_at: t + 1200,
        new_shares: 3,
        ..late
    };
    let book = SplitBook::new(vec![revision, late]).unwrap();
    assert_eq!(book.adjust(&bars[..13], t + 629).unwrap(), bars[..13]);
    assert_eq!(
        book.adjust(&bars[..13], t + 630).unwrap()[0].close,
        50_500_000
    );
    assert_eq!(
        book.adjust(&bars[..13], t + 1199).unwrap()[0].close,
        50_500_000
    );
    assert_eq!(
        book.adjust(&bars[..14], t + 1200).unwrap()[0].close,
        33_666_667
    );
    assert_eq!(book.adjust(&bars[..13], t + 629).unwrap(), bars[..13]);
    assert_eq!(book.adjust(&bars[..14], t + 1200).unwrap()[12], bars[12]);
    assert!(book.adjust(&bars[..14], t + 600).is_err());
}

#[test]
fn ratios_compose_once_and_reverse_splits_round_signed_ties_away() {
    let bars =
        parse_csv("time,open,high,low,close,volume\n-1,-0.000001,0,-0.000001,-0.000001,0.000001")
            .unwrap();
    let early = Split {
        effective_at: 0,
        announced_at: 0,
        observed_at: 0,
        new_shares: 3,
        old_shares: 2,
    };
    let later = Split {
        effective_at: 1,
        announced_at: 1,
        observed_at: 1,
        new_shares: 1,
        old_shares: 2,
    };
    let composed = SplitBook::new(vec![later, early])
        .unwrap()
        .adjust(&bars, 1)
        .unwrap();
    assert_eq!((composed[0].close, composed[0].volume), (-1, 1));
    let reverse = SplitBook::new(vec![later])
        .unwrap()
        .adjust(&bars, 1)
        .unwrap();
    assert_eq!((reverse[0].close, reverse[0].volume), (-2, 1));
    let forward = SplitBook::new(vec![Split {
        new_shares: 2,
        old_shares: 1,
        ..later
    }])
    .unwrap()
    .adjust(&bars, 1)
    .unwrap();
    assert_eq!((forward[0].close, forward[0].volume), (-1, 2));
    let too_large = parse_csv(
        "time,open,high,low,close,volume\n-1,2000000000,2000000000,2000000000,2000000000,0",
    )
    .unwrap();
    assert!(SplitBook::new(vec![later])
        .unwrap()
        .adjust(&too_large, 1)
        .is_err());
}

#[test]
fn corporate_actions_reject_wrong_identity_bad_times_and_ambiguous_revisions() {
    assert!(parse_splits(ACTIONS, &Instrument::new("NYSE", "SPLIT").unwrap()).is_err());
    for text in [
        ACTIONS.replace("T14:20:00Z", "T14:14:59Z"),
        ACTIONS.replace("T14:20:00Z", "T14:20:00+00:00"),
        ACTIONS.replace(",2,1", ",0,1"),
        ACTIONS.replace(",2,1", ",1,1"),
        ACTIONS.replace(",2,1", ",1000001,1"),
        format!("{}{}", ACTIONS, ACTIONS.lines().nth(1).unwrap()),
    ] {
        assert!(parse_splits(&text, &instrument()).is_err(), "{text}");
    }
}
