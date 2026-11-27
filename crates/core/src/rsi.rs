use crate::{MAX_BARS, MAX_TICKS, SCALE};

// Keep twelve additional decimal places in the smoothed price-tick averages.
// All intermediates, including a full window of maximum signed changes, fit in i128.
const PRECISION: i128 = 1_000_000_000_000;

fn rounded(numerator: i128, denominator: i128) -> i128 {
    (numerator + denominator / 2) / denominator
}

fn gain_and_loss(previous: i64, close: i64) -> (i128, i128) {
    let change = i128::from(close - previous) * PRECISION;
    (change.max(0), (-change).max(0))
}

fn score(gain: i128, loss: i128) -> i64 {
    if gain == 0 && loss == 0 {
        return 50 * SCALE;
    }
    rounded(gain * i128::from(100 * SCALE), gain + loss) as i64
}

/// Wilder RSI on confirmed closes. The first value follows one full window of changes.
/// Results use millionths of a point on a zero-to-one-hundred scale.
pub fn relative_strength_index(period: usize, closes: &[i64]) -> Result<Vec<Option<i64>>, String> {
    if !(2..=MAX_BARS).contains(&period) || closes.len() > MAX_BARS {
        return Err("RSI periods must be 2–100,000 and histories at most 100,000 bars.".into());
    }
    if closes.iter().any(|c| !(-MAX_TICKS..=MAX_TICKS).contains(c)) {
        return Err("A close is outside the supported fixed-point range.".into());
    }
    let mut result = vec![None; closes.len()];
    if closes.len() <= period {
        return Ok(result);
    }

    let mut gain = 0;
    let mut loss = 0;
    for closes in closes[..=period].windows(2) {
        let (up, down) = gain_and_loss(closes[0], closes[1]);
        gain += up;
        loss += down;
    }
    let weight = period as i128;
    gain = rounded(gain, weight);
    loss = rounded(loss, weight);
    let mut value = score(gain, loss);
    result[period] = Some(value);
    for index in (period + 1)..closes.len() {
        let (up, down) = gain_and_loss(closes[index - 1], closes[index]);
        gain = rounded(gain * (weight - 1) + up, weight);
        loss = rounded(loss * (weight - 1) + down, weight);
        // Flat closes decay both averages by the same factor without changing their ratio.
        if up != 0 || down != 0 {
            value = score(gain, loss);
        }
        result[index] = Some(value);
    }
    Ok(result)
}
