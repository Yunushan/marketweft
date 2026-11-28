use crate::{
    history::{typical_sum, validate_bar_time, validate_ohlcv},
    price_momentum::percent_change,
    screen::{decimal_ratio, rounded_div},
    Bar, MAX_BARS,
};

/// Returns the close weighted by reported volume over each full observed window.
/// A window with no reported volume has no weighted average.
pub fn volume_weighted_average(period: usize, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    validate_period(period, bars)?;
    let mut previous_time = None;
    let mut total_volume = 0;
    let mut weighted_close = 0;
    let mut result = Vec::with_capacity(bars.len());
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);
        total_volume += i128::from(bar.volume);
        weighted_close += i128::from(bar.close) * i128::from(bar.volume);
        if let Some(expired) = index.checked_sub(period) {
            let old = &bars[expired];
            total_volume -= i128::from(old.volume);
            weighted_close -= i128::from(old.close) * i128::from(old.volume);
        }
        let value = if index + 1 >= period && total_volume != 0 {
            Some(rounded_div(weighted_close, total_volume) as i64)
        } else {
            None
        };
        result.push(value);
    }
    Ok(result)
}

fn validate_period(period: usize, bars: &[Bar]) -> Result<(), String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err(
            "Volume study periods must be 1–100,000 and histories at most 100,000 bars.".into(),
        );
    }
    Ok(())
}

/// Percentage change from the reported volume exactly one lookback earlier.
/// A zero baseline volume has no defined rate of change.
pub fn volume_rate_of_change(period: usize, bars: &[Bar]) -> Result<Vec<Option<i128>>, String> {
    validate_period(period, bars)?;
    let mut previous_time = None;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_ohlcv(bar, index)?;
            validate_bar_time(bar.time, previous_time, index)?;
            previous_time = Some(bar.time);
            Ok(index
                .checked_sub(period)
                .and_then(|prior| percent_change(bar.volume, bars[prior].volume)))
        })
        .collect()
}

/// Subtract the long simple volume average from the short simple volume
/// average, rounding the difference once to whole volume ticks.
pub fn volume_oscillator(
    fast: usize,
    slow: usize,
    bars: &[Bar],
) -> Result<Vec<Option<i64>>, String> {
    validate_period(fast, bars)?;
    validate_period(slow, bars)?;
    if fast >= slow {
        return Err(
            "The Volume Oscillator fast period must be shorter than the slow period.".into(),
        );
    }
    let (fast_weight, slow_weight) = (fast as i128, slow as i128);
    let mut fast_sum = 0_i128;
    let mut slow_sum = 0_i128;
    let mut previous_time = None;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_ohlcv(bar, index)?;
            validate_bar_time(bar.time, previous_time, index)?;
            previous_time = Some(bar.time);
            fast_sum += i128::from(bar.volume);
            slow_sum += i128::from(bar.volume);
            if let Some(expired) = index.checked_sub(fast) {
                fast_sum -= i128::from(bars[expired].volume);
            }
            if let Some(expired) = index.checked_sub(slow) {
                slow_sum -= i128::from(bars[expired].volume);
            }
            Ok((index + 1 >= slow).then(|| {
                rounded_div(
                    fast_sum * slow_weight - slow_sum * fast_weight,
                    fast_weight * slow_weight,
                ) as i64
            }))
        })
        .collect()
}

/// Returns the Money Flow Index in six-place percentage points. Direction is
/// the change in typical price. The absolute typical price determines the
/// flow magnitude, including for instruments that can have negative prices.
pub fn money_flow_index(period: usize, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    validate_period(period, bars)?;
    let mut positive = 0;
    let mut negative = 0;
    let mut previous_time = None;
    let mut previous_price = None;
    let mut flows = Vec::with_capacity(bars.len());
    let mut values = Vec::with_capacity(bars.len());
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);
        let typical = typical_sum(bar);
        // The factor of three in typical price cancels in the flow ratio.
        let flow = previous_price.map_or(0, |previous: i128| {
            (typical - previous).signum() * typical.abs() * i128::from(bar.volume)
        });
        previous_price = Some(typical);
        flows.push(flow);
        positive += flow.max(0);
        negative -= flow.min(0);
        if let Some(expired) = index.checked_sub(period) {
            positive -= flows[expired].max(0);
            negative += flows[expired].min(0);
        }
        let total = positive + negative;
        values.push(if index >= period && total != 0 {
            Some(decimal_ratio(positive, total, 8) as i64)
        } else {
            None
        });
    }
    Ok(values)
}
