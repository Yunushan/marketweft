use crate::{
    history::{validate_bar_time, validate_ohlcv},
    screen::rounded_div,
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

fn typical_sum(bar: &Bar) -> i128 {
    i128::from(bar.high) + i128::from(bar.low) + i128::from(bar.close)
}

fn index_ticks(positive: i128, total: i128) -> i64 {
    let mut quotient = positive / total;
    let mut remainder = positive % total;
    // Read eight decimal digits to obtain six-place percentage points without
    // multiplying the whole money flow by 100 million. The bounds on price,
    // volume and history length leave room for one decimal digit at a time.
    for _ in 0..8 {
        remainder *= 10;
        quotient = quotient * 10 + remainder / total;
        remainder %= total;
    }
    (quotient + i128::from(2 * remainder >= total)) as i64
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
            Some(index_ticks(positive, total))
        } else {
            None
        });
    }
    Ok(values)
}
