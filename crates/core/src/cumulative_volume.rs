use std::cmp::Ordering;

use crate::{
    history::{validate_bar_time, validate_ohlcv},
    screen::rounded_div,
    Bar, MAX_BARS,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CumulativeVolume {
    pub on_balance: i128,
    pub accumulation_distribution: i128,
}

/// Computes On-Balance Volume and the Accumulation/Distribution Line over
/// observed OHLCV bars. OBV begins at zero on the first observed close, and
/// a zero-range bar contributes zero to the Accumulation/Distribution Line.
pub fn cumulative_volume(bars: &[Bar]) -> Result<Vec<CumulativeVolume>, String> {
    if bars.len() > MAX_BARS {
        return Err("Cumulative volume supports up to 100,000 observed bars.".into());
    }
    let mut previous_close = None;
    let mut previous_time = None;
    let mut on_balance = 0;
    let mut accumulation_distribution = 0;
    let mut rows = Vec::with_capacity(bars.len());
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        let volume = i128::from(bar.volume);
        if let Some(close) = previous_close {
            on_balance += match bar.close.cmp(&close) {
                Ordering::Greater => volume,
                Ordering::Less => -volume,
                Ordering::Equal => 0,
            };
        }
        let range = i128::from(bar.high - bar.low);
        if range > 0 {
            let distance = i128::from(bar.close - bar.low) - i128::from(bar.high - bar.close);
            accumulation_distribution += rounded_div(distance * volume, range);
        }
        rows.push(CumulativeVolume {
            on_balance,
            accumulation_distribution,
        });
        previous_close = Some(bar.close);
        previous_time = Some(bar.time);
    }
    Ok(rows)
}

/// Accumulate each bar's volume weighted by its signed close-to-close return.
/// A zero previous close leaves that bar's contribution unavailable.
pub fn price_volume_trend(bars: &[Bar]) -> Result<Vec<Option<i128>>, String> {
    if bars.len() > MAX_BARS {
        return Err("Price Volume Trend supports up to 100,000 observed bars.".into());
    }
    let mut total = 0_i128;
    bars.iter()
        .enumerate()
        .map(|(index, bar)| {
            let previous = index.checked_sub(1).map(|prior| &bars[prior]);
            validate_bar_time(bar.time, previous.map(|prior| prior.time), index)?;
            validate_ohlcv(bar, index)?;
            let Some(previous) = previous else {
                return Ok(Some(total));
            };
            let baseline = i128::from(previous.close);
            if baseline == 0 {
                return Ok(None);
            }
            let move_volume = i128::from(bar.close - previous.close) * i128::from(bar.volume);
            total += rounded_div(move_volume * baseline.signum(), baseline.abs());
            Ok(Some(total))
        })
        .collect()
}
