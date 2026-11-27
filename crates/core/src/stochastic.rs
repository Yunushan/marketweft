use crate::{donchian_channels, screen::rounded_div, Bar, MAX_BARS, SCALE};

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
    let extrema = donchian_channels(lookback, bars)?;
    let raw: Vec<_> = bars
        .iter()
        .zip(extrema)
        .map(|(bar, extrema)| {
            let band = extrema?;
            let range = band.upper - band.lower;
            if range == 0 {
                return None;
            }
            let position = i128::from(bar.close - band.lower) * i128::from(100 * SCALE);
            Some(rounded_div(position, i128::from(range)) as i64)
        })
        .collect();
    let percent_k = smooth(smoothing, &raw);
    let percent_d = smooth(signal, &percent_k);
    Ok(percent_k
        .into_iter()
        .zip(percent_d)
        .map(|(percent_k, percent_d)| StochasticValue {
            percent_k,
            percent_d,
        })
        .collect())
}
