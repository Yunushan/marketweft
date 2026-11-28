use crate::{
    atr::true_range,
    donchian::{rolling_extrema, RollingExtrema},
    history::{validate_bar_time, validate_ohlcv},
    indicator::advance_ema,
    screen::rounded_div,
    wilder::PRECISION,
    Bar, MAX_BARS, SCALE,
};

/// True-range sum divided by the actual window span, scaled logarithmically.
/// A flat high-low window leaves the index undefined.
pub fn choppiness_index(period: usize, bars: &[Bar]) -> Result<Vec<Option<i64>>, String> {
    if !(2..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err(
            "Choppiness Index needs 2–100,000 bars per window and at most 100,000 observations."
                .into(),
        );
    }
    let range = |index: usize| {
        true_range(
            &bars[index],
            index.checked_sub(1).map(|prior| bars[prior].close),
        )
    };
    let mut extrema = RollingExtrema::default();
    let mut total = 0_i128;
    let scale = (100 * SCALE) as f64 / (period as f64).log10();
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_bar_time(
                bar.time,
                index.checked_sub(1).map(|prior| bars[prior].time),
                index,
            )?;
            validate_ohlcv(bar, index)?;
            total += i128::from(range(index));
            if let Some(expired) = index.checked_sub(period) {
                total -= i128::from(range(expired));
            }
            Ok(extrema
                .advance(
                    period,
                    index,
                    |index| bars[index].high,
                    |index| bars[index].low,
                )
                .and_then(|(high, low)| {
                    let span = bars[high].high - bars[low].low;
                    (span > 0)
                        .then(|| ((total as f64 / span as f64).log10() * scale).round() as i64)
                }))
        })
        .collect()
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct StochasticMomentumValue {
    pub line: Option<i64>,
    pub signal: Option<i64>,
}

#[derive(Default)]
struct WindowEma {
    count: usize,
    seed: i128,
    average: Option<i128>,
}

impl WindowEma {
    fn push(&mut self, value: i128, period: usize) -> Option<i128> {
        let weight = period as i128;
        if let Some(previous) = self.average {
            self.average = Some(advance_ema(previous, value, weight));
        } else {
            self.seed += value;
            self.count += 1;
            if self.count == period {
                self.average = Some(rounded_div(self.seed, weight));
            }
        }
        self.average
    }
}

/// Double-smoothed distance from the midpoint as a percentage of half the
/// smoothed range. All outputs use millionths of a percentage point.
pub fn stochastic_momentum_index(
    lookback: usize,
    first: usize,
    second: usize,
    signal_period: usize,
    bars: &[Bar],
) -> Result<Vec<StochasticMomentumValue>, String> {
    if [lookback, first, second, signal_period]
        .into_iter()
        .any(|period| !(1..=MAX_BARS).contains(&period))
        || bars.len() > MAX_BARS
    {
        return Err(
            "Stochastic Momentum Index periods and histories must fit within 100,000 bars.".into(),
        );
    }
    let measurements = rolling_extrema(lookback, bars, |index, high, low| {
        let high = i128::from(bars[high].high);
        let low = i128::from(bars[low].low);
        let distance = i128::from(bars[index].close) * 2 - high - low;
        (distance * PRECISION, (high - low) * PRECISION)
    })?;
    let mut first_distance = WindowEma::default();
    let mut first_range = WindowEma::default();
    let mut second_distance = WindowEma::default();
    let mut second_range = WindowEma::default();
    let mut signal = WindowEma::default();
    Ok(measurements
        .into_iter()
        .map(|point| {
            let line = point
                .and_then(|(distance, range)| {
                    first_distance
                        .push(distance, first)
                        .zip(first_range.push(range, first))
                })
                .and_then(|(distance, range)| {
                    second_distance
                        .push(distance, second)
                        .zip(second_range.push(range, second))
                })
                .and_then(|(distance, range)| {
                    (range != 0).then(|| rounded_div(distance * i128::from(100 * SCALE), range))
                });
            if let Some(line) = line {
                StochasticMomentumValue {
                    line: Some(line as i64),
                    signal: signal.push(line, signal_period).map(|value| value as i64),
                }
            } else {
                signal = WindowEma::default();
                StochasticMomentumValue::default()
            }
        })
        .collect())
}
