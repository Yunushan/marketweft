use crate::{
    history::{validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS, SCALE,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct VortexValue {
    /// Unitless ratios encoded as millionths.
    pub positive: i128,
    pub negative: i128,
}

fn vortex_sample(prior: &Bar, current: &Bar) -> [i128; 3] {
    [
        i128::from((current.high - prior.low).abs()),
        i128::from((current.low - prior.high).abs()),
        i128::from(current.high.max(prior.close) - current.low.min(prior.close)),
    ]
}

/// Sum observed movement and true range over one full period of consecutive pairs.
/// The first bar and zero true-range windows have no value.
pub fn vortex_indicator(period: usize, bars: &[Bar]) -> Result<Vec<Option<VortexValue>>, String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err("Vortex requires a period of 1–100,000 and at most 100,000 bars.".into());
    }
    let mut results = Vec::with_capacity(bars.len());
    let mut totals = [0i128; 3];
    for (index, bar) in bars.iter().enumerate() {
        let prior = index.checked_sub(1).map(|before| &bars[before]);
        validate_bar_time(bar.time, prior.map(|prior| prior.time), index)?;
        validate_ohlcv(bar, index)?;
        if let Some(prior) = prior {
            for (sum, value) in totals.iter_mut().zip(vortex_sample(prior, bar)) {
                *sum += value;
            }
        }
        if index > period {
            let before = index - period;
            for (sum, value) in totals
                .iter_mut()
                .zip(vortex_sample(&bars[before - 1], &bars[before]))
            {
                *sum -= value;
            }
        }
        let [positive, negative, range] = totals;
        results.push((index >= period && range > 0).then(|| VortexValue {
            positive: rounded_div(positive * i128::from(SCALE), range),
            negative: rounded_div(negative * i128::from(SCALE), range),
        }));
    }
    Ok(results)
}

/// Normalize the signed open-to-close move by the observed bar's price range.
/// A zero high-low range has no value.
pub fn balance_of_power(bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    if bars.len() > MAX_BARS {
        return Err("Balance of Power supports at most 100,000 bars.".into());
    }
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            let previous = index.checked_sub(1).map(|before| bars[before].time);
            validate_bar_time(bar.time, previous, index)?;
            validate_ohlcv(bar, index)?;
            let range = bar.high - bar.low;
            Ok((range > 0).then(|| {
                rounded_div(
                    i128::from(bar.close - bar.open) * i128::from(SCALE),
                    i128::from(range),
                ) as i64
            }))
        })
        .collect()
}
