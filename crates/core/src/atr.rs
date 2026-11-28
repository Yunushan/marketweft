use crate::{
    history::{validate_bar_time, validate_ohlcv},
    wilder::{rounded, update, PRECISION},
    Bar, MAX_BARS,
};

pub(crate) fn true_range(bar: &Bar, previous: Option<i64>) -> i64 {
    previous.map_or(bar.high - bar.low, |close| {
        bar.high.max(close) - bar.low.min(close)
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TrueRangePoint {
    pub range_ticks: i64,
    /// The preceding observed bar's UTC time and close in price millionths.
    pub prior_close: Option<(i64, i64)>,
}

/// True Range at each observed bar with the previous close used in the calculation.
pub fn observed_true_ranges(bars: &[Bar]) -> Result<Vec<TrueRangePoint>, String> {
    if bars.len() > MAX_BARS {
        return Err("True Range supports up to 100,000 observed bars.".into());
    }
    let mut previous: Option<&Bar> = None;
    let mut output = Vec::with_capacity(bars.len());
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous.map(|prior| prior.time), index)?;
        output.push(TrueRangePoint {
            range_ticks: true_range(bar, previous.map(|prior| prior.close)),
            prior_close: previous.map(|prior| (prior.time, prior.close)),
        });
        previous = Some(bar);
    }
    Ok(output)
}

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

        let range = true_range(bar, previous_close);
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
