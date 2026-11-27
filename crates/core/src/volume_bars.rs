use crate::{history::valid_second, Bar, TradeTape, MAX_BARS, MAX_TICKS};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct VolumeBar {
    pub bar: Bar,
    pub available_at: i64,
    pub first_sequence: u64,
    pub last_sequence: u64,
    pub contributing_trades: u32,
    pub first_contribution: i64,
    pub last_contribution: i64,
    pub target_volume: i64,
}

impl VolumeBar {
    pub fn complete(self) -> bool {
        self.bar.volume == self.target_volume
    }
}

impl TradeTape {
    /// Allocate captured size in observation order through exact volume boundaries.
    /// Multiple fragments of one trade retain its observed timestamp and sequence.
    pub fn volume_bars(
        &self,
        target_volume: i64,
        known_at: Option<i64>,
    ) -> Result<Vec<VolumeBar>, String> {
        if !(1..=MAX_TICKS).contains(&target_volume) {
            return Err("Use a positive six-place target volume.".into());
        }
        if known_at.is_some_and(|time| !valid_second(time)) {
            return Err("Use a supported UTC observation cutoff.".into());
        }

        let mut bars = Vec::new();
        let mut active: Option<VolumeBar> = None;
        for trade in self.observed_prefix(known_at) {
            let combined = active.map_or(0, |bar| bar.bar.volume) + trade.size;
            let required = 1 + (combined - 1) / target_volume;
            if required > (MAX_BARS - bars.len()) as i64 {
                return Err("Volume exceeds 100,000 bars. Increase the target volume.".into());
            }

            let mut remaining = trade.size;
            while remaining > 0 {
                let current = active.get_or_insert(VolumeBar {
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
                    contributing_trades: 0,
                    first_contribution: 0,
                    last_contribution: 0,
                    target_volume,
                });
                let contribution = remaining.min(target_volume - current.bar.volume);
                if current.contributing_trades == 0 {
                    current.first_contribution = contribution;
                }
                current.bar.high = current.bar.high.max(trade.price);
                current.bar.low = current.bar.low.min(trade.price);
                current.bar.close = trade.price;
                current.bar.volume += contribution;
                current.available_at = trade.observed_at;
                current.last_sequence = trade.sequence;
                current.last_contribution = contribution;
                current.contributing_trades += 1;
                remaining -= contribution;

                if current.complete() {
                    bars.push(*current);
                    active = None;
                }
            }
        }
        bars.extend(active);
        Ok(bars)
    }
}
