use marketweft_core::{parse_csv, parse_sessions, session_relative_volume, SCALE};

const CALENDAR: &str = include_str!("fixtures/synthetic-session-volume-calendar.csv");
const BARS: &str = include_str!("fixtures/synthetic-session-volume-bars.csv");

#[test]
fn relative_volume_matches_duration_and_offset_across_dst_early_and_missing_sessions() {
    let sessions = parse_sessions(CALENDAR).unwrap();
    let bars = parse_csv(BARS).unwrap();
    let run =
        |lookback, known| session_relative_volume(&sessions, &bars, 60, lookback, known).unwrap();
    let result = run(2, i64::MAX);
    let evidence: Vec<_> = result
        .iter()
        .map(|point| {
            (
                point.previous_sessions,
                point.contributing_sessions,
                point.average_ticks.map(|value| value / SCALE),
                point.relative_ticks,
            )
        })
        .collect();
    assert_eq!(
        evidence,
        [
            (0, 0, None, None),
            (0, 0, None, None),
            (0, 0, None, None),
            (1, 1, Some(100), Some(3_000_000)),
            (1, 1, Some(400), Some(0)),
            (2, 2, Some(200), Some(0)),
            (2, 0, None, None),
            (2, 2, Some(150), Some(3_000_000)),
            (2, 0, None, None),
            (2, 1, Some(0), None),
            (2, 1, Some(450), Some(700_000)),
        ]
    );
    assert_eq!(result[6].offset_seconds, 60);
    assert_eq!(result[6].duration_seconds, 30);
    assert_eq!(result[6].observed_at, sessions[2].close);
    assert_eq!(run(1, i64::MAX)[7].average_ticks, Some(0));
    assert_eq!(run(1, i64::MAX)[10].average_ticks, None);
    for (index, point) in result.iter().enumerate() {
        assert_eq!(run(2, point.observed_at - 1), result[..index]);
        assert_eq!(run(2, point.observed_at), result[..=index]);
    }
    let mut off_grid = bars;
    off_grid[1].time += 1;
    assert!(session_relative_volume(&sessions, &off_grid, 60, 2, i64::MAX).is_err());
    assert!(session_relative_volume(&sessions, &off_grid, 60, 0, i64::MAX).is_err());
}
