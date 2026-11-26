use super::{PortfolioBook, PortfolioSnapshot, PositionSeries};
use crate::{dividend::parse_report, Dividend, DividendBook, UniverseAction, UniverseBook};
use std::collections::BTreeMap;
use std::ops::Bound::Excluded;

const HEADER: &str =
    "universe,listing_id,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PortfolioDividendState {
    UnknownPosition,
    NoPayment,
    Receivable,
    Paid,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PortfolioDividendRow<'a> {
    pub listing_id: &'a str,
    pub report: &'a Dividend,
    pub entitled_shares: Option<u32>,
    pub state: PortfolioDividendState,
    pub amount: Option<i128>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PortfolioIncomeCurrency {
    pub receivable: i128,
    pub cash: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PortfolioIncomeSnapshot<'a> {
    pub portfolio: PortfolioSnapshot<'a>,
    pub dividends: Vec<PortfolioDividendRow<'a>>,
    pub totals: BTreeMap<&'a str, PortfolioIncomeCurrency>,
}

pub(crate) struct PortfolioIncomeReports {
    listings: BTreeMap<String, (UniverseBook, DividendBook)>,
}

impl PortfolioIncomeReports {
    pub(crate) fn parse(universe: &UniverseBook, csv: &str) -> Result<Self, String> {
        if csv.len() > 1024 * 1024 {
            return Err("Portfolio dividends CSV exceeds 1 MiB.".into());
        }
        let mut lines = csv
            .trim_start_matches('\u{feff}')
            .lines()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty());
        if lines.next().map(|(_, line)| line.trim()) != Some(HEADER) {
            return Err(format!("Expected portfolio dividends header {HEADER}."));
        }
        let listing_ids = universe.listing_ids();
        let mut reports: BTreeMap<&str, Vec<Dividend>> = BTreeMap::new();
        for (index, (line, record)) in lines.enumerate() {
            let error = |reason: &str| format!("Portfolio dividend line {}: {reason}", line + 1);
            if index == 1_000 {
                return Err(error("Supply at most 1,000 portfolio dividend reports."));
            }
            let mut fields = record.split(',').map(str::trim);
            let scope = fields.next();
            let listing = fields
                .next()
                .filter(|id| listing_ids.contains(id))
                .ok_or_else(|| error("Use a listing ID from the supplied universe."))?;
            if scope != Some(universe.name()) {
                return Err(error("Use a listing ID from the supplied universe."));
            }
            let report =
                parse_report(&mut fields, "Expected exactly nine fields.").map_err(error)?;
            reports.entry(listing).or_default().push(report);
        }
        if reports.is_empty() {
            return Err("Portfolio dividends CSV contains no reports.".into());
        }
        let listings = reports
            .into_iter()
            .map(|(id, rows)| {
                let listing = universe
                    .for_listing(id)
                    .ok_or("Missing dividend listing.")?;
                let book =
                    DividendBook::new(rows).map_err(|cause| format!("Listing {id}: {cause}"))?;
                Ok((id.to_owned(), (listing, book)))
            })
            .collect::<Result<_, String>>()?;
        Ok(Self { listings })
    }

    pub(crate) fn dividend_books(&self) -> impl Iterator<Item = (&str, &DividendBook)> {
        self.listings
            .iter()
            .map(|(id, (_, book))| (id.as_str(), book))
    }
}

impl PortfolioBook<'_> {
    /// Revalue the portfolio with the latest dividend terms and holdings reports
    /// at separate inclusive effective and known times.
    pub fn as_of_with_income(
        &self,
        effective_at: i64,
        known_at: i64,
    ) -> PortfolioIncomeSnapshot<'_> {
        let mut snapshot = PortfolioIncomeSnapshot {
            portfolio: self.as_of(effective_at, known_at),
            dividends: Vec::new(),
            totals: BTreeMap::new(),
        };
        let Some(reports) = &self.income else {
            return snapshot;
        };
        for (listing_id, (listing, book)) in &reports.listings {
            for report in book
                .known_reports(known_at)
                .filter(|report| report.ex_at <= effective_at)
            {
                let entitled_shares = shares_at_ex(
                    listing,
                    self.positions.get(listing_id),
                    report.ex_at,
                    known_at,
                );
                let amount = if report.amount_per_share == 0 {
                    Some(0)
                } else {
                    entitled_shares
                        .map(|shares| i128::from(shares) * i128::from(report.amount_per_share))
                };
                let state = match amount {
                    None => PortfolioDividendState::UnknownPosition,
                    Some(0) => PortfolioDividendState::NoPayment,
                    Some(amount) => {
                        let total = snapshot.totals.entry(report.currency.as_str()).or_default();
                        if report.pay_at <= effective_at {
                            total.cash += amount;
                            PortfolioDividendState::Paid
                        } else {
                            total.receivable += amount;
                            PortfolioDividendState::Receivable
                        }
                    }
                };
                snapshot.dividends.push(PortfolioDividendRow {
                    listing_id,
                    report,
                    entitled_shares,
                    state,
                    amount,
                });
            }
        }
        snapshot
    }
}

fn shares_at_ex(
    listing: &UniverseBook,
    holdings: Option<&PositionSeries>,
    ex_at: i64,
    known_at: i64,
) -> Option<u32> {
    let membership = listing.as_of(ex_at, known_at);
    let row = membership.first()?;
    if row.action == UniverseAction::Delist {
        return Some(0);
    }
    holdings?
        .position(Excluded(ex_at), known_at)
        .map(|(_, _, shares)| shares)
}
