use crate::{
    history::{typical_sum, valid_second, validate_bar_time, validate_ohlcv},
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
    validate_period(period, closes.len())?;
    if closes
        .iter()
        .any(|close| !(-MAX_TICKS..=MAX_TICKS).contains(close))
    {
        return Err("A close is outside the supported fixed-point range.".into());
    }
    Ok(closes
        .iter()
        .enumerate()
        .map(|(index, &close)| {
            let base = closes[index.checked_sub(period)?];
            percent_change(close, base)
        })
        .collect())
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
