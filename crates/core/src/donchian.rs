use std::collections::VecDeque;

use crate::{
    history::{validate_bar_time, validate_ohlcv},
    Bar, PriceBand, MAX_BARS,
};

/// The highest high, lowest low, and their midpoint over the latest complete
/// window of observed bars. Midpoints at half a tick round away from zero.
pub fn donchian_channels(period: usize, bars: &[Bar]) -> Result<Vec<Option<PriceBand>>, String> {
    if !(1..=MAX_BARS).contains(&period) || bars.len() > MAX_BARS {
        return Err(
            "Donchian periods must be 1–100,000 and histories at most 100,000 bars.".into(),
        );
    }
    rolling_extrema(period, bars, |_, high, low| {
        let lower = bars[low].low;
        let upper = bars[high].high;
        let sum = lower + upper;
        let middle = sum / 2 + sum % 2;
        PriceBand {
            lower,
            middle,
            upper,
        }
    })
}

pub(crate) fn rolling_extrema<T>(
    window: usize,
    bars: &[Bar],
    mut measure: impl FnMut(usize, usize, usize) -> T,
) -> Result<Vec<Option<T>>, String> {
    let mut highs: VecDeque<usize> = VecDeque::new();
    let mut lows: VecDeque<usize> = VecDeque::new();
    let mut result = Vec::with_capacity(bars.len());
    let mut previous_time = None;
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);

        let start = (index + 1).saturating_sub(window);
        // Keep only possible extrema in the current window. An equal newer
        // extreme replaces an older one because it expires later.
        if highs.front().is_some_and(|&front| front < start) {
            highs.pop_front();
        }
        if lows.front().is_some_and(|&front| front < start) {
            lows.pop_front();
        }
        while highs
            .back()
            .is_some_and(|&back| bars[back].high <= bar.high)
        {
            highs.pop_back();
        }
        while lows.back().is_some_and(|&back| bars[back].low >= bar.low) {
            lows.pop_back();
        }
        highs.push_back(index);
        lows.push_back(index);

        result.push((index + 1 >= window).then(|| measure(index, highs[0], lows[0])));
    }
    Ok(result)
}
