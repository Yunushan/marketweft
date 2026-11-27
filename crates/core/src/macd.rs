use crate::{indicator, indicator::average_values, Average, MAX_BARS};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct MacdValue {
    pub line: Option<i64>,
    pub signal: Option<i64>,
    pub histogram: Option<i64>,
}

/// Returns MACD, its EMA signal and their difference in signed price millionths.
/// The first MACD value uses the complete slow EMA window. The signal needs a
/// full window of MACD values before its first output.
pub fn macd(
    fast: usize,
    slow: usize,
    signal: usize,
    closes: &[i64],
) -> Result<Vec<MacdValue>, String> {
    if [fast, slow, signal]
        .iter()
        .any(|period| !(1..=MAX_BARS).contains(period))
        || closes.len() > MAX_BARS
    {
        return Err("MACD periods must be 1–100,000 and histories at most 100,000 bars.".into());
    }
    if fast >= slow {
        return Err("The MACD fast period must be shorter than the slow period.".into());
    }
    let fast_values = indicator(Average::Exponential, fast, closes)?;
    let slow_values = average_values(Average::Exponential, slow, closes);
    let line: Vec<i64> = fast_values
        .into_iter()
        .zip(slow_values)
        .filter_map(|(fast, slow)| fast.zip(slow).map(|(fast, slow)| fast - slow))
        .collect();
    let signal = average_values(Average::Exponential, signal, &line);
    let mut rows = vec![MacdValue::default(); closes.len() - line.len()];
    rows.reserve(line.len());
    rows.extend(
        line.into_iter()
            .zip(signal)
            .map(|(line, signal)| MacdValue {
                line: Some(line),
                signal,
                histogram: signal.map(|signal| line - signal),
            }),
    );
    Ok(rows)
}
