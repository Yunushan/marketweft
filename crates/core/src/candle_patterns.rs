use crate::{history::validate_ohlcv, replay, Bar, EventKind, Session};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum CandlePattern {
    Doji = 0,
    BullishEngulfing = 1,
    BearishEngulfing = 2,
    Piercing = 3,
    DarkCloudCover = 4,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CandlePatternHit {
    pub kind: CandlePattern,
    pub bar_index: usize,
    pub observed_at: i64,
}

fn pair_pattern(previous: &Bar, current: &Bar) -> Option<CandlePattern> {
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
    None
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
        if range > 0 && (bar.close - bar.open).abs() * 10 <= range {
            hits.push(CandlePatternHit {
                kind: CandlePattern::Doji,
                bar_index,
                observed_at: event.observed_at,
            });
        }
        if let Some(kind) = previous.and_then(|prior| pair_pattern(prior, bar)) {
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
