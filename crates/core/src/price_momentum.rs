use crate::{
    donchian::RollingExtrema,
    history::{typical_sum, valid_second, validate_bar_time, validate_ohlcv},
    indicator::exponential_tail,
    moving_averages::weighted_tail,
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

    /// Return the zero-based price rank carrying a one-based sample position.
    fn rank_at(&self, mut position: i128) -> usize {
        let mut index = 0;
        let mut step = 1 << (self.nodes.len() - 1).ilog2();
        while step > 0 {
            let next = index + step;
            if next < self.nodes.len() && self.nodes[next].0 < position {
                index = next;
                position -= self.nodes[next].0;
            }
            step >>= 1;
        }
        index
    }
}

fn compressed_ranks(prices: &[i128]) -> (Vec<i128>, Vec<usize>) {
    let mut ordered = prices.to_vec();
    ordered.sort_unstable();
    ordered.dedup();
    let ranks = prices
        .iter()
        .map(|price| ordered.partition_point(|level| level < price))
        .collect();
    (ordered, ranks)
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
    let (ordered, ranks) = compressed_ranks(&prices);
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CloseOrderStatistic {
    pub median_ticks: i64,
    /// Percentage points in millionths, averaging the ranks of tied closes.
    pub percentile_rank: i64,
}

/// Calculate the median and current close's fractional position in each full
/// trailing window. Equal closes share their average rank. The two extremes
/// of the sorted window correspond to zero and 100 percent.
pub fn rolling_close_order_statistics(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<CloseOrderStatistic>>, String> {
    validate_closes(period, closes)?;
    if period < 2 {
        return Err("Close order statistics require at least two bars.".into());
    }
    let prices: Vec<_> = closes.iter().map(|&close| i128::from(close)).collect();
    let (ordered, ranks) = compressed_ranks(&prices);
    let mut window = PriceWindow::new(ordered.len());
    let lower_position = period.div_ceil(2) as i128;
    let upper_position = (period / 2 + 1) as i128;
    let rank_scale = i128::from(100 * SCALE);
    let rank_divisor = 2 * (period as i128 - 1);
    Ok(prices
        .iter()
        .enumerate()
        .map(|(index, &price)| {
            let current_rank = ranks[index];
            window.update(current_rank, price, 1);
            if let Some(expired) = index.checked_sub(period) {
                window.update(ranks[expired], prices[expired], -1);
            }
            (index + 1 >= period).then(|| {
                let lower = ordered[window.rank_at(lower_position)];
                let upper = ordered[window.rank_at(upper_position)];
                let below = window.prefix(current_rank).0;
                let through = window.prefix(current_rank + 1).0;
                CloseOrderStatistic {
                    median_ticks: rounded_div(lower + upper, 2) as i64,
                    percentile_rank: rounded_div((below + through - 1) * rank_scale, rank_divisor)
                        as i64,
                }
            })
        })
        .collect())
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

/// Smooth the sum of two signed returns with a linearly weighted moving average.
/// An unavailable baseline breaks the smoothing window.
pub fn coppock_curve(
    smoothing_period: usize,
    first_period: usize,
    second_period: usize,
    closes: &[i64],
) -> Result<Vec<Option<i128>>, String> {
    validate_closes(smoothing_period, closes)?;
    validate_period(first_period, closes.len())?;
    validate_period(second_period, closes.len())?;
    let changes: Vec<_> = closes
        .iter()
        .enumerate()
        .map(|(index, &close)| {
            let first = percent_change(close, closes[index.checked_sub(first_period)?])?;
            let second = percent_change(close, closes[index.checked_sub(second_period)?])?;
            Some(first + second)
        })
        .collect();
    let mut results = vec![None; closes.len()];
    let mut offset = 0;
    for run in changes.split(Option::is_none) {
        let end = offset + run.len();
        if run.len() >= smoothing_period {
            let values: Vec<_> = run.iter().flatten().copied().collect();
            let smoothed = weighted_tail(smoothing_period, &values);
            for (result, value) in results[end - smoothed.len()..end].iter_mut().zip(smoothed) {
                *result = Some(value);
            }
        }
        offset = end + 1;
    }
    Ok(results)
}

pub(crate) fn validate_closes(period: usize, closes: &[i64]) -> Result<(), String> {
    validate_period(period, closes.len())?;
    if closes
        .iter()
        .any(|close| !(-MAX_TICKS..=MAX_TICKS).contains(close))
    {
        return Err("A close is outside the supported fixed-point range.".into());
    }
    Ok(())
}

/// Distance between the highest and lowest close in the current period
/// divided by the sum of the same number of absolute close changes.
/// Outputs are millionths of a unit ratio. A zero denominator is unavailable.
pub fn vertical_horizontal_filter(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<i64>>, String> {
    validate_closes(period, closes)?;
    if period < 2 {
        return Err("Vertical Horizontal Filter needs at least two bars per window.".into());
    }
    let mut result = vec![None; closes.len()];
    let mut extrema = RollingExtrema::default();
    let mut path = 0_i128;
    let distance = |index: usize| i128::from((closes[index] - closes[index - 1]).abs());
    for (index, value) in result.iter_mut().enumerate().skip(1) {
        path += distance(index);
        if index > period {
            path -= distance(index - period);
        }
        let bounds = extrema.advance(period, index, |i| closes[i], |i| closes[i]);
        if let Some((high, low)) = bounds.filter(|_| index >= period && path > 0) {
            let span = i128::from(closes[high] - closes[low]);
            *value = Some(rounded_div(span * i128::from(SCALE), path) as i64);
        }
    }
    Ok(result)
}

/// Percentage of observed close changes that rose in a complete window.
/// Unchanged closes count in the denominator and the output uses millionths
/// of a percentage point.
pub fn psychological_line(period: usize, closes: &[i64]) -> Result<Vec<Option<i64>>, String> {
    validate_closes(period, closes)?;
    let mut result = vec![None; closes.len()];
    let mut rising = 0_i128;
    let up = |index: usize| i128::from(closes[index] > closes[index - 1]);
    for (index, value) in result.iter_mut().enumerate().skip(1) {
        rising += up(index);
        if index > period {
            rising -= up(index - period);
        }
        if index >= period {
            *value = Some(rounded_div(rising * i128::from(100 * SCALE), period as i128) as i64);
        }
    }
    Ok(result)
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TimeUnderwaterPoint {
    pub peak_at: i64,
    pub peak_close: i64,
    pub elapsed_seconds: i64,
}

/// Measure elapsed UTC seconds since the most recent observation at the
/// highest close. A return to the same peak resets the duration to zero.
pub fn observed_time_underwater(bars: &[Bar]) -> Result<Vec<TimeUnderwaterPoint>, String> {
    if bars.len() > MAX_BARS {
        return Err("Time Underwater supports up to 100,000 bars.".into());
    }
    let mut previous = None;
    let mut peak: Option<&Bar> = None;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_ohlcv(bar, index)?;
            validate_bar_time(bar.time, previous, index)?;
            previous = Some(bar.time);
            let source = peak.filter(|prior| prior.close > bar.close).unwrap_or(bar);
            peak = Some(source);
            Ok(TimeUnderwaterPoint {
                peak_at: source.time,
                peak_close: source.close,
                elapsed_seconds: bar.time - source.time,
            })
        })
        .collect()
}

pub(crate) fn percent_change(close: i64, base: i64) -> Option<i128> {
    let base = i128::from(base);
    if base == 0 {
        return None;
    }
    Some(rounded_div(
        (i128::from(close) - base) * i128::from(100 * SCALE) * base.signum(),
        base.abs(),
    ))
}
