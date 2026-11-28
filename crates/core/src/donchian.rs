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
    let mut extrema = RollingExtrema::default();
    let mut result = Vec::with_capacity(bars.len());
    let mut previous_time = None;
    for (index, bar) in bars.iter().enumerate() {
        validate_ohlcv(bar, index)?;
        validate_bar_time(bar.time, previous_time, index)?;
        previous_time = Some(bar.time);

        result.push(
            extrema
                .advance(window, index, |at| bars[at].high, |at| bars[at].low)
                .map(|(high, low)| measure(index, high, low)),
        );
    }
    Ok(result)
}

#[derive(Default)]
pub(crate) struct RollingExtrema {
    highs: VecDeque<usize>,
    lows: VecDeque<usize>,
}

impl RollingExtrema {
    pub(crate) fn advance(
        &mut self,
        window: usize,
        index: usize,
        high: impl Fn(usize) -> i64,
        low: impl Fn(usize) -> i64,
    ) -> Option<(usize, usize)> {
        let start = (index + 1).saturating_sub(window);
        // Keep only possible extrema in the current window. An equal newer
        // extreme replaces an older one because it expires later.
        if self.highs.front().is_some_and(|&front| front < start) {
            self.highs.pop_front();
        }
        if self.lows.front().is_some_and(|&front| front < start) {
            self.lows.pop_front();
        }
        let latest_high = high(index);
        let latest_low = low(index);
        while self
            .highs
            .back()
            .is_some_and(|&back| high(back) <= latest_high)
        {
            self.highs.pop_back();
        }
        while self
            .lows
            .back()
            .is_some_and(|&back| low(back) >= latest_low)
        {
            self.lows.pop_back();
        }
        self.highs.push_back(index);
        self.lows.push_back(index);

        (index + 1 >= window).then(|| (self.highs[0], self.lows[0]))
    }
}
