use crate::{
    history::{typical_sum, valid_second, validate_bar_time, validate_ohlcv},
    indicator::exponential_tail,
    screen::rounded_div,
    Bar, MAX_BARS, MAX_TICKS, SCALE,
};

// A Fenwick tree stores counts and price sums by rank. Both updates and
// prefix queries use O(log n) operations even for the largest lookbacks.
struct PriceWindow {
    nodes: Vec<(i128, i128)>,
}

impl PriceWindow {
    fn new(ranks: usize) -> Self {
        Self {
            nodes: vec![(0, 0); ranks + 1],
        }
    }

    fn update(&mut self, rank: usize, price: i128, change: i128) {
        let mut index = rank + 1;
        while index < self.nodes.len() {
            self.nodes[index].0 += change;
            self.nodes[index].1 += price * change;
            index += index.isolate_lowest_one();
        }
    }

    fn prefix(&self, mut ranks: usize) -> (i128, i128) {
        let (mut count, mut sum) = (0, 0);
        while ranks > 0 {
            count += self.nodes[ranks].0;
            sum += self.nodes[ranks].1;
            ranks &= ranks - 1;
        }
        (count, sum)
    }
}

fn validate_period(period: usize, length: usize) -> Result<(), String> {
    if !(1..=MAX_BARS).contains(&period) || length > MAX_BARS {
        return Err(
            "Momentum periods must be 1–100,000 and histories at most 100,000 bars.".into(),
        );
    }
    Ok(())
}

/// Lambert's Commodity Channel Index in signed millionths. The mean and
/// mean absolute deviation are kept as exact ratios until the output round.
pub fn commodity_channel_index(period: usize, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    validate_period(period, bars.len())?;
    let mut previous_time = None;
    let mut prices = Vec::with_capacity(bars.len());
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);
        // The factor of three in typical price cancels in the index.
        prices.push(typical_sum(bar));
    }
    let mut ordered = prices.clone();
    ordered.sort_unstable();
    ordered.dedup();
    let ranks: Vec<usize> = prices
        .iter()
        .map(|price| ordered.partition_point(|level| level < price))
        .collect();
    let weight = period as i128;
    let mut window = PriceWindow::new(ordered.len());
    let mut result = vec![None; bars.len()];
    let mut sum = 0;
    for (index, &price) in prices.iter().enumerate() {
        window.update(ranks[index], price, 1);
        sum += price;
        if let Some(expired) = index.checked_sub(period) {
            window.update(ranks[expired], prices[expired], -1);
            sum -= prices[expired];
        }
        if index + 1 < period {
            continue;
        }
        let (count, subtotal) =
            window.prefix(ordered.partition_point(|&level| level * weight <= sum));
        // Deviations above and below the mean cancel when signed. Their
        // absolute sum is twice the deviations contributed by the lower side.
        let deviation = 2 * (count * sum - subtotal * weight);
        if deviation != 0 {
            let difference = (price * weight - sum) * weight;
            let value = rounded_div(difference * i128::from(200 * SCALE), 3 * deviation);
            result[index] = Some(value as i64);
        }
    }
    Ok(result)
}

/// The percentage change from the signed close exactly one lookback ago.
/// A zero baseline has no defined result.
pub fn rate_of_change(period: usize, closes: &[i64]) -> Result<Vec<Option<i128>>, String> {
    validate_closes(period, closes)?;
    Ok(closes
        .iter()
        .enumerate()
        .map(|(index, &close)| {
            let base = closes[index.checked_sub(period)?];
            percent_change(close, base)
        })
        .collect())
}

fn validate_closes(period: usize, closes: &[i64]) -> Result<(), String> {
    validate_period(period, closes.len())?;
    if closes
        .iter()
        .any(|close| !(-MAX_TICKS..=MAX_TICKS).contains(close))
    {
        return Err("A close is outside the supported fixed-point range.".into());
    }
    Ok(())
}

/// The unsmoothed Chande Momentum Oscillator in millionths of a percent.
pub fn chande_momentum_oscillator(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<i64>>, String> {
    validate_closes(period, closes)?;
    if period < 2 {
        return Err("Chande Momentum Oscillator periods must be 2–100,000.".into());
    }
    let change = |pair: &[i64]| i128::from(pair[1]) - i128::from(pair[0]);
    let mut variation = 0;
    let mut result = vec![None; closes.len()];
    for (index, pair) in closes.windows(2).enumerate() {
        variation += change(pair).abs();
        if let Some(expired) = index.checked_sub(period) {
            variation -= change(&closes[expired..expired + 2]).abs();
        }
        if let Some(start) = (index + 1).checked_sub(period) {
            let net = i128::from(pair[1]) - i128::from(closes[start]);
            result[index + 1] = Some(if variation == 0 {
                0
            } else {
                rounded_div(net * i128::from(100 * SCALE), variation) as i64
            });
        }
    }
    Ok(result)
}

/// The one-observation percentage change of the triple-smoothed EMA.
pub fn trix(period: usize, closes: &[i64]) -> Result<Vec<Option<i128>>, String> {
    validate_closes(period, closes)?;
    let mut ema = exponential_tail(period, closes);
    for _ in 0..2 {
        ema = exponential_tail(period, &ema);
    }
    let mut result = vec![None; closes.len()];
    let start = closes.len() - ema.len() + 1;
    for (index, pair) in ema.windows(2).enumerate() {
        result[start + index] = percent_change(pair[1], pair[0]);
    }
    Ok(result)
}

/// Percentage change from the close at the exact UTC anchor, in millionths of a percent.
/// An absent or zero anchor has no defined result. Observations before the anchor remain missing.
pub fn rebased_percent_changes(anchor_at: i64, bars: &[Bar]) -> Result<Vec<Option<i128>>, String> {
    if !valid_second(anchor_at) || bars.len() > MAX_BARS {
        return Err(
            "Rebased change requires an in-range UTC anchor and up to 100,000 bars.".into(),
        );
    }
    let mut previous = None;
    let mut base = None;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_ohlcv(bar, index)?;
            validate_bar_time(bar.time, previous, index)?;
            previous = Some(bar.time);
            if bar.time == anchor_at {
                base = Some(bar.close);
            }
            Ok(base.and_then(|base| percent_change(bar.close, base)))
        })
        .collect()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DrawdownPoint {
    pub peak_at: i64,
    pub peak_close: i64,
    pub percent: i64,
}

/// Signed percentage below the largest eligible observed close, in millionths of a percent.
/// The first observation at a repeated peak supplies the peak timestamp.
pub fn observed_drawdown(bars: &[Bar]) -> Result<Vec<Option<DrawdownPoint>>, String> {
    if bars.len() > MAX_BARS {
        return Err("Drawdown charts support up to 100,000 bars.".into());
    }
    let mut previous = None;
    let mut peak: Option<&Bar> = None;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_ohlcv(bar, index)?;
            validate_bar_time(bar.time, previous, index)?;
            previous = Some(bar.time);
            if bar.close < 0 {
                return Ok(None);
            }
            if bar.close > 0 && peak.is_none_or(|prior| bar.close > prior.close) {
                peak = Some(bar);
            }
            Ok(peak.and_then(|source| {
                percent_change(bar.close, source.close).map(|value| DrawdownPoint {
                    peak_at: source.time,
                    peak_close: source.close,
                    percent: value as i64,
                })
            }))
        })
        .collect()
}

fn percent_change(close: i64, base: i64) -> Option<i128> {
    let base = i128::from(base);
    if base == 0 {
        return None;
    }
    Some(rounded_div(
        (i128::from(close) - base) * i128::from(100 * SCALE) * base.signum(),
        base.abs(),
    ))
}
