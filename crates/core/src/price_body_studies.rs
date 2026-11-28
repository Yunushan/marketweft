use crate::{
    history::{validate_bar_time, validate_ohlcv},
    indicator::{average_values, Average},
    screen::rounded_div,
    Bar, MAX_BARS, SCALE,
};

fn validate_history(bars: &[Bar]) -> Result<(), String> {
    if bars.len() > MAX_BARS {
        return Err("Study histories must fit within 100,000 bars.".into());
    }
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(
            bar.time,
            index.checked_sub(1).map(|prior| bars[prior].time),
            index,
        )?;
    }
    Ok(())
}

/// Simple average of close minus open in signed price millionths.
pub fn qstick(period: usize, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    if !(1..=MAX_BARS).contains(&period) {
        return Err("Qstick periods must be 1–100,000 bars.".into());
    }
    validate_history(bars)?;
    let bodies: Vec<_> = bars.iter().map(|bar| bar.close - bar.open).collect();
    Ok(average_values(Average::Simple, period, &bodies))
}

/// Price-only Williams accumulation/distribution, starting at zero and
/// incorporating price gaps through the true range boundaries.
pub fn williams_accumulation_distribution(bars: &[Bar]) -> Result<Vec<Option<i128>>, String> {
    validate_history(bars)?;
    let mut running = 0;
    let mut output = vec![Some(0); bars.len()];
    for (pair, value) in bars.windows(2).zip(output.iter_mut().skip(1)) {
        let before = pair[0].close;
        let current = pair[1];
        running += i128::from(match current.close.cmp(&before) {
            std::cmp::Ordering::Greater => current.close - current.low.min(before),
            std::cmp::Ordering::Less => current.close - current.high.max(before),
            std::cmp::Ordering::Equal => 0,
        });
        *value = Some(running);
    }
    Ok(output)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CenterOfGravityValue {
    pub line: Option<i128>,
    pub signal: Option<i128>,
}

/// Negated price-weighted bar position using midpoint prices. The current
/// bar has position one. The previous bar's line is the trigger.
pub fn center_of_gravity(period: usize, bars: &[Bar]) -> Result<Vec<CenterOfGravityValue>, String> {
    if !(2..=MAX_BARS).contains(&period) {
        return Err("Center of Gravity periods must be 2–100,000 bars.".into());
    }
    validate_history(bars)?;
    let twice_midpoint = |bar: &Bar| i128::from(bar.high) + i128::from(bar.low);
    let mut sum = 0;
    let mut weighted = 0;
    let mut prior_line = None;
    Ok(bars
        .iter()
        .enumerate()
        .map(|(index, bar)| {
            let price = twice_midpoint(bar);
            sum += price;
            weighted += sum;
            if let Some(expired) = index.checked_sub(period) {
                let price = twice_midpoint(&bars[expired]);
                sum -= price;
                weighted -= (period as i128 + 1) * price;
            }
            let line = (index + 1 >= period && sum != 0)
                .then(|| rounded_div(-weighted * i128::from(SCALE) * sum.signum(), sum.abs()));
            let output = CenterOfGravityValue {
                line,
                signal: prior_line,
            };
            prior_line = line;
            output
        })
        .collect())
}
