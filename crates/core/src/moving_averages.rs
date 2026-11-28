use crate::{
    indicator::{exponential_tail, validate_close_window},
    screen::rounded_div,
    SCALE,
};

/// Apply weights 1 through the period to each full window from oldest to latest.
pub fn linearly_weighted_average(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<i64>>, String> {
    validate_close_window(period, closes)?;
    Ok(with_warmup(
        closes.len(),
        weighted_tail(period, closes)
            .into_iter()
            .map(|value| value as i64)
            .collect(),
    ))
}

/// Compute twice the first EMA minus the second EMA at the same observation.
pub fn double_exponential_moving_average(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<i64>>, String> {
    validate_close_window(period, closes)?;
    let first = exponential_tail(period, closes);
    let second = exponential_tail(period, &first);
    let aligned = first[first.len() - second.len()..].iter();
    let values = aligned
        .zip(second)
        .map(|(first, second)| 2 * first - second)
        .collect();
    Ok(with_warmup(closes.len(), values))
}

/// Combine three sequential EMAs at the same observation.
pub fn triple_exponential_moving_average(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<i64>>, String> {
    validate_close_window(period, closes)?;
    let first = exponential_tail(period, closes);
    let second = exponential_tail(period, &first);
    let third = exponential_tail(period, &second);
    let first = &first[first.len() - third.len()..];
    let second = &second[second.len() - third.len()..];
    let values = first
        .iter()
        .zip(second)
        .zip(third)
        .map(|((first, second), third)| 3 * (first - second) + third)
        .collect();
    Ok(with_warmup(closes.len(), values))
}

/// Smooth twice the half-window WMA minus the full-window WMA over the integer square-root window.
pub fn hull_moving_average(period: usize, closes: &[i64]) -> Result<Vec<Option<i64>>, String> {
    validate_close_window(period, closes)?;
    let short = weighted_tail((period / 2).max(1), closes);
    let long = weighted_tail(period, closes);
    let aligned = short[short.len() - long.len()..].iter();
    let difference: Vec<_> = aligned
        .zip(long)
        .map(|(short, long)| 2 * short - long)
        .collect();
    Ok(with_warmup(
        closes.len(),
        weighted_tail(period.isqrt(), &difference)
            .into_iter()
            .map(|value| value as i64)
            .collect(),
    ))
}

/// Express absolute movement divided by path length in millionths of a percent.
pub fn kaufman_efficiency_ratio(period: usize, closes: &[i64]) -> Result<Vec<Option<i64>>, String> {
    validate_close_window(period, closes)?;
    let mut values = vec![None; closes.len()];
    for (index, movement, path) in efficiency_windows(period, closes) {
        let ratio = if path == 0 {
            0
        } else {
            rounded_div(movement * 100 * i128::from(SCALE), path) as i64
        };
        values[index] = Some(ratio);
    }
    Ok(values)
}

/// Seed with an SMA and adapt using Kaufman's fast and slow EMA lengths of 2 and 30.
pub fn kaufman_adaptive_moving_average(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<i64>>, String> {
    validate_close_window(period, closes)?;
    let mut values = vec![None; closes.len()];
    let Some(seed) = closes.get(..period) else {
        return Ok(values);
    };
    let sum: i128 = seed.iter().copied().map(i128::from).sum();
    let mut average = rounded_div(sum, period as i128);
    values[period - 1] = Some(average as i64);
    const COEFFICIENT_SCALE: i128 = 1_000_000_000_000;
    const FAST_DENOMINATOR: i128 = 3;
    const SLOW_DENOMINATOR: i128 = 31;
    for (index, movement, path) in efficiency_windows(period, closes) {
        let root = if path == 0 {
            rounded_div(2 * COEFFICIENT_SCALE, SLOW_DENOMINATOR)
        } else {
            let weighted =
                path * FAST_DENOMINATOR + movement * (SLOW_DENOMINATOR - FAST_DENOMINATOR);
            rounded_div(
                2 * COEFFICIENT_SCALE * weighted,
                path * FAST_DENOMINATOR * SLOW_DENOMINATOR,
            )
        };
        let factor = rounded_div(root * root, COEFFICIENT_SCALE);
        average = rounded_div(
            average * COEFFICIENT_SCALE + (i128::from(closes[index]) - average) * factor,
            COEFFICIENT_SCALE,
        );
        values[index] = Some(average as i64);
    }
    Ok(values)
}

fn efficiency_windows(
    period: usize,
    closes: &[i64],
) -> impl Iterator<Item = (usize, i128, i128)> + '_ {
    let change = move |after: usize, before: usize| {
        (i128::from(closes[after]) - i128::from(closes[before])).abs()
    };
    let mut path = 0;
    (1..closes.len()).filter_map(move |index| {
        path += change(index, index - 1);
        if index > period {
            path -= change(index - period, index - period - 1);
        }
        (index >= period).then(|| (index, change(index, index - period), path))
    })
}

fn with_warmup(length: usize, values: Vec<i64>) -> Vec<Option<i64>> {
    let mut result = vec![None; length - values.len()];
    result.extend(values.into_iter().map(Some));
    result
}

pub(crate) fn weighted_tail<T: Copy + Into<i128>>(period: usize, values: &[T]) -> Vec<i128> {
    if period > values.len() {
        return Vec::new();
    }
    let weight = period as i128;
    let denominator = weight * (weight + 1) / 2;
    let mut sum = 0;
    let mut weighted = 0;
    for (index, &value) in values[..period].iter().enumerate() {
        let value = value.into();
        sum += value;
        weighted += (index as i128 + 1) * value;
    }
    let mut result = Vec::with_capacity(values.len() - period + 1);
    result.push(rounded_div(weighted, denominator));
    for index in period..values.len() {
        let value = values[index].into();
        // Moving the window reduces each retained coefficient by one.
        weighted += weight * value - sum;
        sum += value - values[index - period].into();
        result.push(rounded_div(weighted, denominator));
    }
    result
}
