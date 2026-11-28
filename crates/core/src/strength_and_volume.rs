use crate::{
    history::{typical_sum, validate_bar_time, validate_ohlcv},
    indicator::{validate_close_window, WindowEma},
    screen::rounded_div,
    wilder::PRECISION,
    Bar, MAX_BARS, SCALE,
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct OscillatorSignal {
    pub line: Option<i64>,
    pub signal: Option<i64>,
}

fn settings(fast: usize, slow: usize, signal: usize, length: usize) -> Result<(), String> {
    if fast == 0
        || fast >= slow
        || slow > MAX_BARS
        || !(1..=MAX_BARS).contains(&signal)
        || length > MAX_BARS
    {
        return Err(
            "Use 1–100,000 bar periods and a fast period shorter than the slow period.".into(),
        );
    }
    Ok(())
}

/// Double-smoothed change divided by double-smoothed absolute change, in
/// signed millionths of a percentage point.
pub fn true_strength_index(
    fast: usize,
    slow: usize,
    signal_period: usize,
    closes: &[i64],
) -> Result<Vec<OscillatorSignal>, String> {
    validate_close_window(slow, closes)?;
    settings(fast, slow, signal_period, closes.len())?;
    let mut slow_change = WindowEma::default();
    let mut slow_size = WindowEma::default();
    let mut fast_change = WindowEma::default();
    let mut fast_size = WindowEma::default();
    let mut signal = WindowEma::default();
    let mut result = vec![OscillatorSignal::default(); closes.len()];
    for (pair, output) in closes.windows(2).zip(result.iter_mut().skip(1)) {
        let change = (i128::from(pair[1]) - i128::from(pair[0])) * PRECISION;
        let line = slow_change
            .push(change, slow)
            .zip(slow_size.push(change.abs(), slow))
            .and_then(|(change, size)| {
                fast_change
                    .push(change, fast)
                    .zip(fast_size.push(size, fast))
            })
            .and_then(|(change, size)| {
                (size != 0).then(|| rounded_div(change * i128::from(100 * SCALE), size))
            });
        if let Some(line) = line {
            *output = OscillatorSignal {
                line: Some(line as i64),
                signal: signal.push(line, signal_period).map(|value| value as i64),
            };
        } else {
            signal = WindowEma::default();
        }
    }
    Ok(result)
}

/// Klinger volume oscillator and signal, in signed millionths of a volume
/// unit. An unchanged high-low-close sum retains the established direction.
pub fn klinger_oscillator(
    fast: usize,
    slow: usize,
    signal_period: usize,
    bars: &[Bar],
) -> Result<Vec<OscillatorSignal>, String> {
    settings(fast, slow, signal_period, bars.len())?;
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(
            bar.time,
            index.checked_sub(1).map(|prior| bars[prior].time),
            index,
        )?;
    }
    let mut fast_force = WindowEma::default();
    let mut slow_force = WindowEma::default();
    let mut signal = WindowEma::default();
    let mut direction = 0;
    let mut cumulative_range = 0;
    let mut result = vec![OscillatorSignal::default(); bars.len()];
    for (pair, output) in bars.windows(2).zip(result.iter_mut().skip(1)) {
        let [before, current] = [&pair[0], &pair[1]];
        let move_direction = (typical_sum(current) - typical_sum(before)).signum();
        let current_range = i128::from(current.high) - i128::from(current.low);
        if move_direction != 0 && move_direction != direction {
            direction = move_direction;
            cumulative_range = i128::from(before.high) - i128::from(before.low);
        }
        if direction == 0 {
            continue;
        }
        cumulative_range += current_range;
        let force = if cumulative_range == 0 {
            0
        } else {
            let difference = (2 * current_range - cumulative_range).abs();
            rounded_div(
                i128::from(current.volume) * difference * 100 * direction,
                cumulative_range,
            )
        };
        if let Some((fast, slow)) = fast_force
            .push(force, fast)
            .zip(slow_force.push(force, slow))
        {
            let line = fast - slow;
            *output = OscillatorSignal {
                line: Some(line as i64),
                signal: signal.push(line, signal_period).map(|value| value as i64),
            };
        }
    }
    Ok(result)
}
