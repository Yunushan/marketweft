use crate::{
    delisting::valid_currency, history::valid_second, paper::MAX_SHARES, parse_delistings,
    portfolio::PortfolioIncomeReports, DelistingBook, DelistingState, LiquidityTape, PaperAccount,
    PaperAction, PaperConfig, PaperEvent, PaperOrderStatus, PaperReceipt, PaperSide, PriceBook,
    UniverseAction, MAX_TICKS,
};
use std::collections::{BTreeMap, BTreeSet};

#[path = "cross_section_delisting.rs"]
mod delisting;
use delisting::DelistingReplay;
pub use delisting::{CrossSectionDelistingClaim, CrossSectionDelistingPosting};

#[path = "cross_section_dividend.rs"]
mod dividend;
pub use dividend::CrossSectionDividendPosting;
use dividend::DividendReplay;

const BPS: i128 = 10_000;
const MAX_DECISIONS: i64 = 512;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CrossSectionConfig {
    pub from_at: i64,
    pub through_at: i64,
    pub known_at: i64,
    pub decision_seconds: u32,
    pub lookback_seconds: u32,
    pub top_listings: usize,
    pub target_shares: u64,
    pub limit_buffer_bps: u16,
    pub participation_bps: u16,
    pub paper: PaperConfig,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RankingDecision {
    pub at: i64,
    pub eligible_count: usize,
    pub missing_count: usize,
    pub selected: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionEvent {
    pub listing_id: String,
    pub event: PaperEvent,
    pub side: Option<PaperSide>,
    pub receipt: PaperReceipt,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionPosition {
    pub listing_id: String,
    pub shares: u64,
    pub cost: i128,
    pub mark: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionReport {
    pub config: CrossSectionConfig,
    pub decisions: Vec<RankingDecision>,
    pub events: Vec<CrossSectionEvent>,
    pub positions: Vec<CrossSectionPosition>,
    pub cash: i128,
    pub reserved_cash: i128,
    pub fees: i128,
    pub turnover: i128,
    pub equity: Option<i128>,
    pub dividend_postings: Vec<CrossSectionDividendPosting>,
    pub delisting_claims: Vec<CrossSectionDelistingClaim>,
    pub delisting_postings: Vec<CrossSectionDelistingPosting>,
}

struct Replay<'a> {
    prices: &'a PriceBook<'a>,
    ledger: PaperAccount,
    aliases: BTreeMap<&'a str, crate::Instrument>,
    pending: BTreeMap<&'a str, String>,
    events: Vec<CrossSectionEvent>,
}

impl Replay<'_> {
    fn record(
        &mut self,
        listing_id: &str,
        at: i64,
        action: PaperAction,
    ) -> Result<PaperReceipt, String> {
        let event = PaperEvent {
            id: format!("E-{}", self.events.len() + 1),
            observed_at: at,
            action,
        };
        let receipt = match self.ledger.apply(event.clone()) {
            Ok(crate::PaperApply::Applied(receipt)) => receipt,
            _ => {
                return Err(
                    "The generated paper history exceeded the supported event contract.".into(),
                )
            }
        };
        let side = match &event.action {
            PaperAction::Submit { side, .. } => Some(*side),
            PaperAction::Fill { order_id, .. } | PaperAction::Cancel { order_id } => {
                self.ledger.orders().get(order_id).map(|order| order.side)
            }
            PaperAction::CorporateCash { .. }
            | PaperAction::CorporatePosition { .. }
            | PaperAction::Halt => None,
        };
        self.events.push(CrossSectionEvent {
            listing_id: listing_id.to_owned(),
            event,
            side,
            receipt,
        });
        Ok(receipt)
    }

    fn fill(&mut self, quote: &crate::ReplayLiquidity, participation: u16) -> Result<bool, String> {
        let Some(order_id) = self.pending.get(quote.listing_id.as_str()).cloned() else {
            return Ok(false);
        };
        let order = &self.ledger.orders()[&order_id];
        if quote.price_at <= order.submitted_at {
            return Ok(false);
        }
        let state = self
            .prices
            .universe
            .as_of(quote.price_at, quote.observed_at)
            .into_iter()
            .find(|row| row.listing_id == quote.listing_id)
            .map(|row| row.action);
        if !matches!(state, Some(UniverseAction::Add | UniverseAction::Remove))
            || (order.side == PaperSide::Buy && state != Some(UniverseAction::Add))
        {
            return Ok(false);
        }
        let available = (i128::from(quote.shares) * i128::from(participation) / BPS) as u64;
        let shares = order.remaining.min(available);
        if shares == 0 {
            return Ok(false);
        }
        let receipt = self.record(
            &quote.listing_id,
            quote.observed_at,
            PaperAction::Fill {
                order_id: order_id.clone(),
                source_id: format!("Q-{}", quote.sequence),
                price_at: quote.price_at,
                shares,
                price: quote.price,
            },
        )?;
        if self.ledger.orders()[&order_id].status == PaperOrderStatus::Filled {
            self.pending.remove(quote.listing_id.as_str());
        }
        Ok(receipt.rejection.is_none())
    }

    fn shares(&self, listing: &str) -> u64 {
        self.ledger
            .positions()
            .get(&self.aliases[listing].to_string())
            .map_or(0, |position| position.shares)
    }

    fn move_position(
        &mut self,
        listing: &str,
        at: i64,
        source: &str,
        retired: bool,
    ) -> Result<(), String> {
        let instrument = self.aliases[listing].clone();
        let receipt = self.record(
            listing,
            at,
            PaperAction::CorporatePosition {
                instrument,
                source_id: source.to_owned(),
                retired,
            },
        )?;
        if receipt.rejection.is_some() {
            return Err("The paper ledger rejected a delisting position change.".into());
        }
        Ok(())
    }

    fn post_cash(
        &mut self,
        listing: &str,
        at: i64,
        source: &str,
        amount: i128,
    ) -> Result<String, String> {
        let receipt = self.record(
            listing,
            at,
            PaperAction::CorporateCash {
                source_id: source.to_owned(),
                amount,
            },
        )?;
        if receipt.rejection.is_some() {
            return Err("The paper ledger rejected a corporate cash posting.".into());
        }
        Ok(self.events.last().unwrap().event.id.clone())
    }
}

impl<'a> Replay<'a> {
    fn decide(&mut self, at: i64, config: CrossSectionConfig) -> Result<RankingDecision, String> {
        for (listing_id, order_id) in std::mem::take(&mut self.pending) {
            self.record(listing_id, at, PaperAction::Cancel { order_id })?;
        }
        let candidates = self
            .prices
            .screen(at - i64::from(config.lookback_seconds), at, at)?;
        let ranked = candidates
            .iter()
            .take_while(|row| row.rank.is_some())
            .count();
        let selected: BTreeSet<_> = candidates
            .iter()
            .take(ranked.min(config.top_listings))
            .map(|row| row.listing.listing_id.as_str())
            .collect();
        let active: BTreeMap<_, _> = self
            .prices
            .universe
            .as_of(at, at)
            .into_iter()
            .map(|row| (row.listing_id.as_str(), row.action))
            .collect();

        let mut orders = Vec::new();
        for (&listing, instrument) in &self.aliases {
            let owned = self.shares(listing);
            let desired = if selected.contains(listing) {
                config.target_shares
            } else {
                0
            };
            if desired == owned
                || !matches!(
                    active.get(listing),
                    Some(UniverseAction::Add | UniverseAction::Remove)
                )
            {
                continue;
            }
            let Some(mark) = self.prices.exact_close(listing, at, at) else {
                continue;
            };
            let buffer = i128::from(config.limit_buffer_bps);
            let (side, qty, limit) = if desired > owned {
                let limit = (i128::from(mark.ticks) * (BPS + buffer) + BPS - 1) / BPS;
                (
                    PaperSide::Buy,
                    desired - owned,
                    limit.min(i128::from(MAX_TICKS)) as i64,
                )
            } else {
                let limit = i128::from(mark.ticks) * (BPS - buffer) / BPS;
                (PaperSide::Sell, owned - desired, limit.max(1) as i64)
            };
            orders.push((side, listing, instrument.clone(), qty, limit));
        }
        // Sells are submitted first. A later buy still depends on actual available cash at submission.
        orders.sort_unstable_by_key(|(side, listing, _, _, _)| (*side == PaperSide::Buy, *listing));
        for (side, listing, instrument, shares, limit) in orders {
            let order_id = format!("O-{}", self.events.len() + 1);
            let receipt = self.record(
                listing,
                at,
                PaperAction::Submit {
                    order_id: order_id.clone(),
                    instrument,
                    side,
                    shares,
                    limit,
                },
            )?;
            if receipt.rejection.is_none() {
                self.pending.insert(listing, order_id);
            }
        }
        Ok(RankingDecision {
            at,
            eligible_count: ranked,
            missing_count: candidates.len() - ranked,
            selected: candidates
                .iter()
                .take(ranked.min(config.top_listings))
                .map(|row| row.listing.listing_id.clone())
                .collect(),
        })
    }
}

impl PriceBook<'_> {
    pub fn cross_section_replay(
        &self,
        liquidity: &LiquidityTape,
        config: CrossSectionConfig,
    ) -> Result<CrossSectionReport, String> {
        self.run_cross_section(liquidity, config, None, None, "")
    }

    pub fn cross_section_with_dividends(
        &self,
        liquidity: &LiquidityTape,
        config: CrossSectionConfig,
        dividend_csv: &str,
        account_currency: &str,
    ) -> Result<CrossSectionReport, String> {
        self.cross_section_with_actions(liquidity, config, dividend_csv, "", account_currency)
    }

    pub fn cross_section_with_actions(
        &self,
        liquidity: &LiquidityTape,
        config: CrossSectionConfig,
        dividend_csv: &str,
        delisting_csv: &str,
        account_currency: &str,
    ) -> Result<CrossSectionReport, String> {
        if !valid_currency(account_currency) {
            return Err("Use a three-letter uppercase paper account currency.".into());
        }
        let reports = (!dividend_csv.is_empty())
            .then(|| PortfolioIncomeReports::parse(self.universe, dividend_csv))
            .transpose()?;
        let dividends = reports
            .as_ref()
            .map(|reports| DividendReplay::new(reports, account_currency));
        let book = if delisting_csv.is_empty() {
            DelistingBook::new(self.universe.clone(), Vec::new())?
        } else {
            parse_delistings(self.universe.clone(), delisting_csv)?
        };
        let delistings =
            DelistingReplay::new(&book, account_currency, config.from_at, config.known_at)?;
        self.run_cross_section(
            liquidity,
            config,
            dividends,
            Some(delistings),
            account_currency,
        )
    }

    fn run_cross_section(
        &self,
        liquidity: &LiquidityTape,
        config: CrossSectionConfig,
        mut dividends: Option<DividendReplay<'_>>,
        mut delistings: Option<DelistingReplay<'_>>,
        account_currency: &str,
    ) -> Result<CrossSectionReport, String> {
        if liquidity.universe_name() != self.universe.name() {
            return Err("Liquidity and price inputs must use the same universe.".into());
        }
        if ![config.from_at, config.through_at, config.known_at]
            .into_iter()
            .all(valid_second)
            || config.from_at > config.through_at
            || config.decision_seconds == 0
            || config.lookback_seconds == 0
            || !valid_second(config.from_at - i64::from(config.lookback_seconds))
        {
            return Err("Use valid ordered UTC cutoffs and positive replay intervals.".into());
        }
        let step = i64::from(config.decision_seconds);
        let span = config.through_at - config.from_at;
        if span % step != 0 || span / step >= MAX_DECISIONS {
            return Err("Use at most 512 decisions with the UTC end on the decision grid.".into());
        }
        if !(1..=64).contains(&config.top_listings)
            || !(1..=MAX_SHARES).contains(&config.target_shares)
            || config.limit_buffer_bps > 10_000
            || !(1..=10_000).contains(&config.participation_bps)
        {
            return Err(
                "Supply valid ranking, share, order buffer and participation settings.".into(),
            );
        }
        let ledger =
            PaperAccount::new(config.paper).map_err(|_| "Invalid paper account settings.")?;
        let aliases = self
            .universe
            .listing_ids()
            .into_iter()
            .enumerate()
            .map(|(index, listing)| {
                crate::Instrument::new("SIM", &format!("L{index}"))
                    .map(|instrument| (listing, instrument))
            })
            .collect::<Result<_, _>>()?;
        let mut replay = Replay {
            prices: self,
            ledger,
            aliases,
            pending: BTreeMap::new(),
            events: Vec::new(),
        };
        let mut observed = liquidity
            .through(config.known_at)
            .iter()
            .filter(|quote| quote.price_at <= config.through_at)
            .peekable();
        let mut advance = |replay: &mut Replay<'_>, through: i64| -> Result<(), String> {
            loop {
                let quote_time = observed.peek().map(|row| row.observed_at);
                let dividend_time = dividends.as_mut().and_then(DividendReplay::next_time);
                let delisting_time = delistings.as_mut().and_then(DelistingReplay::next_time);
                let Some(at) = [quote_time, dividend_time, delisting_time]
                    .into_iter()
                    .flatten()
                    .min()
                else {
                    break;
                };
                if at > through {
                    break;
                }
                if delisting_time == Some(at) {
                    let changes = delistings
                        .as_mut()
                        .unwrap()
                        .advance(replay, config.through_at)?;
                    if let Some(income) = dividends.as_mut() {
                        for listing in changes {
                            income.observe_position(&listing, at, replay.shares(&listing));
                        }
                    }
                } else if dividend_time == Some(at) {
                    let income = dividends.as_mut().unwrap();
                    for mut posting in income.next_postings(config.through_at) {
                        if posting.currency == income.currency {
                            posting.receipt_id = Some(replay.post_cash(
                                &posting.listing_id,
                                at,
                                &posting.dividend_id,
                                posting.cash_delta,
                            )?);
                        }
                        income.postings.push(posting);
                    }
                } else {
                    let quote = observed.next().unwrap();
                    let executed = replay.fill(quote, config.participation_bps)?;
                    if let Some(income) = dividends.as_mut().filter(|_| executed) {
                        income.observe_position(
                            &quote.listing_id,
                            at,
                            replay.shares(&quote.listing_id),
                        );
                    }
                }
            }
            Ok(())
        };
        let mut decisions = Vec::new();
        for slot in 0..=span / step {
            let at = config.from_at + slot * step;
            if at > config.known_at {
                break;
            }
            advance(&mut replay, at)?;
            decisions.push(replay.decide(at, config)?);
        }
        advance(&mut replay, config.known_at)?;
        let membership: BTreeMap<_, _> = self
            .universe
            .as_of(config.through_at, config.known_at)
            .into_iter()
            .map(|row| (row.listing_id.as_str(), row.action))
            .collect();
        let positions: Vec<_> = replay
            .aliases
            .iter()
            .filter_map(|(&listing_id, alias)| {
                let position = replay.ledger.positions().get(&alias.to_string())?;
                if position.shares == 0 {
                    return None;
                }
                let mark = matches!(
                    membership.get(listing_id),
                    Some(UniverseAction::Add | UniverseAction::Remove)
                )
                .then(|| self.exact_close(listing_id, config.through_at, config.known_at))
                .flatten()
                .map(|quote| quote.ticks);
                Some(CrossSectionPosition {
                    listing_id: listing_id.to_owned(),
                    shares: position.shares,
                    cost: position.cost,
                    mark,
                })
            })
            .collect();
        let cash = replay.ledger.cash();
        let equity = positions.iter().try_fold(cash, |total, position| {
            Some(total + i128::from(position.shares) * i128::from(position.mark?))
        });
        let delisting_claims: Vec<_> = delistings
            .iter()
            .flat_map(DelistingReplay::claims)
            .cloned()
            .collect();
        let equity = equity.and_then(|total| {
            delisting_claims
                .iter()
                .try_fold(total, |total, claim| match claim.state {
                    DelistingState::MissingProceeds => None,
                    DelistingState::Receivable
                        if claim.currency.as_deref() == Some(account_currency) =>
                    {
                        Some(total + claim.amount?)
                    }
                    _ => Some(total),
                })
        });
        let fees = replay.events.iter().map(|event| event.receipt.fee).sum();
        let turnover = replay
            .events
            .iter()
            .filter_map(|row| match &row.event.action {
                PaperAction::Fill { shares, price, .. } if row.receipt.rejection.is_none() => {
                    Some(i128::from(*shares) * i128::from(*price))
                }
                _ => None,
            })
            .sum();
        Ok(CrossSectionReport {
            config,
            decisions,
            events: replay.events,
            positions,
            cash,
            reserved_cash: replay.ledger.reserved_cash(),
            fees,
            turnover,
            equity,
            dividend_postings: dividends.map_or_else(Vec::new, |income| income.postings),
            delisting_claims,
            delisting_postings: delistings.map_or_else(Vec::new, |book| book.postings),
        })
    }
}
