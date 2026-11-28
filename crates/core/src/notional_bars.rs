use crate::{history::valid_second, Bar, TradeTape, MAX_TICKS, SCALE};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct NotionalBar {
    pub bar: Bar,
    pub available_at: i64,
    pub first_sequence: u64,
    pub last_sequence: u64,
    pub observed_trades: u32,
    /// Sum of absolute price times size in trillionths of the quote unit.
    pub gross_notional: i128,
    /// Threshold in millionths of the quote unit.
    pub target_notional: i64,
}

impl NotionalBar {
    pub fn complete(self) -> bool {
        self.gross_notional >= i128::from(self.target_notional) * i128::from(SCALE)
    }
}

impl TradeTape {
    /// A whole observed trade reaches or crosses the target. Its excess stays
    /// with the completed bar, and the next trade starts a fresh bar.
    pub fn notional_bars(
        &self,
        target_notional: i64,
        known_at: Option<i64>,
    ) -> Result<Vec<NotionalBar>, String> {
        if !(1..=MAX_TICKS).contains(&target_notional) {
            return Err("Use a positive six-place notional target.".into());
        }
        if known_at.is_some_and(|time| !valid_second(time)) {
            return Err("Use a supported UTC observation cutoff.".into());
        }

        let mut bars = Vec::new();
        let mut active = None;
        for trade in self.observed_prefix(known_at) {
            let current = active.get_or_insert(NotionalBar {
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
                gross_notional: 0,
                target_notional,
            });
            current.bar.high = current.bar.high.max(trade.price);
            current.bar.low = current.bar.low.min(trade.price);
            current.bar.close = trade.price;
            current.bar.volume += trade.size;
            if current.bar.volume > MAX_TICKS {
                return Err("Notional bar volume exceeds the supported OHLCV range.".into());
            }
            current.available_at = trade.observed_at;
            current.last_sequence = trade.sequence;
            current.observed_trades += 1;
            current.gross_notional += i128::from(trade.price).abs() * i128::from(trade.size);

            if current.complete() {
                bars.push(*current);
                active = None;
            }
        }
        bars.extend(active);
        Ok(bars)
    }
}
