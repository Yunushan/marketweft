use crate::{
    delisting::valid_currency,
    history::valid_second,
    paper::MAX_SHARES,
    parse_delistings,
    portfolio::{
        parse_capital_return_reports, parse_successor_terms,
        successor_delivery_postings_from_observed_positions, value_successor_shares,
        PortfolioIncomeReports, SuccessorReports,
    },
    screen::rounded_div,
    ChildShares, DelistingBook, DelistingState, LiquidityTape, PaperAccount, PaperAction,
    PaperConfig, PaperEvent, PaperOrderStatus, PaperReceipt, PaperSide, PortfolioDividendState,
    PriceBook, PriceObservation, SuccessorDeliveryPosting, SuccessorShareState,
    SuccessorShareTerms, UniverseAction, MAX_TICKS,
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

#[path = "cross_section_walk.rs"]
mod walk;
pub use walk::{
    CrossSectionCandidate, CrossSectionFold, CrossSectionScore, CrossSectionWalkConfig,
};

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

impl CrossSectionConfig {
    fn decisions(self) -> Result<usize, String> {
        if ![self.from_at, self.through_at, self.known_at]
            .into_iter()
            .all(valid_second)
            || self.from_at > self.through_at
            || self.decision_seconds == 0
            || self.lookback_seconds == 0
            || !valid_second(self.from_at - i64::from(self.lookback_seconds))
        {
            return Err("Use valid ordered UTC cutoffs and positive replay intervals.".into());
        }
        let step = i64::from(self.decision_seconds);
        let span = self.through_at - self.from_at;
        if span % step != 0 || span / step >= MAX_DECISIONS {
            return Err("Use at most 512 decisions with the UTC end on the decision grid.".into());
        }
        if !(1..=64).contains(&self.top_listings)
            || !(1..=MAX_SHARES).contains(&self.target_shares)
            || self.limit_buffer_bps > 10_000
            || !(1..=10_000).contains(&self.participation_bps)
        {
            return Err(
                "Supply valid ranking, share, order buffer and participation settings.".into(),
            );
        }
        Ok((span / step + 1) as usize)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct CrossSectionActionSources<'a> {
    pub dividends: &'a str,
    pub delistings: &'a str,
    pub account_currency: &'a str,
}

struct CorporateReports<'a> {
    income: Option<PortfolioIncomeReports>,
    capital_returns: Option<PortfolioIncomeReports>,
    delistings: DelistingBook,
    successors: Option<SuccessorReports>,
    currency: &'a str,
}

impl<'a> CorporateReports<'a> {
    fn parse(
        prices: &PriceBook<'_>,
        sources: CrossSectionActionSources<'a>,
        successor_terms: &str,
        capital_returns: &str,
    ) -> Result<Self, String> {
        if !valid_currency(sources.account_currency) {
            return Err("Use a three-letter uppercase paper account currency.".into());
        }
        let income = (!sources.dividends.is_empty())
            .then(|| PortfolioIncomeReports::parse_replay(prices.universe, sources.dividends))
            .transpose()?;
        let delistings = if sources.delistings.is_empty() {
            DelistingBook::new(prices.universe.clone(), Vec::new())?
        } else {
            parse_delistings(prices.universe.clone(), sources.delistings)?
        };
        Ok(Self {
            income,
            capital_returns: (!capital_returns.is_empty())
                .then(|| parse_capital_return_reports(prices.universe, capital_returns))
                .transpose()?,
            delistings,
            successors: (!successor_terms.is_empty())
                .then(|| parse_successor_terms(prices.universe, successor_terms))
                .transpose()?,
            currency: sources.account_currency,
        })
    }
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
pub struct CrossSectionSuccessorClaim {
    pub listing_id: String,
    pub change_id: String,
    pub effective_at: i64,
    pub observed_at: i64,
    pub terms: SuccessorShareTerms,
    pub position_at: i64,
    pub entitled_shares: u64,
    pub shares: ChildShares,
    pub state: SuccessorShareState,
    pub mark: Option<PriceObservation>,
    pub value: Option<i128>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionSuccessorPosting {
    pub delivery: SuccessorDeliveryPosting,
    pub position_receipt_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionCapitalReturnPosting {
    pub listing_id: String,
    pub action_id: String,
    pub posted_at: i64,
    pub observed_at: i64,
    pub ex_at: i64,
    pub pay_at: i64,
    pub entitled_shares: u64,
    pub currency: String,
    pub cash_delta: i128,
    pub receipt_id: Option<String>,
}

impl From<CrossSectionDividendPosting> for CrossSectionCapitalReturnPosting {
    fn from(row: CrossSectionDividendPosting) -> Self {
        Self {
            listing_id: row.listing_id,
            action_id: row.dividend_id,
            posted_at: row.posted_at,
            observed_at: row.observed_at,
            ex_at: row.ex_at,
            pay_at: row.pay_at,
            entitled_shares: row.entitled_shares,
            currency: row.currency,
            cash_delta: row.cash_delta,
            receipt_id: row.receipt_id,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionCapitalReturnClaim {
    pub listing_id: String,
    pub action_id: String,
    pub observed_at: i64,
    pub ex_at: i64,
    pub pay_at: i64,
    pub entitled_shares: u64,
    pub currency: String,
    pub amount: i128,
    pub state: PortfolioDividendState,
    pub position_receipt_id: Option<String>,
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
    pub has_reported_dividend_withholding: bool,
    pub dividend_postings: Vec<CrossSectionDividendPosting>,
    pub capital_return_claims: Vec<CrossSectionCapitalReturnClaim>,
    pub capital_return_postings: Vec<CrossSectionCapitalReturnPosting>,
    pub delisting_claims: Vec<CrossSectionDelistingClaim>,
    pub delisting_postings: Vec<CrossSectionDelistingPosting>,
    pub successor_claims: Vec<CrossSectionSuccessorClaim>,
}

struct PaperPositionObservation {
    shares: u32,
    event_index: usize,
}

type PaperHoldings = BTreeMap<String, BTreeMap<i64, PaperPositionObservation>>;

struct ReplayOutcome {
    report: CrossSectionReport,
    holdings: Option<PaperHoldings>,
}

struct Replay<'a> {
    prices: &'a PriceBook<'a>,
    ledger: PaperAccount,
    aliases: BTreeMap<&'a str, crate::Instrument>,
    pending: BTreeMap<&'a str, String>,
    events: Vec<CrossSectionEvent>,
    holdings: Option<PaperHoldings>,
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
        if let Some(holdings) = self.holdings.as_mut().filter(|_| {
            receipt.rejection.is_none()
                && matches!(
                    event.action,
                    PaperAction::Fill { .. } | PaperAction::CorporatePosition { .. }
                )
        }) {
            let shares = self
                .ledger
                .positions()
                .get(&self.aliases[listing_id].to_string())
                .map_or(0, |position| position.shares as u32);
            holdings.entry(listing_id.to_owned()).or_default().insert(
                at,
                PaperPositionObservation {
                    shares,
                    event_index: self.events.len(),
                },
            );
        }
        self.events.push(CrossSectionEvent {
            listing_id: listing_id.to_owned(),
            event,
            side,
            receipt,
        });
        Ok(receipt)
    }

    fn fill(&mut self, quote: &crate::ReplayLiquidity, participation: u16) -> Result<(), String> {
        let Some(order_id) = self.pending.get(quote.listing_id.as_str()).cloned() else {
            return Ok(());
        };
        let order = &self.ledger.orders()[&order_id];
        if quote.price_at <= order.submitted_at {
            return Ok(());
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
            return Ok(());
        }
        let available = (i128::from(quote.shares) * i128::from(participation) / BPS) as u64;
        let shares = order.remaining.min(available);
        if shares == 0 {
            return Ok(());
        }
        self.record(
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
        Ok(())
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
        self.run_cross_section(liquidity, config, None)
            .map(|run| run.report)
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
        self.cross_section_with_successor_shares(
            liquidity,
            config,
            CrossSectionActionSources {
                dividends: dividend_csv,
                delistings: delisting_csv,
                account_currency,
            },
            "",
        )
    }

    pub fn cross_section_with_successor_shares(
        &self,
        liquidity: &LiquidityTape,
        config: CrossSectionConfig,
        corporate: CrossSectionActionSources<'_>,
        successor_terms: &str,
    ) -> Result<CrossSectionReport, String> {
        self.cross_section_with_distributions(liquidity, config, corporate, successor_terms, "")
    }

    pub fn cross_section_with_distributions(
        &self,
        liquidity: &LiquidityTape,
        config: CrossSectionConfig,
        corporate: CrossSectionActionSources<'_>,
        successor_terms: &str,
        capital_returns: &str,
    ) -> Result<CrossSectionReport, String> {
        let reports = CorporateReports::parse(self, corporate, successor_terms, capital_returns)?;
        self.run_cross_section(liquidity, config, Some(&reports))
            .map(|run| run.report)
    }

    pub fn cross_section_successor_delivery_journal(
        &self,
        liquidity: &LiquidityTape,
        config: CrossSectionConfig,
        corporate: CrossSectionActionSources<'_>,
        successor_terms: &str,
    ) -> Result<Vec<CrossSectionSuccessorPosting>, String> {
        self.cross_section_successor_journal_with_distributions(
            liquidity,
            config,
            corporate,
            successor_terms,
            "",
        )
    }

    pub fn cross_section_successor_journal_with_distributions(
        &self,
        liquidity: &LiquidityTape,
        config: CrossSectionConfig,
        corporate: CrossSectionActionSources<'_>,
        successor_terms: &str,
        capital_returns: &str,
    ) -> Result<Vec<CrossSectionSuccessorPosting>, String> {
        let reports = CorporateReports::parse(self, corporate, successor_terms, capital_returns)?;
        let successors = reports
            .successors
            .as_ref()
            .ok_or("Supply successor share terms for the paper delivery journal.")?;
        let ReplayOutcome { report, holdings } =
            self.run_cross_section(liquidity, config, Some(&reports))?;
        let holdings = holdings.expect("successor replay records observed holdings");
        let positions = holdings.iter().flat_map(|(listing, history)| {
            history
                .iter()
                .map(|(&at, position)| (listing.as_str(), at, position.shares))
        });
        let postings = successor_delivery_postings_from_observed_positions(
            self.universe,
            successors,
            config.through_at,
            config.known_at,
            positions,
        )?;
        Ok(postings
            .into_iter()
            .map(|delivery| {
                let observation = &holdings[&delivery.listing_id][&delivery.position_observed_at];
                let position_receipt_id = report.events[observation.event_index].event.id.clone();
                CrossSectionSuccessorPosting {
                    delivery,
                    position_receipt_id,
                }
            })
            .collect())
    }

    fn run_cross_section(
        &self,
        liquidity: &LiquidityTape,
        config: CrossSectionConfig,
        corporate: Option<&CorporateReports<'_>>,
    ) -> Result<ReplayOutcome, String> {
        if liquidity.universe_name() != self.universe.name() {
            return Err("Liquidity and price inputs must use the same universe.".into());
        }
        let count = config.decisions()?;
        let step = i64::from(config.decision_seconds);
        let account_currency = corporate.map_or("", |reports| reports.currency);
        let successors = corporate.and_then(|reports| reports.successors.as_ref());
        let income = corporate.and_then(|reports| reports.income.as_ref());
        let mut dividends = income.map(|income| DividendReplay::new(income, account_currency));
        let return_reports = corporate.and_then(|reports| reports.capital_returns.as_ref());
        let mut capital_returns =
            return_reports.map(|reports| DividendReplay::new(reports, account_currency));
        let mut delistings = corporate
            .map(|reports| {
                DelistingReplay::new(
                    &reports.delistings,
                    account_currency,
                    config.from_at,
                    config.known_at,
                )
            })
            .transpose()?;
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
            holdings: (dividends.is_some() || successors.is_some() || capital_returns.is_some())
                .then(BTreeMap::new),
        };
        let observed = liquidity.through(config.known_at);
        let first = observed.partition_point(|quote| quote.observed_at < config.from_at);
        let mut observed = observed[first..]
            .iter()
            .filter(|quote| quote.price_at <= config.through_at)
            .peekable();
        let mut advance = |replay: &mut Replay<'_>, through: i64| -> Result<(), String> {
            loop {
                let quote_time = observed.peek().map(|row| row.observed_at);
                let dividend_time = dividends.as_mut().and_then(DividendReplay::next_time);
                let capital_return_time =
                    capital_returns.as_mut().and_then(DividendReplay::next_time);
                let delisting_time = delistings.as_mut().and_then(DelistingReplay::next_time);
                let Some(at) = [
                    quote_time,
                    dividend_time,
                    delisting_time,
                    capital_return_time,
                ]
                .into_iter()
                .flatten()
                .min() else {
                    break;
                };
                if at > through {
                    break;
                }
                if delisting_time == Some(at) {
                    delistings
                        .as_mut()
                        .unwrap()
                        .advance(replay, config.through_at)?;
                } else if dividend_time == Some(at) {
                    dividends
                        .as_mut()
                        .unwrap()
                        .advance(replay, config.through_at)?;
                } else if capital_return_time == Some(at) {
                    capital_returns
                        .as_mut()
                        .unwrap()
                        .advance(replay, config.through_at)?;
                } else {
                    let quote = observed.next().unwrap();
                    replay.fill(quote, config.participation_bps)?;
                }
            }
            Ok(())
        };
        let mut decisions = Vec::new();
        for slot in 0..count {
            let at = config.from_at + slot as i64 * step;
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
            .map(|row| (row.listing_id.as_str(), row))
            .collect();
        let mark = |listing: &str| {
            matches!(
                membership.get(listing).map(|row| row.action),
                Some(UniverseAction::Add | UniverseAction::Remove)
            )
            .then(|| self.exact_close(listing, config.through_at, config.known_at))
            .flatten()
        };
        let positions: Vec<_> = replay
            .aliases
            .iter()
            .filter_map(|(&listing_id, alias)| {
                let position = replay.ledger.positions().get(&alias.to_string())?;
                if position.shares == 0 {
                    return None;
                }
                Some(CrossSectionPosition {
                    listing_id: listing_id.to_owned(),
                    shares: position.shares,
                    cost: position.cost,
                    mark: mark(listing_id).map(|quote| quote.ticks),
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
        let mut successor_claims = Vec::new();
        if let Some(reports) = successors {
            let holdings = replay.holdings.as_ref().unwrap();
            for (&listing, change) in membership
                .iter()
                .filter(|(_, row)| row.action == UniverseAction::Delist)
            {
                let Some((&position_at, observation)) = holdings
                    .get(listing)
                    .and_then(|history| history.range(..change.effective_at).next_back())
                    .filter(|(_, observation)| observation.shares > 0)
                else {
                    continue;
                };
                let Some(terms) = reports.known_terms(&change.change_id, config.known_at) else {
                    continue;
                };
                let (shares, state) = value_successor_shares(
                    Some(observation.shares),
                    Some(terms),
                    config.through_at,
                );
                let shares = shares.expect("a known holding and ratio produce successor shares");
                let mark = (shares.numerator > 0)
                    .then(|| mark(&terms.successor_listing))
                    .flatten();
                let value = if shares.numerator == 0 {
                    Some(0)
                } else {
                    mark.map(|quote| {
                        rounded_div(
                            i128::from(quote.ticks) * i128::from(shares.numerator),
                            i128::from(shares.denominator),
                        )
                    })
                };
                successor_claims.push(CrossSectionSuccessorClaim {
                    listing_id: listing.to_owned(),
                    change_id: change.change_id.clone(),
                    effective_at: change.effective_at,
                    observed_at: change.observed_at,
                    terms: terms.clone(),
                    position_at,
                    entitled_shares: u64::from(observation.shares),
                    shares,
                    state,
                    mark,
                    value,
                });
            }
        }
        let equity = equity.and_then(|total| {
            successor_claims
                .iter()
                .try_fold(total, |total, claim| Some(total + claim.value?))
        });
        let mut capital_return_claims = Vec::new();
        let cutoff = config.through_at.min(config.known_at);
        if let Some(reports) = return_reports {
            let holdings = replay.holdings.as_ref().unwrap();
            for (listing, book) in reports.dividend_books() {
                for row in book
                    .known_reports(config.known_at)
                    .filter(|row| row.ex_at <= cutoff)
                {
                    let observation = holdings
                        .get(listing)
                        .and_then(|history| history.range(..row.ex_at).next_back())
                        .map(|(_, observation)| observation);
                    let entitled_shares =
                        observation.map_or(0, |position| u64::from(position.shares));
                    let amount = i128::from(entitled_shares) * i128::from(row.amount_per_share);
                    let state = if amount == 0 {
                        PortfolioDividendState::NoPayment
                    } else if row.pay_at <= cutoff {
                        PortfolioDividendState::Paid
                    } else {
                        PortfolioDividendState::Receivable
                    };
                    capital_return_claims.push(CrossSectionCapitalReturnClaim {
                        listing_id: listing.to_owned(),
                        action_id: row.id.clone(),
                        observed_at: row.observed_at,
                        ex_at: row.ex_at,
                        pay_at: row.pay_at,
                        entitled_shares,
                        currency: row.currency.clone(),
                        amount,
                        state,
                        position_receipt_id: observation
                            .map(|position| replay.events[position.event_index].event.id.clone()),
                    });
                }
            }
        }
        let receivable: i128 = capital_return_claims
            .iter()
            .filter(|claim| {
                claim.state == PortfolioDividendState::Receivable
                    && claim.currency == account_currency
            })
            .map(|claim| claim.amount)
            .sum();
        let equity = equity.map(|value| value + receivable);
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
        let report = CrossSectionReport {
            config,
            decisions,
            events: replay.events,
            positions,
            cash,
            reserved_cash: replay.ledger.reserved_cash(),
            fees,
            turnover,
            equity,
            has_reported_dividend_withholding: income
                .is_some_and(PortfolioIncomeReports::has_reported_withholding),
            dividend_postings: dividends.map_or_else(Vec::new, |income| income.postings),
            capital_return_claims,
            capital_return_postings: capital_returns.map_or_else(Vec::new, |reports| {
                reports.postings.into_iter().map(Into::into).collect()
            }),
            delisting_claims,
            delisting_postings: delistings.map_or_else(Vec::new, |book| book.postings),
            successor_claims,
        };
        Ok(ReplayOutcome {
            report,
            holdings: replay.holdings,
        })
    }
}
