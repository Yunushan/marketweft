use crate::{
    history::{validate_bar_time, validate_ohlcv},
    Bar, MAX_BARS,
};

/// Return signed close-to-close differences in millionths of a price unit.
/// The first observation and the first observation after any gap are missing.
pub fn close_changes(interval_seconds: u32, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    if interval_seconds == 0 || bars.len() > MAX_BARS {
        return Err("Close changes require a positive interval and up to 100,000 bars.".into());
    }
    let seconds = i64::from(interval_seconds);
    let mut previous: Option<&Bar> = None;
    let mut changes = Vec::with_capacity(bars.len());
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous.map(|prior| prior.time), index)?;
        changes.push(
            previous
                .filter(|prior| bar.time - prior.time == seconds)
                .map(|prior| bar.close - prior.close),
        );
        previous = Some(bar);
    }
    Ok(changes)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct OpeningGap {
    pub prior_at: i64,
    pub prior_close: i64,
    pub difference: i64,
}

/// Compare each open with the preceding observed close, retaining its timestamp.
pub fn opening_gaps(bars: &[Bar]) -> Result<Vec<Option<OpeningGap>>, String> {
    if bars.len() > MAX_BARS {
        return Err("Opening gaps support up to 100,000 bars.".into());
    }
    let mut previous: Option<&Bar> = None;
    let mut gaps = Vec::with_capacity(bars.len());
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous.map(|prior| prior.time), index)?;
        gaps.push(previous.map(|prior| OpeningGap {
            prior_at: prior.time,
            prior_close: prior.close,
            difference: bar.open - prior.close,
        }));
        previous = Some(bar);
    }
    Ok(gaps)
}
