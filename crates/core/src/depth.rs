use crate::{
    history::{decimal, exact_utc, valid_second},
    screen::rounded_div,
    Instrument, PaperSide, MAX_BARS, MAX_INPUT_BYTES, MAX_TICKS,
};
use std::collections::{BTreeMap, BTreeSet};

const HEADER: &str = "instrument,event_at,observed_at,sequence,kind,side,price,size";

#[path = "paper_depth.rs"]
mod paper_depth;
pub use paper_depth::{PaperDepthReplay, PaperDepthReport};

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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StampedDepthLevel {
    pub price: i64,
    pub stamp: DepthStamp,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BestQuote {
    pub stamp: DepthStamp,
    pub status: DepthStatus,
    pub bid: Option<StampedDepthLevel>,
    pub ask: Option<StampedDepthLevel>,
}

struct DepthBook {
    status: DepthStatus,
    received: Option<DepthStamp>,
    snapshot: Option<DepthStamp>,
    bids: BTreeMap<i64, (i64, DepthStamp)>,
    asks: BTreeMap<i64, (i64, DepthStamp)>,
}

impl DepthBook {
    fn new() -> Self {
        Self {
            status: DepthStatus::NoObservation,
            received: None,
            snapshot: None,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
        }
    }

    fn apply(&mut self, frame: &Frame) {
        let previous = self.received.replace(frame.stamp);
        if frame.snapshot {
            self.snapshot = Some(frame.stamp);
            self.status = DepthStatus::Synchronized;
            self.bids.clear();
            self.asks.clear();
        } else if self.status != DepthStatus::Synchronized {
            if self.status == DepthStatus::NoObservation {
                self.status = DepthStatus::AwaitingSnapshot;
            }
            return;
        } else if let Some(expected) = previous
            .and_then(|stamp| stamp.sequence.checked_add(1))
            .filter(|expected| *expected != frame.stamp.sequence)
        {
            self.status = DepthStatus::SequenceGap {
                expected,
                received: frame.stamp.sequence,
            };
            return;
        }
        for &(side, DepthLevel { price, size }) in &frame.levels {
            let levels = match side {
                Side::Bid => &mut self.bids,
                Side::Ask => &mut self.asks,
            };
            if size == 0 {
                levels.remove(&price);
            } else {
                levels.insert(price, (size, frame.stamp));
            }
        }
        if self
            .bids
            .last_key_value()
            .zip(self.asks.first_key_value())
            .is_some_and(|((bid, _), (ask, _))| bid > ask)
        {
            self.status = DepthStatus::Crossed {
                sequence: frame.stamp.sequence,
            };
        }
    }

    fn quote(&self, stamp: DepthStamp) -> BestQuote {
        let mut quote = BestQuote {
            stamp,
            status: self.status,
            bid: None,
            ask: None,
        };
        if self.status == DepthStatus::Synchronized {
            let level = |(&price, &(_, stamp)): (&i64, &(i64, DepthStamp))| StampedDepthLevel {
                price,
                stamp,
            };
            quote.bid = self.bids.last_key_value().map(level);
            quote.ask = self.asks.first_key_value().map(level);
        }
        quote
    }

    fn view(self) -> DepthView {
        let mut view = DepthView {
            status: self.status,
            received: self.received,
            snapshot: self.snapshot,
            bids: Vec::new(),
            asks: Vec::new(),
        };
        if self.status == DepthStatus::Synchronized {
            let level = |(price, (size, _))| DepthLevel { price, size };
            view.bids = self.bids.into_iter().rev().map(level).collect();
            view.asks = self.asks.into_iter().map(level).collect();
        }
        view
    }
}

/// A single instrument's normalized snapshots and atomic level updates.
pub struct DepthTape {
    instrument: Instrument,
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
        Ok(Self {
            instrument: instrument.clone(),
            frames,
            snapshots,
        })
    }

    pub(crate) fn instrument(&self) -> &Instrument {
        &self.instrument
    }

    pub(crate) fn quotes_before(&self, cutoff: i64) -> Vec<BestQuote> {
        let mut book = DepthBook::new();
        self.frames
            .iter()
            .take_while(|frame| frame.stamp.observed_at < cutoff)
            .map(|frame| {
                book.apply(frame);
                book.quote(frame.stamp)
            })
            .collect()
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
        let mut book = DepthBook::new();
        let count = self.snapshots.partition_point(|index| *index < end);
        let Some(last_snapshot) = count.checked_sub(1) else {
            if let Some(frame) = end.checked_sub(1).map(|index| &self.frames[index]) {
                book.apply(frame);
            }
            return Ok(book.view());
        };
        let start = self.snapshots[last_snapshot];
        for frame in &self.frames[start..end] {
            book.apply(frame);
        }
        Ok(book.view())
    }
}
