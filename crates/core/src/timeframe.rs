use crate::{history::valid_second, Bar, MAX_BARS, MAX_TICKS};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TimeframeBar {
    pub bar: Bar,
    pub observed_bars: u32,
    pub expected_bars: u32,
}

/// Roll strictly ordered source opens into half-open, Unix-epoch-aligned UTC buckets.
/// Empty buckets are absent. Each nonempty bucket reports its source coverage.
pub fn aggregate_timeframe(
    bars: &[Bar],
    source_seconds: u32,
    target_seconds: u32,
) -> Result<Vec<TimeframeBar>, String> {
    if source_seconds == 0
        || target_seconds <= source_seconds
        || !target_seconds.is_multiple_of(source_seconds)
    {
        return Err(
            "Use a target interval that is a larger whole multiple of the source interval.".into(),
        );
    }
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

        if [bar.open, bar.high, bar.low, bar.close]
            .iter()
            .any(|price| !(-MAX_TICKS..=MAX_TICKS).contains(price))
            || !(0..=MAX_TICKS).contains(&bar.volume)
            || bar.low > bar.open.min(bar.close)
            || bar.high < bar.open.max(bar.close)
        {
            return Err(format!("Source bar {} has invalid OHLCV values.", i + 1));
        }

        let bucket = bar.time.div_euclid(target) * target;
        if let Some(current) = rolled
            .last_mut()
            .filter(|current| current.bar.time == bucket)
        {
            current.bar.high = current.bar.high.max(bar.high);
            current.bar.low = current.bar.low.min(bar.low);
            current.bar.close = bar.close;
            current.bar.volume += bar.volume;
            if current.bar.volume > MAX_TICKS {
                return Err("Aggregated volume exceeds the supported OHLCV range.".into());
            }
            current.observed_bars += 1;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse_csv;

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
}
