use std::cmp::Ordering;

use crate::{MAX_BARS, MAX_TICKS};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BollingerBand {
    pub lower: i64,
    pub middle: i64,
    pub upper: i64,
}

/// Normalize a rational number as its floor and a nonnegative remainder.
fn normalize(whole: i128, remainder: i128, denominator: i128) -> (i128, i128) {
    (
        whole + remainder.div_euclid(denominator),
        remainder.rem_euclid(denominator),
    )
}

struct Window {
    mean: i128,
    mean_remainder: i128,
    length: i128,
    denominator: i128,
    spread_squared: (i128, i128),
}

impl Window {
    fn new(sum: i128, squares: i128, length: i128) -> Self {
        let mean = sum / length;
        let mean_remainder = sum % length;

        // Square the two-standard-deviation spread using deviations from the
        // integer part of the mean. Dividing before scaling the remainder
        // avoids squaring the sum of a large window.
        let centered = squares - 2 * mean * sum + length * mean * mean;
        let numerator = 4 * centered;
        let denominator = 4 * length * length;
        let spread_squared = normalize(
            numerator / length,
            (numerator % length) * 4 * length - 16 * mean_remainder * mean_remainder,
            denominator,
        );
        Self {
            mean,
            mean_remainder,
            length,
            denominator,
            spread_squared,
        }
    }

    fn compare_band(&self, twice_boundary: i128, upper: bool) -> Ordering {
        let half_ticks = twice_boundary - 2 * self.mean;
        let correction = -2 * self.mean_remainder;
        let distance = half_ticks * self.length + correction;
        if upper && distance < 0 {
            return Ordering::Greater;
        }
        if !upper && distance > 0 {
            return Ordering::Less;
        }

        // The denominator is (2 * length)^2. Expand the square so its large
        // term can be divided by four before applying the common denominator.
        let square = half_ticks * half_ticks;
        let boundary_squared = normalize(
            square / 4,
            (square % 4) * self.length * self.length
                + 2 * half_ticks * self.length * correction
                + correction * correction,
            self.denominator,
        );
        let order = self.spread_squared.cmp(&boundary_squared);
        if upper {
            order
        } else {
            order.reverse()
        }
    }

    fn round_band(&self, candidate: i128, upper: bool) -> i64 {
        let right = 2 * candidate + 1;
        let right_order = self.compare_band(right, upper);
        if right_order == Ordering::Greater || right_order == Ordering::Equal && right > 0 {
            return (candidate + 1) as i64;
        }
        let left = 2 * candidate - 1;
        let left_order = self.compare_band(left, upper);
        if left_order == Ordering::Less || left_order == Ordering::Equal && left < 0 {
            return (candidate - 1) as i64;
        }
        candidate as i64
    }
}

/// Use a full window of closes and two population standard deviations.
/// Return exact millionths, rounded half away from zero only at the output.
pub fn bollinger_bands(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<BollingerBand>>, String> {
    if !(1..=MAX_BARS).contains(&period) || closes.len() > MAX_BARS {
        return Err(
            "Bollinger periods must be 1–100,000 and histories at most 100,000 bars.".into(),
        );
    }
    if closes
        .iter()
        .any(|close| !(-MAX_TICKS..=MAX_TICKS).contains(close))
    {
        return Err("A close is outside the supported fixed-point range.".into());
    }

    let length = period as i128;
    let mut result = vec![None; closes.len()];
    let mut sum = 0;
    let mut squares = 0;
    for (index, &close) in closes.iter().enumerate() {
        let close = i128::from(close);
        sum += close;
        squares += close * close;
        if index >= period {
            let expired = i128::from(closes[index - period]);
            sum -= expired;
            squares -= expired * expired;
        }
        if index + 1 >= period {
            let window = Window::new(sum, squares, length);
            let middle = sum.signum() * ((sum.abs() + length / 2) / length);
            let spread = window.spread_squared.0.isqrt();
            result[index] = Some(BollingerBand {
                lower: window.round_band(middle - spread, false),
                middle: middle as i64,
                upper: window.round_band(middle + spread, true),
            });
        }
    }
    Ok(result)
}
