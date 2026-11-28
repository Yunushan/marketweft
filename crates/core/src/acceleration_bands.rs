use std::collections::VecDeque;

use crate::{
    history::{validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, PriceBand, MAX_BARS, SCALE,
};

/// Average the close and range-expanded high and low over observed bars.
/// Negative prices and an all-zero range leave a gap in every containing window.
pub fn acceleration_bands(period: usize, bars: &[Bar]) -> Result<Vec<Option<PriceBand>>, String> {
    if !(2..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err(
            "Acceleration Bands require a period of 2–100,000 and at most 100,000 bars.".into(),
        );
    }

    // Keep six additional decimal places while smoothing the scaled extremes.
    let precision = i128::from(SCALE);
    let denominator = period as i128 * precision;
    let mut window = VecDeque::<[i128; 3]>::new();
    let mut sums = [0; 3];
    let mut previous_time = None;
    let mut output = Vec::with_capacity(bars.len());
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);
        if bar.low < 0 || bar.high == 0 {
            window.clear();
            sums = [0; 3];
            output.push(None);
            continue;
        }

        let low = i128::from(bar.low);
        let high = i128::from(bar.high);
        let midpoint_twice = high + low;
        let spread = 4 * (high - low);
        let values = [
            rounded_div(low * (midpoint_twice - spread) * precision, midpoint_twice),
            i128::from(bar.close) * precision,
            rounded_div(high * (midpoint_twice + spread) * precision, midpoint_twice),
        ];
        if window.len() == period {
            for (sum, expired) in sums.iter_mut().zip(window.pop_front().unwrap()) {
                *sum -= expired;
            }
        }
        window.push_back(values);
        for (sum, value) in sums.iter_mut().zip(values) {
            *sum += value;
        }
        output.push((window.len() == period).then(|| {
            // With nonnegative OHLC, the upper projection is at most five times
            // the source price bound and the lower projection is at least -3 times it.
            let [lower, middle, upper] = sums.map(|sum| rounded_div(sum, denominator) as i64);
            PriceBand {
                lower,
                middle,
                upper,
            }
        }));
    }
    Ok(output)
}
