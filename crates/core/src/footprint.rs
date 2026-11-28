use super::TradeTape;
use crate::{history::valid_second, MAX_TICKS};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AggressorSide {
    Buy,
    Sell,
    Unknown,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct FlowVolume {
    /// Sizes are millionths. Sums use i128 to preserve the full bounded capture.
    pub buy: i128,
    pub sell: i128,
    pub unknown: i128,
    pub trades: u32,
}

impl FlowVolume {
    fn record(&mut self, size: i64, side: AggressorSide) {
        let tally = match side {
            AggressorSide::Buy => &mut self.buy,
            AggressorSide::Sell => &mut self.sell,
            AggressorSide::Unknown => &mut self.unknown,
        };
        *tally += i128::from(size);
        self.trades += 1;
    }

    pub fn total(&self) -> i128 {
        self.buy + self.sell + self.unknown
    }

    pub fn delta(&self) -> i128 {
        self.buy - self.sell
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FootprintLevel {
    /// Inclusive lower bin boundary in exact price millionths.
    pub price_from: i64,
    /// Exclusive upper bin boundary in exact price millionths.
    pub price_to: i64,
    pub volume: FlowVolume,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FootprintBar {
    pub starts_at: i64,
    pub ends_at: i64,
    pub last_observed_at: i64,
    pub first_sequence: u64,
    pub last_sequence: u64,
    pub volume: FlowVolume,
    pub cumulative_delta: i128,
    /// Populated price levels in ascending order.
    pub levels: Vec<FootprintLevel>,
}

struct Bucket {
    last_observed_at: i64,
    first_sequence: u64,
    last_sequence: u64,
    volume: FlowVolume,
    levels: BTreeMap<i64, FlowVolume>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TradeWindow {
    pub first_execution: i64,
    pub last_execution: i64,
    pub last_observed: i64,
}

impl TradeTape {
    pub fn trade_window(&self) -> TradeWindow {
        let first = self.trades.first().expect("a parsed tape contains trades");
        let (mut first_execution, mut last_execution) = (first.executed_at, first.executed_at);
        for trade in &self.trades[1..] {
            first_execution = first_execution.min(trade.executed_at);
            last_execution = last_execution.max(trade.executed_at);
        }
        TradeWindow {
            first_execution,
            last_execution,
            last_observed: self.trades[self.trades.len() - 1].observed_at,
        }
    }

    /// Group observed trades in UTC execution buckets across an inclusive execution window.
    /// Delta uses supplied aggressor labels. Unknown volume remains explicitly measurable.
    pub fn footprint(
        &self,
        bucket_seconds: u32,
        price_width: i64,
        from_at: i64,
        through_at: i64,
        known_at: i64,
    ) -> Result<Vec<FootprintBar>, String> {
        if bucket_seconds == 0 {
            return Err("Use a positive whole-second footprint interval.".into());
        }
        if !(1..=MAX_TICKS).contains(&price_width) {
            return Err(
                "Use a positive footprint price increment within the supported range.".into(),
            );
        }
        if ![from_at, through_at, known_at]
            .into_iter()
            .all(valid_second)
            || from_at > through_at
        {
            return Err("Use valid UTC times and an ordered footprint execution window.".into());
        }

        let seconds = i64::from(bucket_seconds);
        let mut buckets = BTreeMap::new();
        for trade in self.observed_prefix(Some(known_at)) {
            if !(from_at..=through_at).contains(&trade.executed_at) {
                continue;
            }
            let starts_at = trade.executed_at.div_euclid(seconds) * seconds;
            let price_from = trade.price.div_euclid(price_width) * price_width;
            let bucket = buckets.entry(starts_at).or_insert_with(|| Bucket {
                last_observed_at: trade.observed_at,
                first_sequence: trade.sequence,
                last_sequence: trade.sequence,
                volume: FlowVolume::default(),
                levels: BTreeMap::new(),
            });
            bucket.last_observed_at = trade.observed_at;
            bucket.last_sequence = trade.sequence;
            bucket.volume.record(trade.size, trade.side);
            bucket
                .levels
                .entry(price_from)
                .or_default()
                .record(trade.size, trade.side);
        }

        let mut cumulative_delta = 0;
        Ok(buckets
            .into_iter()
            .map(|(starts_at, bucket)| {
                cumulative_delta += bucket.volume.delta();
                FootprintBar {
                    starts_at,
                    ends_at: starts_at + seconds,
                    last_observed_at: bucket.last_observed_at,
                    first_sequence: bucket.first_sequence,
                    last_sequence: bucket.last_sequence,
                    volume: bucket.volume,
                    cumulative_delta,
                    levels: bucket
                        .levels
                        .into_iter()
                        .map(|(price_from, volume)| FootprintLevel {
                            price_from,
                            price_to: price_from + price_width,
                            volume,
                        })
                        .collect(),
                }
            })
            .collect())
    }
}
