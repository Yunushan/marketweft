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
    let mut highs: VecDeque<usize> = VecDeque::new();
    let mut lows: VecDeque<usize> = VecDeque::new();
    let mut result = vec![None; bars.len()];
    let mut previous_time = None;
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);

        let start = (index + 1).saturating_sub(period);
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

        if index + 1 >= period {
            let lower = bars[lows[0]].low;
            let upper = bars[highs[0]].high;
            let sum = lower + upper;
            let middle = sum / 2 + sum % 2;
            result[index] = Some(PriceBand {
                lower,
                middle,
                upper,
            });
        }
    }
    Ok(result)
}
