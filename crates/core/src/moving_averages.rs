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

/// Use a symmetric triangular window and round once after summing exact weights.
pub fn triangular_moving_average(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<i64>>, String> {
    validate_close_window(period, closes)?;
    if closes.len() < period {
        return Ok(vec![None; closes.len()]);
    }
    let shorter = period.div_ceil(2);
    let longer = period / 2 + 1;
    let mut sum: i128 = closes[..shorter].iter().copied().map(i128::from).sum();
    let mut subtotals = vec![sum];
    subtotals.extend(
        closes[shorter..]
            .iter()
            .zip(closes)
            .map(|(&added, &removed)| {
                sum += i128::from(added) - i128::from(removed);
                sum
            }),
    );
    let divisor = shorter as i128 * longer as i128;
    let mut weighted_sum: i128 = subtotals[..longer].iter().sum();
    let mut values = vec![rounded_div(weighted_sum, divisor) as i64];
    values.extend(
        subtotals[longer..]
            .iter()
            .zip(&subtotals)
            .map(|(&added, &removed)| {
                weighted_sum += added - removed;
                rounded_div(weighted_sum, divisor) as i64
            }),
    );
    Ok(with_warmup(closes.len(), values))
}

/// Combine six EMA stages using Tillson's factor in whole basis points.
pub fn tillson_t3(
    period: usize,
    factor_basis_points: u32,
    closes: &[i64],
) -> Result<Vec<Option<i64>>, String> {
    validate_close_window(period, closes)?;
    const WHOLE: u32 = 10_000;
    if factor_basis_points > WHOLE {
        return Err("Use a T3 factor from 0 to 10,000 basis points.".into());
    }
    let first = exponential_tail(period, closes);
    let second = exponential_tail(period, &first);
    let third = exponential_tail(period, &second);
    let fourth = exponential_tail(period, &third);
    let fifth = exponential_tail(period, &fourth);
    let sixth = exponential_tail(period, &fifth);
    let factor = i128::from(factor_basis_points);
    let combined = i128::from(WHOLE) + factor;
    let coefficients = [
        combined.pow(3),
        -3 * factor * combined.pow(2),
        3 * factor.pow(2) * combined,
        -factor.pow(3),
    ];
    let length = sixth.len();
    let aligned = [&third, &fourth, &fifth, &sixth].map(|stage| &stage[stage.len() - length..]);
    let divisor = i128::from(WHOLE).pow(3);
    let values = (0..length)
        .map(|index| {
            let weighted = coefficients
                .iter()
                .zip(aligned)
                .map(|(coefficient, stage)| coefficient * i128::from(stage[index]))
                .sum();
            rounded_div(weighted, divisor) as i64
        })
        .collect();
    Ok(with_warmup(closes.len(), values))
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
