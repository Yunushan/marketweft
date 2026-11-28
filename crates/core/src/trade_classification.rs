use super::{AggressorSide, Trade, TradeTape};
use crate::{history::valid_second, BestQuote, DepthStatus, DepthTape};
use std::cmp::Ordering;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TradeClassificationConfig {
    pub from_at: i64,
    pub through_at: i64,
    pub known_at: i64,
    pub quote_max_age_seconds: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TradeSideBasis {
    Reported,
    QuoteMidpoint,
    AtMidpoint,
    NoDepth,
    UnsynchronizedDepth,
    IncompleteQuote,
    StaleQuote,
    LockedQuote,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TradeClassification {
    pub executed_at: i64,
    pub observed_at: i64,
    pub sequence: u64,
    pub price: i64,
    pub size: i64,
    pub side: AggressorSide,
    pub basis: TradeSideBasis,
    pub quote: Option<BestQuote>,
}

impl TradeTape {
    /// Use recorded sides when present. Infer only with an uncrossed, complete, fresh quote
    /// observed strictly before execution, leaving ties and unsupported rows unknown.
    pub fn classify_trades(
        &self,
        depth: &DepthTape,
        config: TradeClassificationConfig,
    ) -> Result<Vec<TradeClassification>, String> {
        if self.instrument() != depth.instrument() {
            return Err("Trade and depth reports must describe the same instrument.".into());
        }
        let TradeClassificationConfig {
            from_at,
            through_at,
            known_at,
            quote_max_age_seconds,
        } = config;
        if ![from_at, through_at, known_at]
            .into_iter()
            .all(valid_second)
            || from_at > through_at
        {
            return Err("Use valid UTC times and an ordered trade execution window.".into());
        }
        if quote_max_age_seconds == 0 {
            return Err("Use a positive whole-second maximum quote age.".into());
        }
        let through = through_at.min(known_at);
        let quotes = depth.quotes_before(through);
        Ok(self
            .observed_prefix(Some(known_at))
            .iter()
            .filter(|trade| (from_at..=through).contains(&trade.executed_at))
            .map(|trade| {
                let quote = (trade.side == AggressorSide::Unknown)
                    .then(|| {
                        let end = quotes
                            .partition_point(|quote| quote.stamp.observed_at < trade.executed_at);
                        end.checked_sub(1).map(|index| quotes[index])
                    })
                    .flatten();
                let (side, basis) = classify(trade, quote, i64::from(quote_max_age_seconds));
                TradeClassification {
                    executed_at: trade.executed_at,
                    observed_at: trade.observed_at,
                    sequence: trade.sequence,
                    price: trade.price,
                    size: trade.size,
                    side,
                    basis,
                    quote,
                }
            })
            .collect())
    }
}

fn classify(
    trade: &Trade,
    quote: Option<BestQuote>,
    max_age: i64,
) -> (AggressorSide, TradeSideBasis) {
    use {AggressorSide::Unknown, TradeSideBasis::*};
    if trade.side != Unknown {
        return (trade.side, Reported);
    }
    let Some(quote) = quote else {
        return (Unknown, NoDepth);
    };
    if quote.status != DepthStatus::Synchronized {
        return (Unknown, UnsynchronizedDepth);
    }
    let (Some(bid), Some(ask)) = (quote.bid, quote.ask) else {
        return (Unknown, IncompleteQuote);
    };
    if trade.executed_at - bid.stamp.event_at > max_age
        || trade.executed_at - ask.stamp.event_at > max_age
    {
        return (Unknown, StaleQuote);
    }
    if bid.price == ask.price {
        return (Unknown, LockedQuote);
    }
    match (trade.price * 2).cmp(&(bid.price + ask.price)) {
        Ordering::Greater => (AggressorSide::Buy, QuoteMidpoint),
        Ordering::Less => (AggressorSide::Sell, QuoteMidpoint),
        Ordering::Equal => (Unknown, AtMidpoint),
    }
}
