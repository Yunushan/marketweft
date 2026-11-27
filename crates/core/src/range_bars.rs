use crate::{history::valid_second, tick_bars::TradeTape, Bar, MAX_TICKS};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RangeBar {
    pub bar: Bar,
    pub available_at: i64,
    pub first_sequence: u64,
    pub last_sequence: u64,
    pub observed_trades: u32,
    pub target_range: i64,
}

impl RangeBar {
    pub fn observed_range(self) -> i64 {
        self.bar.high - self.bar.low
    }

    pub fn complete(self) -> bool {
        self.observed_range() >= self.target_range
    }
}

impl TradeTape {
    /// Build OHLCV in observation order. The trade reaching or crossing the range
    /// completes the bar. Each print contributes to exactly one bar.
    pub fn range_bars(
        &self,
        target_range: i64,
        known_at: Option<i64>,
    ) -> Result<Vec<RangeBar>, String> {
        if !(1..=MAX_TICKS).contains(&target_range) {
            return Err("Use a positive six-place price range.".into());
        }
        if known_at.is_some_and(|time| !valid_second(time)) {
            return Err("Use a supported UTC observation cutoff.".into());
        }

        let mut bars = Vec::new();
        let mut active: Option<RangeBar> = None;
        for trade in self.observed_prefix(known_at) {
            let current = active.get_or_insert(RangeBar {
                bar: Bar {
                    time: trade.observed_at,
                    open: trade.price,
                    high: trade.price,
                    low: trade.price,
                    close: trade.price,
                    volume: 0,
                },
                available_at: trade.observed_at,
                first_sequence: trade.sequence,
                last_sequence: trade.sequence,
                observed_trades: 0,
                target_range,
            });
            current.bar.high = current.bar.high.max(trade.price);
            current.bar.low = current.bar.low.min(trade.price);
            current.bar.close = trade.price;
            current.bar.volume += trade.size;
            if current.bar.volume > MAX_TICKS {
                return Err("Range bar volume exceeds the supported OHLCV range.".into());
            }
            current.available_at = trade.observed_at;
            current.last_sequence = trade.sequence;
            current.observed_trades += 1;

            if current.complete() {
                bars.push(*current);
                active = None;
            }
        }
        bars.extend(active);
        Ok(bars)
    }
}
