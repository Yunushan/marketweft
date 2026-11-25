use marketweft_core::{indicator, parse_csv, parse_sessions, replay, Average, EventKind};

const CALENDAR: &str = include_str!("fixtures/nyse-2025-replay-sessions.csv");
const BARS: &str = include_str!("fixtures/nyse-2025-replay-ohlcv.csv");

fn utc(time: &str) -> i64 {
    parse_csv(&format!(
        "time,open,high,low,close,volume\n{time},0,0,0,0,0"
    ))
    .unwrap()[0]
        .time
}

#[test]
fn replay_covers_dst_early_close_and_missing_interval_without_future_bars() {
    let sessions = parse_sessions(CALENDAR).unwrap();
    let bars = parse_csv(BARS).unwrap();
    let times: Vec<_> = bars.iter().map(|bar| bar.time).collect();
    let events = replay(&sessions, &times, 1800).unwrap();
    assert_eq!((sessions.len(), bars.len(), events.len()), (20, 253, 294));
    assert_eq!(
        (
            sessions[0].open,
            sessions[0].close,
            sessions[0].utc_offset_minutes
        ),
        (
            utc("2025-10-31T13:30:00Z"),
            utc("2025-10-31T20:00:00Z"),
            -240
        )
    );
    assert_eq!(
        (
            sessions[1].open,
            sessions[1].close,
            sessions[1].utc_offset_minutes
        ),
        (
            utc("2025-11-03T14:30:00Z"),
            utc("2025-11-03T21:00:00Z"),
            -300
        )
    );
    assert_eq!(
        (
            sessions[19].open,
            sessions[19].close,
            sessions[19].early_close
        ),
        (
            utc("2025-11-28T14:30:00Z"),
            utc("2025-11-28T18:00:00Z"),
            true
        )
    );
    assert!(events
        .windows(2)
        .all(|pair| pair[0].observed_at <= pair[1].observed_at));
    let missing: Vec<_> = events
        .iter()
        .filter(|event| event.kind == EventKind::Missing)
        .collect();
    assert_eq!(missing.len(), 1);
    assert_eq!(
        (
            missing[0].event_time,
            missing[0].observed_at,
            missing[0].bar_index
        ),
        (
            utc("2025-11-03T15:00:00Z"),
            utc("2025-11-03T15:30:00Z"),
            None
        )
    );
    assert_eq!(events.last().unwrap().kind, EventKind::SessionClose);
    assert_eq!(events.last().unwrap().observed_at, sessions[19].close);
    assert_eq!(
        events
            .iter()
            .filter(|event| event.session_index == 19 && event.kind == EventKind::Bar)
            .count(),
        7
    );
    let holiday = utc("2025-11-27")..utc("2025-11-28");
    assert!(events
        .iter()
        .all(|event| !holiday.contains(&event.observed_at)));

    let closes: Vec<_> = bars.iter().map(|bar| bar.close).collect();
    let batch = [(Average::Simple, 20), (Average::Exponential, 9)]
        .map(|(kind, period)| (kind, period, indicator(kind, period, &closes).unwrap()));
    let mut prefix = Vec::new();
    for event in &events {
        if let Some(i) = event.bar_index {
            assert_eq!(event.kind, EventKind::Bar);
            assert_eq!(i, prefix.len());
            assert_eq!(event.event_time, times[i]);
            assert_eq!(event.observed_at, times[i] + 1800);
            prefix.push(bars[i].close);
        }
        for (kind, period, expected) in &batch {
            assert_eq!(
                indicator(*kind, *period, &prefix).unwrap(),
                expected[..prefix.len()]
            );
        }
    }
    assert_eq!(prefix, closes);
}

#[test]
fn invalid_inputs_fail_and_the_partial_slot_ends_at_close() {
    let header = CALENDAR.lines().next().unwrap();
    let sample = "2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early";
    let file = format!("{header}\n{sample}");
    let sessions = parse_sessions(&file).unwrap();
    for invalid in [
        format!("{file}\n{sample}"),
        file.replace("-300", "900"),
        file.replace("2025-11-28,", "2025-11-29,"),
        file.replace("T18:00:00Z", "T13:00:00Z"),
        file.replace(",early", ",holiday"),
        file.replace("T14:30:00Z", "T14:30:00+00:00"),
    ] {
        assert!(parse_sessions(&invalid).is_err(), "{invalid}");
    }
    let open = sessions[0].open;
    for times in [
        vec![open - 1],
        vec![open + 1],
        vec![sessions[0].close],
        vec![open, open],
    ] {
        assert!(replay(&sessions, &times, 3600).is_err(), "{times:?}");
    }
    assert!(replay(&sessions, &[], 0).is_err());
    let clipped = replay(&sessions, &[open, open + 10_800], 3600).unwrap();
    assert_eq!(clipped[4].kind, EventKind::Bar);
    assert_eq!(clipped[4].observed_at, sessions[0].close);
    assert!(replay(&parse_sessions(CALENDAR).unwrap(), &[], 1)
        .unwrap_err()
        .contains("200,000"));
}
