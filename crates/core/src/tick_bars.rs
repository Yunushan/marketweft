use crate::{
    history::{decimal, timestamp, valid_second},
    Bar, Instrument, MAX_BARS, MAX_INPUT_BYTES, MAX_TICKS,
};

const HEADER: &str = "instrument,executed_at,observed_at,sequence,price,size";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Trade {
    observed_at: i64,
    sequence: u64,
    price: i64,
    size: i64,
}

/// One instrument's recorded capture sequence, ordered by observation.
pub struct TradeTape {
    trades: Vec<Trade>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TickBar {
    pub bar: Bar,
    pub available_at: i64,
    pub first_sequence: u64,
    pub last_sequence: u64,
    pub observed_trades: u32,
    pub target_trades: u32,
}

impl TradeTape {
    pub fn parse(csv: &str, instrument: &Instrument) -> Result<Self, String> {
        if csv.len() > MAX_INPUT_BYTES {
            return Err("Trade CSV exceeds 8 MiB.".into());
        }
        let mut lines = csv
            .trim_start_matches('\u{feff}')
            .lines()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty());
        if lines.next().map(|(_, line)| line.trim()) != Some(HEADER) {
            return Err(format!("Expected trade CSV header {HEADER}."));
        }

        let mut trades: Vec<Trade> = Vec::new();
        let expected_id = instrument.to_string();
        for (index, line) in lines {
            let error = |message: &str| format!("Trade line {}: {message}", index + 1);
            if trades.len() == MAX_BARS {
                return Err(error("Trade CSV exceeds 100,000 trades."));
            }
            let mut cells = line.split(',').map(str::trim);
            if cells.next() != Some(expected_id.as_str()) {
                return Err(error("Instrument must match the selected chart."));
            }
            let executed_at = cells
                .next()
                .and_then(timestamp)
                .ok_or_else(|| error("Use an execution timestamp in UTC."))?;
            let observed_at = cells
                .next()
                .and_then(timestamp)
                .ok_or_else(|| error("Use an observation timestamp in UTC."))?;
            let sequence = cells
                .next()
                .and_then(|cell| cell.parse::<u64>().ok())
                .filter(|sequence| *sequence > 0)
                .ok_or_else(|| error("Use a positive capture sequence number."))?;
            let price = cells
                .next()
                .and_then(decimal)
                .ok_or_else(|| error("Use a signed price with at most six fractional digits."))?;
            let size = cells
                .next()
                .and_then(decimal)
                .filter(|size| *size > 0)
                .ok_or_else(|| error("Use a positive size with at most six fractional digits."))?;
            if cells.next().is_some() {
                return Err(error("Expected exactly six fields."));
            }
            if observed_at < executed_at {
                return Err(error("Observation time precedes execution time."));
            }
            if trades
                .last()
                .is_some_and(|last| observed_at < last.observed_at || sequence <= last.sequence)
            {
                return Err(error("Observation times must not decrease and capture sequences must increase strictly."));
            }
            trades.push(Trade {
                observed_at,
                sequence,
                price,
                size,
            });
        }
        if trades.is_empty() {
            return Err("Trade CSV contains no recorded trades.".into());
        }
        Ok(Self { trades })
    }

    /// Group the observed prefix in capture order. A short final group is provisional.
    pub fn bars(&self, target_trades: u32, known_at: Option<i64>) -> Result<Vec<TickBar>, String> {
        let count = target_trades as usize;
        if !(1..=MAX_BARS).contains(&count) {
            return Err("Use 1 to 100,000 trades per bar.".into());
        }
        if known_at.is_some_and(|time| !valid_second(time)) {
            return Err("Use a supported UTC observation cutoff.".into());
        }
        let end = known_at.map_or(self.trades.len(), |time| {
            self.trades
                .partition_point(|trade| trade.observed_at <= time)
        });
        self.trades[..end]
            .chunks(count)
            .map(|trades| {
                let first = trades[0];
                let last = trades[trades.len() - 1];
                let mut high = first.price;
                let mut low = first.price;
                let mut volume = 0;
                for trade in trades {
                    high = high.max(trade.price);
                    low = low.min(trade.price);
                    volume += trade.size;
                    if volume > MAX_TICKS {
                        return Err("Tick bar volume exceeds the supported OHLCV range.".into());
                    }
                }
                Ok(TickBar {
                    bar: Bar {
                        time: first.observed_at,
                        open: first.price,
                        high,
                        low,
                        close: last.price,
                        volume,
                    },
                    available_at: last.observed_at,
                    first_sequence: first.sequence,
                    last_sequence: last.sequence,
                    observed_trades: trades.len() as u32,
                    target_trades,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOURCE: &str = concat!(
        "instrument,executed_at,observed_at,sequence,price,size\n",
        "LOCAL:TICK,0,0,9007199254740993,5,0.000001\n",
        "LOCAL:TICK,0,0,9007199254740994,-2,0.000002\n",
        "LOCAL:TICK,0,1,9007199254740995,7,1.5\n",
        "LOCAL:TICK,-1,5,9007199254740996,4,0.3\n",
        "LOCAL:TICK,4,5,9007199254740997,6,0.2",
    );

    #[test]
    fn orders_equal_seconds_and_late_trades_by_observation_and_keeps_closed_prefixes() {
        let instrument = Instrument::new("local", "tick").unwrap();
        let tape = TradeTape::parse(SOURCE, &instrument).unwrap();
        assert!(tape.bars(3, Some(-1)).unwrap().is_empty());
        let tied = tape.bars(1, Some(0)).unwrap();
        assert_eq!(tied.len(), 2);
        assert_eq!(tied[0].bar.time, tied[1].bar.time);
        assert_eq!(tied[1].first_sequence, 9_007_199_254_740_994);
        let early = tape.bars(3, Some(0)).unwrap();
        assert_eq!((early[0].observed_trades, early[0].target_trades), (2, 3));
        assert_eq!(early[0].bar.close, -2 * crate::SCALE);
        let first_closed = tape.bars(3, Some(1)).unwrap();
        assert_eq!(first_closed[0].bar.volume, 1_500_003);
        assert_eq!(first_closed[0].bar.high, 7 * crate::SCALE);
        assert_eq!(first_closed[0].bar.low, -2 * crate::SCALE);
        let full = tape.bars(3, None).unwrap();
        assert_eq!(first_closed, full[..1]);
        assert_eq!(full[1].bar.time, 5);
        assert_eq!(full[1].bar.volume, 500_000);
        assert_eq!(full[1].observed_trades, 2);
    }

    #[test]
    fn rejects_foreign_instruments_reordered_ties_future_execution_and_overflow() {
        let id = Instrument::new("local", "tick").unwrap();
        let other = Instrument::new("local", "other").unwrap();
        assert!(TradeTape::parse(SOURCE, &other).is_err());
        assert!(
            TradeTape::parse(&SOURCE.replace("9007199254740994", "9007199254740993"), &id).is_err()
        );
        assert!(
            TradeTape::parse(&SOURCE.replace("LOCAL:TICK,-1,5", "LOCAL:TICK,6,5"), &id).is_err()
        );
        let wide = SOURCE.replace("5,0.000001", "5,2000000000");
        assert!(TradeTape::parse(&wide, &id)
            .unwrap()
            .bars(3, None)
            .unwrap_err()
            .contains("volume"));
    }
}
