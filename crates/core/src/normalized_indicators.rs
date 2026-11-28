use crate::{
    average_true_range,
    indicator::{advance_ema, average_values, validate_close_window, Average},
    screen::rounded_div,
    Bar, MAX_BARS, SCALE,
};

fn percentage(numerator: i64, denominator: i64) -> Option<i128> {
    (denominator != 0).then(|| {
        rounded_div(
            i128::from(numerator) * i128::from(100 * SCALE) * i128::from(denominator.signum()),
            i128::from(denominator).abs(),
        )
    })
}

/// Wilder ATR as a percentage of the same bar's signed close.
/// Unavailable ATR and zero closes remain undefined.
pub fn normalized_average_true_range(
    period: usize,
    bars: &[Bar],
) -> Result<Vec<Option<i128>>, String> {
    Ok(average_true_range(period, bars)?
        .into_iter()
        .zip(bars)
        .map(|(range, bar)| range.and_then(|range| percentage(range, bar.close)))
        .collect())
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PpoValue {
    pub line: Option<i128>,
    pub signal: Option<i128>,
    pub histogram: Option<i128>,
}

/// EMA difference divided by the signed slow EMA, in millionths of a
/// percentage point. The signal restarts after each undefined line value.
pub fn percentage_price_oscillator(
    fast: usize,
    slow: usize,
    signal: usize,
    closes: &[i64],
) -> Result<Vec<PpoValue>, String> {
    validate_close_window(slow, closes)?;
    if fast == 0 || fast >= slow || !(1..=MAX_BARS).contains(&signal) {
        return Err(
            "PPO requires 1–100,000 bar periods and a fast period shorter than the slow period."
                .into(),
        );
    }
    let fast_values = average_values(Average::Exponential, fast, closes);
    let slow_values = average_values(Average::Exponential, slow, closes);
    let weight = signal as i128;
    let mut seed = 0;
    let mut count = 0;
    let mut average = None;
    Ok(fast_values
        .into_iter()
        .zip(slow_values)
        .map(|(fast, slow)| {
            let Some(line) = fast
                .zip(slow)
                .and_then(|(fast, slow)| percentage(fast - slow, slow))
            else {
                seed = 0;
                count = 0;
                average = None;
                return PpoValue::default();
            };
            if let Some(previous) = average {
                average = Some(advance_ema(previous, line, weight));
            } else {
                seed += line;
                count += 1;
                if count == signal {
                    average = Some(rounded_div(seed, weight));
                }
            }
            PpoValue {
                line: Some(line),
                signal: average,
                histogram: average.map(|value| line - value),
            }
        })
        .collect())
}
