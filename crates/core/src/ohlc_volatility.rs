use std::collections::VecDeque;

use crate::{
    history::{validate_bar_time, validate_ohlcv},
    Bar, MAX_BARS,
};

// Fixed-point variance contributions keep sliding sums independent of earlier bars.
const VARIANCE_SCALE: i128 = 1_000_000_000_000_000_000_000_000;
const VARIANCE_DIVISOR: i128 = VARIANCE_SCALE / 100_000_000_i128.pow(2);

/// Per-bar volatility estimates in millionths of a percentage point.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct OhlcVolatility {
    pub garman_klass: i64,
    pub rogers_satchell: i64,
}

/// Square roots of the trailing mean intrabar variances for the two OHLC estimators.
/// A window is unavailable until full and while any of its prices are nonpositive.
pub fn rolling_ohlc_volatility(
    period: usize,
    bars: &[Bar],
) -> Result<Vec<Option<OhlcVolatility>>, String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err(
            "OHLC volatility requires a period of 1–100,000 and at most 100,000 bars.".into(),
        );
    }
    let mut window: VecDeque<Option<[i128; 2]>> = VecDeque::with_capacity(period.min(bars.len()));
    let mut sums = [0_i128; 2];
    let mut unavailable = 0;
    let divisor = period as i128 * VARIANCE_DIVISOR;
    let mut previous_time = None;

    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            validate_bar_time(bar.time, previous_time, index)?;
            validate_ohlcv(bar, index)?;
            previous_time = Some(bar.time);
            if window.len() == period {
                match window.pop_front().unwrap() {
                    Some([garman_klass, rogers_satchell]) => {
                        sums[0] -= garman_klass;
                        sums[1] -= rogers_satchell;
                    }
                    None => unavailable -= 1,
                }
            }
            let variance = intrabar_variance(bar);
            match variance {
                Some([garman_klass, rogers_satchell]) => {
                    sums[0] += garman_klass;
                    sums[1] += rogers_satchell;
                }
                None => unavailable += 1,
            }
            window.push_back(variance);
            Ok(
                (window.len() == period && unavailable == 0).then(|| OhlcVolatility {
                    garman_klass: rounded_volatility(sums[0], divisor),
                    rogers_satchell: rounded_volatility(sums[1], divisor),
                }),
            )
        })
        .collect()
}

fn intrabar_variance(bar: &Bar) -> Option<[i128; 2]> {
    if bar.low <= 0 {
        return None;
    }
    let range = log_ratio(bar.high, bar.low);
    let body = log_ratio(bar.close.max(bar.open), bar.close.min(bar.open));
    let garman_klass = 0.5 * range.powi(2) - (2.0 * std::f64::consts::LN_2 - 1.0) * body.powi(2);
    let rogers_satchell = log_ratio(bar.high, bar.open) * log_ratio(bar.high, bar.close)
        + log_ratio(bar.open, bar.low) * log_ratio(bar.close, bar.low);
    Some(
        [garman_klass, rogers_satchell]
            .map(|value| (value * VARIANCE_SCALE as f64).round() as i128),
    )
}

fn log_ratio(high: i64, low: i64) -> f64 {
    // Subtract the integer prices first to retain one-tick moves at high prices.
    ((high - low) as f64 / low as f64).ln_1p()
}

fn rounded_volatility(sum: i128, divisor: i128) -> i64 {
    let floor = (sum / divisor).isqrt();
    let twice_midpoint = 2 * floor + 1;
    (floor + i128::from(4 * sum >= twice_midpoint.pow(2) * divisor)) as i64
}
