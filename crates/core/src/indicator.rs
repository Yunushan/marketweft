use crate::{MAX_BARS, MAX_TICKS};

#[derive(Clone, Copy, Debug)]
pub enum Average {
    Simple,
    Exponential,
}

/// Round ties away from zero. i128 keeps the running sums and EMA weights exact.
fn rounded_ratio(n: i128, d: i128) -> i64 {
    (n.signum() * ((n.abs() + d / 2) / d)) as i64
}

/// SMA uses an exact rolling sum. EMA starts at the first full-window SMA and
/// uses alpha=2/(period+1), rounding to one millionth after each new close.
pub fn indicator(kind: Average, period: usize, closes: &[i64]) -> Result<Vec<Option<i64>>, String> {
    if !(1..=MAX_BARS).contains(&period) || closes.len() > MAX_BARS {
        return Err(
            "Indicator periods must be 1–100,000 and histories at most 100,000 bars.".into(),
        );
    }
    if closes.iter().any(|c| !(-MAX_TICKS..=MAX_TICKS).contains(c)) {
        return Err("A close is outside the supported fixed-point range.".into());
    }
    let mut out = vec![None; closes.len()];
    if period > closes.len() {
        return Ok(out);
    }
    let mut sum: i128 = closes[..period].iter().map(|&x| i128::from(x)).sum();
    let weight = period as i128;
    let mut last = rounded_ratio(sum, weight);
    out[period - 1] = Some(last);
    for i in period..closes.len() {
        let current = i128::from(closes[i]);
        last = match kind {
            Average::Simple => {
                sum += current - i128::from(closes[i - period]);
                rounded_ratio(sum, weight)
            }
            Average::Exponential => {
                rounded_ratio(2 * current + (weight - 1) * i128::from(last), weight + 1)
            }
        };
        out[i] = Some(last);
    }
    Ok(out)
}
