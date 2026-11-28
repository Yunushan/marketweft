use crate::{
    history::{decimal, exact_utc, valid_second},
    screen::rounded_div,
    Instrument, PaperSide, MAX_BARS, MAX_INPUT_BYTES, MAX_TICKS,
};
use std::collections::{BTreeMap, BTreeSet};

const HEADER: &str = "instrument,event_at,observed_at,sequence,kind,side,price,size";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DepthStamp {
    pub event_at: i64,
    pub observed_at: i64,
    pub sequence: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DepthLevel {
    pub price: i64,
    pub size: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DepthStatus {
    NoObservation,
    AwaitingSnapshot,
    Synchronized,
    SequenceGap { expected: u64, received: u64 },
    Crossed { sequence: u64 },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DepthView {
    pub status: DepthStatus,
    pub received: Option<DepthStamp>,
    pub snapshot: Option<DepthStamp>,
    /// Bids run from best to worst.
    pub bids: Vec<DepthLevel>,
    /// Asks run from best to worst.
    pub asks: Vec<DepthLevel>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DepthSweep {
    pub status: DepthStatus,
    pub received: Option<DepthStamp>,
    pub snapshot: Option<DepthStamp>,
    /// A synchronized book can give a defined zero-filled execution.
    pub execution: Option<DepthExecution>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DepthExecution {
    pub filled: i64,
    pub remaining: i64,
    /// Sum of price ticks times size ticks, in units of 10^-12.
    pub notional: i128,
    pub mean_price: Option<i64>,
    /// Price and simulated size consumed at each level, in execution order.
    pub fills: Vec<DepthLevel>,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum Side {
    Bid,
    Ask,
}

struct Frame {
    stamp: DepthStamp,
    snapshot: bool,
    levels: Vec<(Side, DepthLevel)>,
}

/// A single instrument's normalized snapshots and atomic level updates.
pub struct DepthTape {
    frames: Vec<Frame>,
    snapshots: Vec<usize>,
}

impl DepthTape {
    pub fn parse(csv: &str, instrument: &Instrument) -> Result<Self, String> {
        if csv.len() > MAX_INPUT_BYTES {
            return Err("Depth CSV exceeds 8 MiB.".into());
        }
        let mut lines = csv
            .trim_start_matches('\u{feff}')
            .lines()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty());
        if lines.next().map(|(_, row)| row.trim()) != Some(HEADER) {
            return Err(format!("Expected depth CSV header {HEADER}."));
        }
        let mut frames: Vec<Frame> = Vec::new();
        let mut snapshots = Vec::new();
        let mut level_keys = BTreeSet::new();
        let expected_id = instrument.to_string();
        for (count, (index, row)) in lines.enumerate() {
            let error = |message: &str| format!("Depth line {}: {message}", index + 1);
            if count == MAX_BARS {
                return Err(error("Supply at most 100,000 depth rows."));
            }
            let mut fields = row.split(',').map(str::trim);
            let [Some(id), Some(at), Some(observed), Some(sequence), Some(kind), Some(side), Some(price), Some(size)] =
                std::array::from_fn(|_| fields.next())
            else {
                return Err(error("Expected exactly eight fields."));
            };
            if fields.next().is_some() {
                return Err(error("Expected exactly eight fields."));
            }
            if id != expected_id {
                return Err(error("Instrument must match the selected chart."));
            }
            let event_at =
                exact_utc(at).ok_or_else(|| error("Use an exact UTC event timestamp."))?;
            let observed_at = exact_utc(observed)
                .ok_or_else(|| error("Use an exact UTC observation timestamp."))?;
            if observed_at < event_at {
                return Err(error("Observation time precedes event time."));
            }
            let sequence = sequence
                .parse::<u64>()
                .ok()
                .filter(|seq| *seq > 0)
                .ok_or_else(|| error("Use a positive sequence number."))?;
            let snapshot = match kind {
                "snapshot" => true,
                "update" => false,
                _ => return Err(error("Use snapshot or update as the frame kind.")),
            };
            let stamp = DepthStamp {
                event_at,
                observed_at,
                sequence,
            };
            let same_frame = frames
                .last()
                .is_some_and(|last| last.stamp.sequence == sequence);
            if same_frame {
                let last = frames.last().unwrap();
                if last.stamp != stamp || last.snapshot != snapshot {
                    return Err(error(
                        "Rows in one frame must share both timestamps and the frame kind.",
                    ));
                }
                if last.levels.is_empty() {
                    return Err(error("An empty snapshot must occupy one row."));
                }
            } else {
                if frames.last().is_some_and(|last| {
                    last.stamp.sequence > sequence || last.stamp.observed_at > observed_at
                }) {
                    return Err(error(
                        "Frame sequences must increase and observation times must not decrease.",
                    ));
                }
                if snapshot {
                    snapshots.push(frames.len());
                }
                frames.push(Frame {
                    stamp,
                    snapshot,
                    levels: Vec::new(),
                });
                level_keys.clear();
            }
            if snapshot && [side, price, size] == ["", "", ""] {
                if same_frame {
                    return Err(error("An empty snapshot must occupy one row."));
                }
                continue;
            }
            let side = match side {
                "bid" => Side::Bid,
                "ask" => Side::Ask,
                _ => return Err(error("Use bid or ask as the level side.")),
            };
            let price = decimal(price)
                .ok_or_else(|| error("Use a signed price with up to six fractional digits."))?;
            let size = decimal(size)
                .filter(|size| *size > 0 || (!snapshot && *size == 0))
                .ok_or_else(|| error("Use a positive snapshot size or a nonnegative update size with up to six fractional digits."))?;
            if !level_keys.insert((side, price)) {
                return Err(error("A frame may set each side and price once."));
            }
            frames
                .last_mut()
                .unwrap()
                .levels
                .push((side, DepthLevel { price, size }));
        }
        if frames.is_empty() {
            return Err("Depth CSV contains no recorded frames.".into());
        }
        Ok(Self { frames, snapshots })
    }

    pub fn checkpoints(&self) -> Vec<i64> {
        let mut times: Vec<_> = self.frames.iter().map(|f| f.stamp.observed_at).collect();
        times.dedup();
        times
    }

    /// Take displayed liquidity once, in best-price order, at the knowledge cutoff.
    /// Both size and optional limit price use six-decimal ticks.
    pub fn sweep(
        &self,
        known_at: i64,
        side: PaperSide,
        size: i64,
        limit: Option<i64>,
    ) -> Result<DepthSweep, String> {
        if !(1..=MAX_TICKS).contains(&size) {
            return Err("Use a positive sweep size with up to six decimals.".into());
        }
        if limit.is_some_and(|limit| !(-MAX_TICKS..=MAX_TICKS).contains(&limit)) {
            return Err("Use a limit price with up to six decimals.".into());
        }
        let view = self.as_of(known_at)?;
        let execution = (view.status == DepthStatus::Synchronized).then(|| {
            let levels = match side {
                PaperSide::Buy => view.asks,
                PaperSide::Sell => view.bids,
            };
            let mut remaining = size;
            let mut notional = 0_i128;
            let mut fills = Vec::new();
            for level in levels {
                if remaining == 0
                    || limit.is_some_and(|limit| match side {
                        PaperSide::Buy => level.price > limit,
                        PaperSide::Sell => level.price < limit,
                    })
                {
                    break;
                }
                let taken = remaining.min(level.size);
                remaining -= taken;
                notional += i128::from(taken) * i128::from(level.price);
                fills.push(DepthLevel {
                    price: level.price,
                    size: taken,
                });
            }
            let filled = size - remaining;
            let mean_price = (filled > 0).then(|| rounded_div(notional, i128::from(filled)) as i64);
            DepthExecution {
                filled,
                remaining,
                notional,
                mean_price,
                fills,
            }
        });
        Ok(DepthSweep {
            status: view.status,
            received: view.received,
            snapshot: view.snapshot,
            execution,
        })
    }

    /// Use the latest full snapshot visible at the cutoff and the updates that follow it.
    pub fn as_of(&self, known_at: i64) -> Result<DepthView, String> {
        if !valid_second(known_at) {
            return Err("Use a supported UTC observation cutoff.".into());
        }
        let end = self
            .frames
            .partition_point(|f| f.stamp.observed_at <= known_at);
        let mut view = DepthView {
            status: DepthStatus::NoObservation,
            received: end.checked_sub(1).map(|index| self.frames[index].stamp),
            snapshot: None,
            bids: Vec::new(),
            asks: Vec::new(),
        };
        if end == 0 {
            return Ok(view);
        }
        let count = self.snapshots.partition_point(|index| *index < end);
        let Some(last_snapshot) = count.checked_sub(1) else {
            view.status = DepthStatus::AwaitingSnapshot;
            return Ok(view);
        };
        let start = self.snapshots[last_snapshot];
        view.snapshot = Some(self.frames[start].stamp);
        view.status = DepthStatus::Synchronized;
        let mut bids = BTreeMap::new();
        let mut asks = BTreeMap::new();
        let mut previous = None;
        for frame in &self.frames[start..end] {
            let sequence = frame.stamp.sequence;
            if let Some(expected) = previous.and_then(|seq: u64| seq.checked_add(1)) {
                if sequence != expected {
                    view.status = DepthStatus::SequenceGap {
                        expected,
                        received: sequence,
                    };
                    return Ok(view);
                }
            }
            for &(side, DepthLevel { price, size }) in &frame.levels {
                let levels = match side {
                    Side::Bid => &mut bids,
                    Side::Ask => &mut asks,
                };
                if size == 0 {
                    levels.remove(&price);
                } else {
                    levels.insert(price, size);
                }
            }
            if bids
                .last_key_value()
                .zip(asks.first_key_value())
                .is_some_and(|((bid, _), (ask, _))| bid > ask)
            {
                view.status = DepthStatus::Crossed { sequence };
                return Ok(view);
            }
            previous = Some(sequence);
        }
        let level = |(price, size)| DepthLevel { price, size };
        view.bids = bids.into_iter().rev().map(level).collect();
        view.asks = asks.into_iter().map(level).collect();
        Ok(view)
    }
}
