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
