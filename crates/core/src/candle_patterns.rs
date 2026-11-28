use crate::{history::validate_ohlcv, replay, Bar, EventKind, Session};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum CandlePattern {
    Doji = 0,
    BullishEngulfing = 1,
    BearishEngulfing = 2,
    Piercing = 3,
    DarkCloudCover = 4,
    BullishHarami = 5,
    BearishHarami = 6,
    BullishHaramiCross = 7,
    BearishHaramiCross = 8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CandlePatternHit {
    pub kind: CandlePattern,
    pub bar_index: usize,
    pub observed_at: i64,
}

fn harami(previous: &Bar, current: &Bar, doji: bool) -> Option<CandlePattern> {
    let previous_bottom = previous.open.min(previous.close);
    let previous_top = previous.open.max(previous.close);
    let bottom = current.open.min(current.close);
    let top = current.open.max(current.close);
    let previous_body = previous_top - previous_bottom;
    let body = top - bottom;
    if bottom <= previous_bottom
        || top >= previous_top
        || previous_body * 2 < previous.high - previous.low
        || body * 2 > previous_body
    {
        return None;
    }
    let previous_rising = previous.close > previous.open;
    if doji {
        return Some(if previous_rising {
            CandlePattern::BearishHaramiCross
        } else {
            CandlePattern::BullishHaramiCross
        });
    }
    match (previous_rising, current.close.cmp(&current.open)) {
        (true, std::cmp::Ordering::Less) => Some(CandlePattern::BearishHarami),
        (false, std::cmp::Ordering::Greater) => Some(CandlePattern::BullishHarami),
        _ => None,
    }
}

fn pair_pattern(previous: &Bar, current: &Bar, doji: bool) -> Option<CandlePattern> {
    let (previous_open, previous_close) = (previous.open, previous.close);
    let (open, close) = (current.open, current.close);
    if previous_open > previous_close
        && open <= previous_close
        && close >= previous_open
        && (open < previous_close || close > previous_open)
    {
        return Some(CandlePattern::BullishEngulfing);
    }
    if previous_close > previous_open
        && open >= previous_close
        && close <= previous_open
        && (open > previous_close || close < previous_open)
    {
        return Some(CandlePattern::BearishEngulfing);
    }
    // Compare twice the close to the prior body sum so odd-tick midpoints
    // remain exact. A midpoint or prior-open tie is outside either rule.
    let midpoint_twice = previous_open + previous_close;
    if previous_open > previous_close
        && open < previous.low
        && close * 2 > midpoint_twice
        && close < previous_open
    {
        return Some(CandlePattern::Piercing);
    }
    if previous_close > previous_open
        && open > previous.high
        && close * 2 < midpoint_twice
        && close > previous_open
    {
        return Some(CandlePattern::DarkCloudCover);
    }
    harami(previous, current, doji)
}

/// Classify completed raw candles through the inclusive observation cutoff.
/// Pair patterns require consecutive observed intervals in the same session.
pub fn replay_candle_patterns(
    sessions: &[Session],
    interval_seconds: u32,
    bars: &[Bar],
    known_at: i64,
) -> Result<Vec<CandlePatternHit>, String> {
    let times: Vec<_> = bars.iter().map(|bar| bar.time).collect();
    let events = replay(sessions, &times, interval_seconds)?;
    let mut hits = Vec::new();
    let mut previous = None;
    for event in events
        .iter()
        .take_while(|event| event.observed_at <= known_at)
    {
        let Some(bar_index) = event.bar_index.filter(|_| event.kind == EventKind::Bar) else {
            previous = None;
            continue;
        };
        let bar = &bars[bar_index];
        validate_ohlcv(bar, bar_index)?;
        let range = bar.high - bar.low;
        let doji = range > 0 && (bar.close - bar.open).abs() * 10 <= range;
        if doji {
            hits.push(CandlePatternHit {
                kind: CandlePattern::Doji,
                bar_index,
                observed_at: event.observed_at,
            });
        }
        if let Some(kind) = previous.and_then(|prior| pair_pattern(prior, bar, doji)) {
            hits.push(CandlePatternHit {
                kind,
                bar_index,
                observed_at: event.observed_at,
            });
        }
        previous = Some(bar);
    }
    Ok(hits)
}
