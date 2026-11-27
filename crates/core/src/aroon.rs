use crate::{donchian::rolling_extrema, screen::rounded_div, Bar, MAX_BARS, SCALE};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AroonValue {
    pub up: i64,
    pub down: i64,
    pub oscillator: i64,
}

/// Aroon Up, Down and Oscillator in millionths of a percentage point.
/// The window spans the current bar and one full period of preceding bars,
/// choosing the latest observation whenever an extreme is tied.
pub fn aroon(period: usize, bars: &[Bar]) -> Result<Vec<Option<AroonValue>>, String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err("Aroon periods must be 1–100,000 and histories at most 100,000 bars.".into());
    }
    let weight = period as i128;
    let scale = i128::from(100 * SCALE);
    let percentage = |age| rounded_div(age * scale, weight) as i64;
    rolling_extrema(period + 1, bars, |index, high, low| {
        let start = index - period;
        let up = (high - start) as i128;
        let down = (low - start) as i128;
        AroonValue {
            up: percentage(up),
            down: percentage(down),
            oscillator: percentage(up - down),
        }
    })
}
