use crate::{
    history::{validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS, SCALE,
};

// Retain fractional precision before weighting while keeping the largest
// supported rolling true range and scaled numerator within i128.
const RATIO_PRECISION: i128 = 10_000_000_000_000_000;
const WEIGHTS: [i128; 3] = [4, 2, 1];

fn components(previous: &Bar, current: &Bar) -> (i128, i128) {
    let bottom = current.low.min(previous.close);
    let top = current.high.max(previous.close);
    (i128::from(current.close - bottom), i128::from(top - bottom))
}

/// The Ultimate Oscillator in millionths of a percentage point. Each
/// pressure-to-true-range ratio uses its own complete observed-bar window.
pub fn ultimate_oscillator(
    short: usize,
    medium: usize,
    long: usize,
    bars: &[Bar],
) -> Result<Vec<Option<i64>>, String> {
    if short == 0 || short >= medium || medium >= long || long > MAX_BARS || bars.len() > MAX_BARS {
        return Err("Ultimate Oscillator periods must increase strictly within 1–100,000 bars, with at most 100,000 source bars.".into());
    }
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        let prior = index.checked_sub(1).map(|at| bars[at].time);
        validate_bar_time(bar.time, prior, index)?;
    }

    let mut totals = [(0, 0); 3];
    let mut values = vec![None; bars.len()];
    for index in 1..bars.len() {
        let (pressure, range) = components(&bars[index - 1], &bars[index]);
        for (period, (pressure_sum, range_sum)) in
            [short, medium, long].into_iter().zip(&mut totals)
        {
            *pressure_sum += pressure;
            *range_sum += range;
            if index > period {
                let expired = index - period;
                let (old_pressure, old_range) = components(&bars[expired - 1], &bars[expired]);
                *pressure_sum -= old_pressure;
                *range_sum -= old_range;
            }
        }
        if index >= long && totals.iter().all(|&(_, range)| range > 0) {
            let weighted: i128 = totals
                .into_iter()
                .zip(WEIGHTS)
                .map(|((pressure, range), weight)| {
                    weight * rounded_div(pressure * RATIO_PRECISION, range)
                })
                .sum();
            values[index] =
                Some(rounded_div(weighted * i128::from(100 * SCALE), 7 * RATIO_PRECISION) as i64);
        }
    }
    Ok(values)
}
