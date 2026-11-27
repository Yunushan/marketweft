use crate::{
    history::{validate_bar_time, validate_ohlcv},
    wilder::{rounded, update, PRECISION},
    Bar, MAX_BARS,
};

/// Wilder Average True Range in signed price units encoded as millionths.
/// The first bar uses its observed high minus low because no preceding close exists.
pub fn average_true_range(period: usize, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err("ATR periods must be 1–100,000 and histories at most 100,000 bars.".into());
    }
    let mut result = vec![None; bars.len()];
    let mut previous_time = None;
    let mut previous_close: Option<i64> = None;
    let mut total = 0;
    let mut average = 0;
    let weight = period as i128;
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);

        let range = previous_close.map_or(bar.high - bar.low, |close| {
            bar.high.max(close) - bar.low.min(close)
        });
        previous_close = Some(bar.close);
        let sample = i128::from(range) * PRECISION;
        if index < period {
            total += sample;
            if index + 1 < period {
                continue;
            }
            average = rounded(total, weight);
        } else {
            average = update(average, sample, weight);
        }
        result[index] = Some(rounded(average, PRECISION) as i64);
    }
    Ok(result)
}
