use crate::{
    donchian::RollingExtrema,
    range_position::{rolling_close_position, RangeAnchor},
    relative_strength_index,
    screen::rounded_div,
    Bar, MAX_BARS, SCALE,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StochasticValue {
    pub percent_k: Option<i64>,
    pub percent_d: Option<i64>,
}

fn smooth(period: usize, values: &[Option<i64>]) -> Vec<Option<i64>> {
    let mut sum = 0;
    let mut available = 0;
    values
        .iter()
        .enumerate()
        .map(|(index, value)| {
            if let Some(value) = value {
                sum += value;
                available += 1;
            }
            if let Some(expired) = index.checked_sub(period).and_then(|old| values[old]) {
                sum -= expired;
                available -= 1;
            }
            if available == period {
                Some((sum + period as i64 / 2) / period as i64)
            } else {
                None
            }
        })
        .collect()
}

/// Returns the full stochastic oscillator in millionths of a percentage point.
/// Each smoothing step requires a complete window of defined observations.
pub fn stochastic_oscillator(
    lookback: usize,
    smoothing: usize,
    signal: usize,
    bars: &[Bar],
) -> Result<Vec<StochasticValue>, String> {
    if [lookback, smoothing, signal]
        .iter()
        .any(|period| !(1..=MAX_BARS).contains(period))
        || bars.len() > MAX_BARS
    {
        return Err(
            "Stochastic periods must be 1–100,000 and histories at most 100,000 bars.".into(),
        );
    }
    let raw = rolling_close_position(lookback, RangeAnchor::Low, bars)?;
    Ok(smooth_rows(smoothing, signal, &raw))
}

/// Normalize Wilder RSI against its complete observed range, then apply two
/// smoothing windows. An unchanged RSI range leaves the result undefined.
pub fn stochastic_rsi(
    rsi_period: usize,
    lookback: usize,
    smoothing: usize,
    signal: usize,
    closes: &[i64],
) -> Result<Vec<StochasticValue>, String> {
    if [lookback, smoothing, signal]
        .iter()
        .any(|period| !(1..=MAX_BARS).contains(period))
    {
        return Err("Stochastic RSI lookback and smoothing periods must be 1–100,000.".into());
    }
    let rsi = relative_strength_index(rsi_period, closes)?;
    let start = rsi_period.min(rsi.len());
    let completed = &rsi[start..];
    let value = |index: usize| completed[index].expect("Wilder RSI is defined after warm-up");
    let mut extrema = RollingExtrema::default();
    let mut raw = vec![None; start];
    raw.extend((0..completed.len()).map(|index| {
        let (high, low) = extrema.advance(lookback, index, value, value)?;
        let minimum = value(low);
        let range = value(high) - minimum;
        (range > 0).then(|| {
            rounded_div(
                i128::from(value(index) - minimum) * i128::from(100 * SCALE),
                i128::from(range),
            ) as i64
        })
    }));
    Ok(smooth_rows(smoothing, signal, &raw))
}

fn smooth_rows(smoothing: usize, signal: usize, raw: &[Option<i64>]) -> Vec<StochasticValue> {
    let percent_k = smooth(smoothing, raw);
    let percent_d = smooth(signal, &percent_k);
    percent_k
        .into_iter()
        .zip(percent_d)
        .map(|(percent_k, percent_d)| StochasticValue {
            percent_k,
            percent_d,
        })
        .collect()
}
