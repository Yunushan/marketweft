use crate::{
    indicator::{exponential_tail, validate_close_window},
    screen::rounded_div,
};

/// Apply weights 1 through the period to each full window from oldest to latest.
pub fn linearly_weighted_average(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<i64>>, String> {
    validate_close_window(period, closes)?;
    Ok(with_warmup(closes.len(), weighted_tail(period, closes)))
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
        weighted_tail(period.isqrt(), &difference),
    ))
}

fn with_warmup(length: usize, values: Vec<i64>) -> Vec<Option<i64>> {
    let mut result = vec![None; length - values.len()];
    result.extend(values.into_iter().map(Some));
    result
}

fn weighted_tail(period: usize, values: &[i64]) -> Vec<i64> {
    if period > values.len() {
        return Vec::new();
    }
    let weight = period as i128;
    let denominator = weight * (weight + 1) / 2;
    let mut sum = 0;
    let mut weighted = 0;
    for (index, &value) in values[..period].iter().enumerate() {
        let value = i128::from(value);
        sum += value;
        weighted += (index as i128 + 1) * value;
    }
    let mut result = Vec::with_capacity(values.len() - period + 1);
    result.push(rounded_div(weighted, denominator) as i64);
    for index in period..values.len() {
        let value = i128::from(values[index]);
        // Moving the window reduces each retained coefficient by one.
        weighted += weight * value - sum;
        sum += value - i128::from(values[index - period]);
        result.push(rounded_div(weighted, denominator) as i64);
    }
    result
}
