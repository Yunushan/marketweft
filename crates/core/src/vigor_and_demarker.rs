use crate::{
    history::{validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS, SCALE,
};

const PERCENT_SCALE: i128 = 100 * SCALE as i128;
const SYMMETRIC_WEIGHTS: [i128; 4] = [1, 2, 2, 1];

/// Compare the sums of rising highs and falling lows across observed pairs.
pub fn demarker(period: usize, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    validate_history(period, bars)?;
    let changes = |before: &Bar, after: &Bar| {
        (
            i128::from((after.high - before.high).max(0)),
            i128::from((before.low - after.low).max(0)),
        )
    };
    let mut rise = 0;
    let mut fall = 0;
    let mut values = vec![None; bars.len()];
    for index in 1..bars.len() {
        let (up, down) = changes(&bars[index - 1], &bars[index]);
        rise += up;
        fall += down;
        if index > period {
            let expired = index - period;
            let (up, down) = changes(&bars[expired - 1], &bars[expired]);
            rise -= up;
            fall -= down;
        }
        if index >= period && rise + fall > 0 {
            values[index] = Some(rounded_div(rise * PERCENT_SCALE, rise + fall) as i64);
        }
    }
    Ok(values)
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RelativeVigorValue {
    /// Signed millionths of a percentage point.
    pub vigor: Option<i64>,
    pub signal: Option<i64>,
}

/// Smooth four-bar weighted bodies and ranges, then compare the two sums.
pub fn relative_vigor(period: usize, bars: &[Bar]) -> Result<Vec<RelativeVigorValue>, String> {
    validate_history(period, bars)?;
    let mut body_sum = 0;
    let mut range_sum = 0;
    let mut values = vec![RelativeVigorValue::default(); bars.len()];
    for (start, window) in bars.windows(4).enumerate() {
        let (body, range) = weighted_components(window);
        body_sum += body;
        range_sum += range;
        if let Some(expired) = start.checked_sub(period) {
            let (body, range) = weighted_components(&bars[expired..expired + 4]);
            body_sum -= body;
            range_sum -= range;
        }
        if start + 1 >= period && range_sum > 0 {
            values[start + 3].vigor = Some(rounded_div(body_sum * PERCENT_SCALE, range_sum) as i64);
        }
    }
    for index in 3..values.len() {
        let sum = values[index - 3..=index]
            .iter()
            .zip(SYMMETRIC_WEIGHTS)
            .try_fold(0, |sum, (row, weight)| {
                Some(sum + i128::from(row.vigor?) * weight)
            });
        values[index].signal = sum.map(|weighted| rounded_div(weighted, 6) as i64);
    }
    Ok(values)
}

fn weighted_components(bars: &[Bar]) -> (i128, i128) {
    bars.iter()
        .zip(SYMMETRIC_WEIGHTS)
        .fold((0, 0), |(body, range), (bar, weight)| {
            (
                body + i128::from(bar.close - bar.open) * weight,
                range + i128::from(bar.high - bar.low) * weight,
            )
        })
}

fn validate_history(period: usize, bars: &[Bar]) -> Result<(), String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err(
            "Indicator periods must be 1–100,000 and histories at most 100,000 bars.".into(),
        );
    }
    for (index, bar) in bars.iter().enumerate() {
        let prior = index.checked_sub(1).map(|before| bars[before].time);
        validate_bar_time(bar.time, prior, index)?;
        validate_ohlcv(bar, index)?;
    }
    Ok(())
}
