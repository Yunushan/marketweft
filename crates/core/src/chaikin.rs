use crate::{
    cumulative_volume, indicator::advance_ema, screen::rounded_div, Bar, CumulativeVolume,
    MAX_BARS, SCALE,
};

/// Returns Chaikin Money Flow in signed millionths of a percentage point.
/// A full window of observed bars and nonzero reported volume are required.
pub fn chaikin_money_flow(period: usize, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err(
            "Chaikin Money Flow periods and histories must fit within 100,000 bars.".into(),
        );
    }
    let cumulative = cumulative_volume(bars)?;
    let mut volume = 0;
    Ok(bars
        .iter()
        .zip(&cumulative)
        .enumerate()
        .map(|(index, (bar, flow))| {
            volume += i128::from(bar.volume);
            let prior_flow = if let Some(expired) = index.checked_sub(period) {
                volume -= i128::from(bars[expired].volume);
                cumulative[expired].accumulation_distribution
            } else {
                0
            };
            if index + 1 < period || volume == 0 {
                return None;
            }
            let window_flow = flow.accumulation_distribution - prior_flow;
            Some(rounded_div(window_flow * i128::from(100 * SCALE), volume) as i64)
        })
        .collect())
}

fn wide_ema(period: usize, values: &[CumulativeVolume]) -> Vec<Option<i128>> {
    let mut result = vec![None; values.len()];
    let Some(window) = values.get(..period) else {
        return result;
    };
    let weight = period as i128;
    let sum = window.iter().map(|row| row.accumulation_distribution).sum();
    let mut previous = rounded_div(sum, weight);
    result[period - 1] = Some(previous);
    for (value, result) in values[period..].iter().zip(&mut result[period..]) {
        previous = advance_ema(previous, value.accumulation_distribution, weight);
        *result = Some(previous);
    }
    result
}

/// Returns the fast EMA of the Accumulation/Distribution Line minus its
/// slow EMA, in signed millionths of a volume unit.
pub fn chaikin_oscillator(
    fast: usize,
    slow: usize,
    bars: &[Bar],
) -> Result<Vec<Option<i128>>, String> {
    if [fast, slow]
        .iter()
        .any(|period| !(1..=MAX_BARS).contains(period))
        || bars.len() > MAX_BARS
    {
        return Err(
            "Chaikin Oscillator periods and histories must fit within 100,000 bars.".into(),
        );
    }
    if fast >= slow {
        return Err(
            "The Chaikin Oscillator fast period must be shorter than the slow period.".into(),
        );
    }
    let cumulative = cumulative_volume(bars)?;
    let fast_values = wide_ema(fast, &cumulative);
    let slow_values = wide_ema(slow, &cumulative);
    Ok(fast_values
        .into_iter()
        .zip(slow_values)
        .map(|(fast, slow)| fast.zip(slow).map(|(fast, slow)| fast - slow))
        .collect())
}
