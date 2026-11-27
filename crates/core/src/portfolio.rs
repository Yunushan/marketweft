use crate::{
    history::exact_utc, parse_delistings, DelistingBook, DelistingState, PriceBook,
    PriceObservation, UniverseAction, UniverseBook, UniverseChange,
};
use std::{
    collections::BTreeMap,
    ops::Bound::{self, Excluded, Included, Unbounded},
};

#[path = "portfolio_income.rs"]
mod income;
#[path = "portfolio_spinoff.rs"]
mod spinoff;
pub(crate) use income::PortfolioIncomeReports;
pub use income::{
    PortfolioDividendRow, PortfolioDividendState, PortfolioIncomeCurrency, PortfolioIncomeSnapshot,
};
pub use spinoff::{
    portfolio_spin_offs_as_of, ChildShares, PortfolioSpinOffReport, PortfolioSpinOffRow,
    PortfolioSpinOffState,
};

const MAX_HOLDING_REPORTS: usize = 10_000;
const MAX_HOLDING_LISTINGS: usize = 1_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PortfolioState {
    ListingUnobserved,
    MissingClose,
    MarkedShares,
    MissingProceeds,
    Receivable,
    Cash,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PortfolioRow<'a> {
    pub listing_id: &'a str,
    pub instrument: Option<&'a crate::Instrument>,
    pub shares: u32,
    pub position_effective_at: i64,
    pub position_observed_at: i64,
    pub state: PortfolioState,
    pub currency: Option<&'a str>,
    pub value: Option<i128>,
    pub price: Option<PriceObservation>,
    pub delisting: Option<&'a UniverseChange>,
    pub terms_observed_at: Option<i64>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PortfolioCurrency {
    pub shares_value: i128,
    pub delisting_receivable: i128,
    pub delisting_cash: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PortfolioSnapshot<'a> {
    pub effective_at: i64,
    pub known_at: i64,
    pub rows: Vec<PortfolioRow<'a>>,
    pub totals: BTreeMap<&'a str, PortfolioCurrency>,
    pub unvalued_positions: usize,
}

struct PositionSeries {
    currency: String,
    quantities: BTreeMap<i64, BTreeMap<i64, u32>>,
}

impl PositionSeries {
    fn position(&self, end: Bound<i64>, known_at: i64) -> Option<(i64, i64, u32)> {
        self.quantities
            .range((Unbounded, end))
            .rev()
            .find_map(|(&effective, vintages)| {
                let (&observed, &shares) = vintages.range(..=known_at).next_back()?;
                Some((effective, observed, shares))
            })
    }
}

pub struct PortfolioBook<'a> {
    prices: PriceBook<'a>,
    delistings: DelistingBook,
    positions: BTreeMap<String, PositionSeries>,
    income: Option<PortfolioIncomeReports>,
}

impl<'a> PortfolioBook<'a> {
    pub fn parse(
        universe: &'a UniverseBook,
        holdings: &str,
        prices: &str,
        delisting_terms: &str,
    ) -> Result<Self, String> {
        Ok(Self {
            prices: PriceBook::parse(universe, prices)?,
            delistings: if delisting_terms.is_empty() {
                DelistingBook::new(universe.clone(), Vec::new())?
            } else {
                parse_delistings(universe.clone(), delisting_terms)?
            },
            positions: parse_holdings(universe, holdings)?,
            income: None,
        })
    }

    pub fn parse_with_income(
        universe: &'a UniverseBook,
        holdings: &str,
        prices: &str,
        delisting_terms: &str,
        dividends: &str,
    ) -> Result<Self, String> {
        let mut book = Self::parse(universe, holdings, prices, delisting_terms)?;
        if !dividends.is_empty() {
            book.income = Some(PortfolioIncomeReports::parse(universe, dividends)?);
        }
        Ok(book)
    }

    pub fn as_of(&self, effective_at: i64, known_at: i64) -> PortfolioSnapshot<'_> {
        let membership: BTreeMap<_, _> = self
            .prices
            .universe
            .as_of(effective_at, known_at)
            .into_iter()
            .map(|row| (row.listing_id.as_str(), row))
            .collect();
        let mut result = PortfolioSnapshot {
            effective_at,
            known_at,
            rows: Vec::new(),
            totals: BTreeMap::new(),
            unvalued_positions: 0,
        };
        for (listing_id, positions) in &self.positions {
            let listing = membership.get(listing_id.as_str()).copied();
            let delisting = listing.filter(|row| row.action == UniverseAction::Delist);
            let position_end =
                delisting.map_or(Included(effective_at), |row| Excluded(row.effective_at));
            let position = positions.position(position_end, known_at);
            let Some((position_effective_at, position_observed_at, shares)) = position else {
                continue;
            };
            if shares == 0 {
                continue;
            }
            let mut row = PortfolioRow {
                listing_id,
                instrument: listing.map(|row| &row.instrument),
                shares,
                position_effective_at,
                position_observed_at,
                state: PortfolioState::ListingUnobserved,
                currency: None,
                value: None,
                price: None,
                delisting,
                terms_observed_at: None,
            };
            if delisting.is_some() {
                let cash = self
                    .delistings
                    .value(delisting, shares, effective_at, known_at);
                row.terms_observed_at = cash.terms.map(|report| report.observed_at);
                row.currency = cash
                    .terms
                    .and_then(|report| report.offer.as_ref())
                    .map(|offer| offer.currency.as_str());
                row.value = cash.cash_value;
                row.state = match cash.state {
                    DelistingState::Receivable => PortfolioState::Receivable,
                    DelistingState::Paid => PortfolioState::Cash,
                    _ => PortfolioState::MissingProceeds,
                };
            } else if listing.is_some() {
                row.currency = Some(&positions.currency);
                row.price = self.prices.exact_close(listing_id, effective_at, known_at);
                row.value = row
                    .price
                    .map(|price| i128::from(price.ticks) * i128::from(shares));
                row.state = if row.price.is_some() {
                    PortfolioState::MarkedShares
                } else {
                    PortfolioState::MissingClose
                };
            }
            result.include(row);
        }
        result
    }
}

impl<'a> PortfolioSnapshot<'a> {
    fn include(&mut self, row: PortfolioRow<'a>) {
        if let Some((currency, value)) = row.currency.zip(row.value) {
            let total = self.totals.entry(currency).or_default();
            match row.state {
                PortfolioState::MarkedShares => total.shares_value += value,
                PortfolioState::Receivable => total.delisting_receivable += value,
                PortfolioState::Cash => total.delisting_cash += value,
                _ => unreachable!("only valued portfolio states have amounts"),
            }
        } else {
            self.unvalued_positions += 1;
        }
        self.rows.push(row);
    }
}

fn parse_holdings(
    universe: &UniverseBook,
    csv: &str,
) -> Result<BTreeMap<String, PositionSeries>, String> {
    if csv.len() > 2 * 1024 * 1024 {
        return Err("Portfolio holdings CSV exceeds 2 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    const HEADER: &str = "universe,listing_id,effective_at,observed_at,shares,quote_currency";
    if lines.next().map(|(_, line)| line.trim()) != Some(HEADER) {
        return Err(format!("Expected portfolio holdings header {HEADER}."));
    }
    let ids = universe.listing_ids();
    let mut positions = BTreeMap::new();
    for (index, (line, row)) in lines.enumerate() {
        let error = |reason| format!("Holding line {}: {reason}", line + 1);
        if index == MAX_HOLDING_REPORTS {
            return Err(error("Supply at most 10,000 holding reports."));
        }
        let mut fields = row.splitn(7, ',').map(str::trim);
        let [Some(scope), Some(listing), Some(effective), Some(observed), Some(shares), Some(currency), None] =
            std::array::from_fn(|_| fields.next())
        else {
            return Err(error("Expected exactly six fields."));
        };
        if scope != universe.name() || !ids.contains(listing) {
            return Err(error("Use a listing ID from the supplied universe."));
        }
        let effective =
            exact_utc(effective).ok_or_else(|| error("Use an exact UTC effective timestamp."))?;
        let observed =
            exact_utc(observed).ok_or_else(|| error("Use an exact UTC observation timestamp."))?;
        if effective > observed {
            return Err(error("Holdings must be observed at or after effect."));
        }
        let shares = shares
            .bytes()
            .all(|byte| byte.is_ascii_digit())
            .then(|| shares.parse::<u32>().ok())
            .flatten()
            .filter(|shares| *shares <= 1_000_000)
            .ok_or_else(|| error("Supply 0–1,000,000 whole shares."))?;
        if currency.len() != 3 || !currency.bytes().all(|byte| byte.is_ascii_uppercase()) {
            return Err(error("Use a three-letter uppercase quote currency."));
        }
        let series = positions
            .entry(listing.to_owned())
            .or_insert_with(|| PositionSeries {
                currency: currency.to_owned(),
                quantities: BTreeMap::new(),
            });
        if series.currency != currency {
            return Err(error("A listing must retain its original quote currency."));
        }
        if series
            .quantities
            .entry(effective)
            .or_default()
            .insert(observed, shares)
            .is_some()
        {
            return Err(error(
                "Duplicate observation time for one effective holding.",
            ));
        }
        if positions.len() > MAX_HOLDING_LISTINGS {
            return Err(error("Supply holdings for at most 1,000 listing IDs."));
        }
    }
    Ok(positions)
}
