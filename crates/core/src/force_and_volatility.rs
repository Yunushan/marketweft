use crate::{
    history::{validate_bar_time, validate_ohlcv},
    indicator::{advance_ema, average_values, Average},
    price_momentum::percent_change,
    screen::rounded_div,
    Bar, MAX_BARS, SCALE,
};

/// Smooth the signed close change times current volume with an exact EMA.
/// The EMA is seeded by the first full window of observed close pairs.
pub fn elder_force_index(period: usize, bars: &[Bar]) -> Result<Vec<Option<i128>>, String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err("Force Index requires a period of 1–100,000 and at most 100,000 bars.".into());
    }
    let mut results = vec![None; bars.len()];
    let mut seed = 0i128;
    let mut average = 0i128;
    let weight = period as i128;
    for (index, bar) in bars.iter().enumerate() {
        let prior = index.checked_sub(1).map(|before| &bars[before]);
        validate_bar_time(bar.time, prior.map(|prior| prior.time), index)?;
        validate_ohlcv(bar, index)?;
        let Some(prior) = prior else { continue };
        let force = i128::from(bar.close - prior.close) * i128::from(bar.volume);
        if index <= period {
            seed += force;
            if index < period {
                continue;
            }
            average = rounded_div(seed, weight);
        } else {
            average = advance_ema(average, force, weight);
        }
        results[index] = Some(rounded_div(average, i128::from(SCALE)));
    }
    Ok(results)
}

/// Measure the signed percentage change of the observed high-low range EMA.
/// A zero lagged range EMA has no percentage change.
pub fn chaikin_volatility(
    smoothing_period: usize,
    comparison_period: usize,
    bars: &[Bar],
) -> Result<Vec<Option<i128>>, String> {
    if [smoothing_period, comparison_period]
        .iter()
        .any(|period| !(1..=MAX_BARS).contains(period))
        || bars.len() > MAX_BARS
    {
        return Err(
            "Chaikin Volatility requires periods of 1–100,000 and at most 100,000 bars.".into(),
        );
    }
    let mut ranges = Vec::with_capacity(bars.len());
    for (index, bar) in bars.iter().enumerate() {
        let prior = index.checked_sub(1).map(|before| bars[before].time);
        validate_bar_time(bar.time, prior, index)?;
        validate_ohlcv(bar, index)?;
        ranges.push(bar.high - bar.low);
    }
    let averages = average_values(Average::Exponential, smoothing_period, &ranges);
    let mut results = vec![None; bars.len()];
    for index in comparison_period..bars.len() {
        results[index] = averages[index]
            .zip(averages[index - comparison_period])
            .and_then(|(current, baseline)| percent_change(current, baseline));
    }
    Ok(results)
}
