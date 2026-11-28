use crate::{
    history::{valid_second, validate_bar_time, validate_ohlcv},
    price_momentum::validate_closes,
    screen::rounded_div,
    Bar, MAX_BARS,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RegressionChannel {
    pub observations: usize,
    pub start_ticks: i64,
    pub end_ticks: i64,
    /// Symmetric envelope that covers every observed close after endpoint rounding.
    pub residual_ticks: i64,
}

fn squared_centered_indexes(count: i128) -> i128 {
    // Sum of (2i - (count - 1))² for i from 0 through count - 1.
    count * (count * count - 1) / 3
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CloseRegressionValues {
    pub slope_ticks: i64,
    pub forecast_ticks: i64,
}

struct CloseRegressionWindow {
    count: i128,
    sum: i128,
    sum_z2: i128,
    sum_zy: i128,
}

impl CloseRegressionWindow {
    fn price_at(&self, index: i128) -> i64 {
        let z = 2 * index - (self.count - 1);
        rounded_div(
            self.sum * self.sum_z2 + self.count * z * self.sum_zy,
            self.count * self.sum_z2,
        ) as i64
    }
}

/// Fit closes to their observation index over a trailing window. Return the
/// signed slope in price ticks per observation and the next-index estimate
/// at the final observed bar. Each output rounds once.
pub fn rolling_close_regression(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<CloseRegressionValues>>, String> {
    rolling_close_fits(period, closes, |window| CloseRegressionValues {
        slope_ticks: rounded_div(2 * window.sum_zy, window.sum_z2) as i64,
        forecast_ticks: window.price_at(window.count),
    })
}

/// Fit a least-squares line over each full trailing window of closes. Return
/// the fitted price at the last observed index, rounded once to whole ticks.
pub fn least_squares_moving_average(
    period: usize,
    closes: &[i64],
) -> Result<Vec<Option<i64>>, String> {
    rolling_close_fits(period, closes, |window| window.price_at(window.count - 1))
}

fn rolling_close_fits<T>(
    period: usize,
    closes: &[i64],
    calculate: impl Fn(CloseRegressionWindow) -> T,
) -> Result<Vec<Option<T>>, String> {
    validate_closes(period, closes)?;
    if period < 2 {
        return Err("Regression studies need at least two bars per window.".into());
    }
    let count = period as i128;
    let sum_z2 = squared_centered_indexes(count);
    let mut sum = 0_i128;
    let mut weighted = 0_i128;
    Ok(closes
        .iter()
        .enumerate()
        .map(|(index, &close)| {
            if let Some(expired) = index.checked_sub(period) {
                sum -= i128::from(closes[expired]);
                // Every remaining close moves one position toward index zero.
                weighted -= sum;
            }
            let price = i128::from(close);
            weighted += index.min(period - 1) as i128 * price;
            sum += price;
            (index + 1 >= period).then(|| {
                calculate(CloseRegressionWindow {
                    count,
                    sum,
                    sum_z2,
                    sum_zy: 2 * weighted - (count - 1) * sum,
                })
            })
        })
        .collect())
}

/// Fit a least-squares line over closes between two exact observed UTC timestamps.
/// Samples are spaced by observation order. Gaps never introduce synthetic closes.
pub fn regression_channel(
    start_at: i64,
    end_at: i64,
    bars: &[Bar],
) -> Result<Option<RegressionChannel>, String> {
    if !valid_second(start_at)
        || !valid_second(end_at)
        || end_at <= start_at
        || bars.len() > MAX_BARS
    {
        return Err(
            "A regression channel needs increasing UTC anchors and up to 100,000 bars.".into(),
        );
    }
    let mut prior = None;
    for (index, bar) in bars.iter().enumerate() {
        validate_bar_time(bar.time, prior, index)?;
        validate_ohlcv(bar, index)?;
        prior = Some(bar.time);
    }
    let Ok(first) = bars.binary_search_by_key(&start_at, |bar| bar.time) else {
        return Ok(None);
    };
    let Ok(last) = bars.binary_search_by_key(&end_at, |bar| bar.time) else {
        return Ok(None);
    };
    let window = &bars[first..=last];
    let observations = window.len();
    let count = observations as i128;
    let span = count - 1;
    let mut sum = 0;
    let sum_z2 = squared_centered_indexes(count);
    let mut sum_zy = 0;
    for (index, bar) in window.iter().enumerate() {
        // A zero-sum, integer x coordinate avoids large UTC products and fractional means.
        let z = 2 * index as i128 - span;
        let price = i128::from(bar.close);
        sum += price;
        sum_zy += z * price;
    }
    let divisor = count * sum_z2;
    let center = sum * sum_z2;
    let offset = count * span * sum_zy;
    let start = rounded_div(center - offset, divisor);
    let end = rounded_div(center + offset, divisor);

    let largest = window
        .iter()
        .enumerate()
        .map(|(index, bar)| {
            let index = index as i128;
            let predicted = (span - index) * start + index * end;
            (i128::from(bar.close) * span - predicted).abs()
        })
        .max()
        .unwrap_or(0);
    let residual = (largest + span - 1) / span;
    Ok(Some(RegressionChannel {
        observations,
        start_ticks: start as i64,
        end_ticks: end as i64,
        residual_ticks: residual as i64,
    }))
}
