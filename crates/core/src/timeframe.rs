use crate::{
    history::{valid_second, validate_ohlcv},
    replay, Bar, Session, MAX_BARS, MAX_TICKS,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TimeframeBar {
    pub bar: Bar,
    pub observed_bars: u32,
    pub expected_bars: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SessionTimeframeBar {
    pub bucket: TimeframeBar,
    pub close_time: i64,
    pub session_open: i64,
    pub early_close: bool,
}

fn validate_durations(source_seconds: u32, target_seconds: u32) -> Result<(), String> {
    if source_seconds == 0
        || target_seconds <= source_seconds
        || !target_seconds.is_multiple_of(source_seconds)
    {
        Err("Use a target interval that is a larger whole multiple of the source interval.".into())
    } else {
        Ok(())
    }
}

fn merge_bar(current: &mut TimeframeBar, bar: &Bar) -> Result<(), String> {
    let volume = current.bar.volume + bar.volume;
    if volume > MAX_TICKS {
        return Err("Aggregated volume exceeds the supported OHLCV range.".into());
    }
    current.bar.high = current.bar.high.max(bar.high);
    current.bar.low = current.bar.low.min(bar.low);
    current.bar.close = bar.close;
    current.bar.volume = volume;
    current.observed_bars += 1;
    Ok(())
}

/// Roll strictly ordered source opens into half-open, Unix-epoch-aligned UTC buckets.
/// Empty buckets are absent. Each nonempty bucket reports its source coverage.
pub fn aggregate_timeframe(
    bars: &[Bar],
    source_seconds: u32,
    target_seconds: u32,
) -> Result<Vec<TimeframeBar>, String> {
    validate_durations(source_seconds, target_seconds)?;
    if bars.len() > MAX_BARS {
        return Err("Timeframe input exceeds 100,000 source bars.".into());
    }

    let source = i64::from(source_seconds);
    let target = i64::from(target_seconds);
    let expected_bars = target_seconds / source_seconds;
    let mut previous = None;
    let mut rolled: Vec<TimeframeBar> = Vec::new();
    for (i, bar) in bars.iter().enumerate() {
        if !valid_second(bar.time) || bar.time.rem_euclid(source) != 0 {
            return Err(format!(
                "Source bar {} must start on the UTC source interval.",
                i + 1
            ));
        }
        if previous.is_some_and(|time| time >= bar.time) {
            return Err("Timeframe source timestamps must increase strictly.".into());
        }
        previous = Some(bar.time);

        validate_ohlcv(bar, i)?;

        let bucket = bar.time.div_euclid(target) * target;
        if let Some(current) = rolled
            .last_mut()
            .filter(|current| current.bar.time == bucket)
        {
            merge_bar(current, bar)?;
        } else {
            if !valid_second(bucket) {
                return Err(
                    "The aggregated bucket is outside the supported UTC date range.".into(),
                );
            }
            rolled.push(TimeframeBar {
                bar: Bar {
                    time: bucket,
                    ..*bar
                },
                observed_bars: 1,
                expected_bars,
            });
        }
    }
    Ok(rolled)
}

/// Roll source opens on each session's grid. Every nonempty target bucket closes
/// at the target boundary or at the supplied session close, whichever comes first.
pub fn aggregate_session_timeframe(
    bars: &[Bar],
    sessions: &[Session],
    source_seconds: u32,
    target_seconds: u32,
) -> Result<Vec<SessionTimeframeBar>, String> {
    validate_durations(source_seconds, target_seconds)?;
    if bars.len() > MAX_BARS
        || sessions
            .iter()
            .any(|session| !valid_second(session.open) || !valid_second(session.close))
    {
        return Err("Supply supported UTC sessions and up to 100,000 source bars.".into());
    }
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
    }
    let times: Vec<_> = bars.iter().map(|bar| bar.time).collect();
    let schedule = replay(sessions, &times, source_seconds)?;
    let source = i64::from(source_seconds);
    let target = i64::from(target_seconds);
    let mut rolled: Vec<SessionTimeframeBar> = Vec::new();
    for event in schedule {
        let Some(index) = event.bar_index else {
            continue;
        };
        let session = sessions[event.session_index];
        let open = session.open + (event.event_time - session.open) / target * target;
        let close_time = session.close.min(open + target);
        if let Some(current) = rolled
            .last_mut()
            .filter(|roll| roll.bucket.bar.time == open)
        {
            merge_bar(&mut current.bucket, &bars[index])?;
        } else {
            rolled.push(SessionTimeframeBar {
                bucket: TimeframeBar {
                    bar: Bar {
                        time: open,
                        ..bars[index]
                    },
                    observed_bars: 1,
                    expected_bars: ((close_time - open + source - 1) / source) as u32,
                },
                close_time,
                session_open: session.open,
                early_close: session.early_close,
            });
        }
    }
    Ok(rolled)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{parse_csv, parse_sessions};

    #[test]
    fn preserves_signed_extrema_fractional_volume_coverage_and_utc_boundaries() {
        let source = parse_csv(
            "time,open,high,low,close,volume\n-60,-4,0,-6,-1,0.1\n+60,1,4,-2,2,0.000001\n120,2,3,-8,-1,1.000001\n+180,5,7,4,6,2\n540,3,5,2,4,0",
        ).unwrap();
        let rolled = aggregate_timeframe(&source, 60, 180).unwrap();
        assert_eq!(
            rolled
                .iter()
                .map(|row| (row.bar.time, row.observed_bars, row.expected_bars))
                .collect::<Vec<_>>(),
            [(-180, 1, 3), (0, 2, 3), (180, 1, 3), (540, 1, 3)]
        );
        assert_eq!(
            rolled[1].bar,
            Bar {
                time: 0,
                open: 1_000_000,
                high: 4_000_000,
                low: -8_000_000,
                close: -1_000_000,
                volume: 1_000_002,
            }
        );
        assert_eq!(
            aggregate_timeframe(&source[..3], 60, 180).unwrap(),
            rolled[..2]
        );
    }

    #[test]
    fn rejects_misaligned_source_reordering_invalid_durations_and_excess_volume() {
        let mut source =
            parse_csv("time,open,high,low,close,volume\n0,1,1,1,1,2000000000\n60,2,2,2,2,0.000001")
                .unwrap();
        for (from, to) in [(0, 180), (60, 60), (60, 70)] {
            assert!(aggregate_timeframe(&source, from, to)
                .unwrap_err()
                .contains("multiple"));
        }
        assert!(aggregate_timeframe(&source, 60, 180)
            .unwrap_err()
            .contains("volume"));
        source[1].time += 1;
        assert!(aggregate_timeframe(&source, 60, 180)
            .unwrap_err()
            .contains("UTC source interval"));
        source[1].time = source[0].time;
        assert!(aggregate_timeframe(&source, 60, 180)
            .unwrap_err()
            .contains("increase strictly"));
    }

    #[test]
    fn resets_at_session_open_across_dst_and_caps_buckets_at_an_early_close() {
        let calendar = parse_sessions(concat!(
            "date,open_utc,close_utc,utc_offset_minutes,kind\n",
            "2025-10-31,2025-10-31T13:30:00Z,2025-10-31T20:00:00Z,-240,regular\n",
            "2025-11-03,2025-11-03T14:30:00Z,2025-11-03T21:00:00Z,-300,regular\n",
            "2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early",
        ))
        .unwrap();
        let bars = parse_csv(concat!(
            "time,open,high,low,close,volume\n",
            "2025-10-31T13:30:00Z,5,7,3,6,0.000001\n",
            "2025-10-31T14:30:00Z,6,8,1,7,0.000002\n",
            "2025-11-03T15:30:00Z,7,8,6,7,2\n",
            "2025-11-28T17:30:00Z,-1,3,-2,1,1",
        ))
        .unwrap();
        let rolled = aggregate_session_timeframe(&bars, &calendar, 3600, 7200).unwrap();
        assert_eq!(rolled.len(), 3);
        assert_eq!(
            rolled[0].bucket.bar,
            Bar {
                time: calendar[0].open,
                open: 5_000_000,
                high: 8_000_000,
                low: 1_000_000,
                close: 7_000_000,
                volume: 3,
            }
        );
        assert_eq!(rolled[0].close_time, calendar[0].open + 7200);
        assert_eq!(rolled[0].bucket.observed_bars, 2);
        assert_eq!(rolled[1].bucket.bar.time, calendar[1].open);
        assert_eq!(rolled[1].bucket.observed_bars, 1);
        assert_eq!(rolled[1].bucket.expected_bars, 2);
        assert_eq!(rolled[2].bucket.bar.time, calendar[2].open + 7200);
        assert_eq!(rolled[2].session_open, calendar[2].open);
        assert_eq!(rolled[2].close_time, calendar[2].close);
        assert_eq!(rolled[2].bucket.observed_bars, 1);
        assert_eq!(rolled[2].bucket.expected_bars, 2);
        assert!(rolled[2].early_close);
        assert_eq!(
            aggregate_session_timeframe(&bars[..2], &calendar, 3600, 7200).unwrap(),
            rolled[..1]
        );

        let mut off_grid = bars;
        off_grid[0].time += 60;
        assert!(
            aggregate_session_timeframe(&off_grid, &calendar, 3600, 7200)
                .unwrap_err()
                .contains("off the interval grid")
        );
    }
}
