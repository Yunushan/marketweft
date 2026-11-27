use super::{
    income::{shares_at_ex, PortfolioIncomeReports},
    parse_holdings, PortfolioDividendState, PositionSeries,
};
use crate::{
    delisting::valid_currency,
    history::{decimal_ticks, exact_utc, valid_second},
    Dividend, UniverseBook,
};
use std::collections::{BTreeMap, BTreeSet};

const HEADER: &str =
    "universe,listing_id,action_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share";
const BASIS_HEADER: &str = "universe,listing_id,action_id,observed_at,currency,basis_before";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CapitalReturnBasis {
    pub observed_at: i64,
    pub before: i128,
    pub reduction: i128,
    pub remaining: i128,
    pub excess: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PortfolioCapitalReturn {
    pub listing_id: String,
    pub report: Dividend,
    pub entitled_shares: Option<u32>,
    pub state: PortfolioDividendState,
    pub amount: Option<i128>,
    pub basis: Option<CapitalReturnBasis>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CapitalReturnCutoff {
    pub effective_at: i64,
    pub known_at: i64,
}

impl CapitalReturnCutoff {
    fn validate(self) -> Result<(), String> {
        if !valid_second(self.effective_at) || !valid_second(self.known_at) {
            return Err("Supply valid UTC effective and knowledge cutoffs.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CapitalReturnAmounts {
    pub receivable: Option<i128>,
    pub cash: Option<i128>,
    pub basis_reduction: Option<i128>,
    pub above_basis: Option<i128>,
}

impl CapitalReturnAmounts {
    fn difference(self, baseline: Self) -> Self {
        let subtract = |current: Option<i128>, prior: Option<i128>| {
            current.zip(prior).map(|(current, prior)| current - prior)
        };
        Self {
            receivable: subtract(self.receivable, baseline.receivable),
            cash: subtract(self.cash, baseline.cash),
            basis_reduction: subtract(self.basis_reduction, baseline.basis_reduction),
            above_basis: subtract(self.above_basis, baseline.above_basis),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapitalReturnMovement {
    pub currency: String,
    pub baseline: CapitalReturnAmounts,
    pub comparison: CapitalReturnAmounts,
    pub change: CapitalReturnAmounts,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapitalReturnComparison {
    pub listing_id: String,
    pub action_id: String,
    pub baseline: Option<PortfolioCapitalReturn>,
    pub comparison: Option<PortfolioCapitalReturn>,
    pub movements: Vec<CapitalReturnMovement>,
}

type BasisReports = BTreeMap<(String, String, String), BTreeMap<i64, i128>>;

struct CapitalReturnBook {
    holdings: BTreeMap<String, PositionSeries>,
    returns: PortfolioIncomeReports,
    basis: Option<BasisReports>,
}

fn parse_basis(
    universe: &UniverseBook,
    returns: &PortfolioIncomeReports,
    csv: &str,
) -> Result<BasisReports, String> {
    if csv.len() > 1024 * 1024 {
        return Err("Capital return basis CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, line)| line.trim()) != Some(BASIS_HEADER) {
        return Err(format!(
            "Expected capital return basis header {BASIS_HEADER}."
        ));
    }
    let actions: BTreeSet<_> = returns
        .listing_books()
        .flat_map(|(listing_id, _, book)| {
            book.known_reports(i64::MAX)
                .map(move |report| (listing_id, report.id.as_str()))
        })
        .collect();
    let mut reports = BasisReports::new();
    for (index, (line, row)) in lines.enumerate() {
        let error = |message: &str| format!("Capital return basis line {}: {message}", line + 1);
        if index == 2_000 {
            return Err(error("Supply at most 2,000 basis reports."));
        }
        let mut fields = row.split(',').map(str::trim);
        let [Some(scope), Some(listing), Some(action), Some(observation), Some(currency), Some(before), None] =
            std::array::from_fn(|_| fields.next())
        else {
            return Err(error("Expected exactly six fields."));
        };
        if scope != universe.name() || !actions.contains(&(listing, action)) {
            return Err(error(
                "Supply a listing and action from the capital return reports.",
            ));
        }
        if !valid_currency(currency) {
            return Err(error("Use a three-letter uppercase basis currency."));
        }
        let observed_at =
            exact_utc(observation).ok_or_else(|| error("Use an exact UTC observation time."))?;
        let before = decimal_ticks(before)
            .filter(|&value| value >= 0)
            .ok_or_else(|| error("Use a nonnegative basis with up to six decimal places."))?;
        if reports
            .entry((listing.to_owned(), action.to_owned(), currency.to_owned()))
            .or_default()
            .insert(observed_at, before)
            .is_some()
        {
            return Err(error(
                "Duplicate observation time for this listing, action and currency.",
            ));
        }
    }
    if reports.is_empty() {
        return Err("Capital return basis CSV contains no reports.".into());
    }
    Ok(reports)
}

/// Replay reported capital returns and basis amounts for the entitled holding.
pub fn portfolio_capital_returns_as_of(
    universe: &UniverseBook,
    holdings: &str,
    returns: &str,
    basis: Option<&str>,
    effective_at: i64,
    known_at: i64,
) -> Result<Vec<PortfolioCapitalReturn>, String> {
    let cutoff = CapitalReturnCutoff {
        effective_at,
        known_at,
    };
    cutoff.validate()?;
    Ok(CapitalReturnBook::parse(universe, holdings, returns, basis)?.snapshot(cutoff))
}

impl CapitalReturnBook {
    fn parse(
        universe: &UniverseBook,
        holdings: &str,
        returns: &str,
        basis: Option<&str>,
    ) -> Result<Self, String> {
        let holdings = parse_holdings(universe, holdings)?;
        let returns =
            PortfolioIncomeReports::parse_named(universe, returns, HEADER, "capital return")?;
        let basis = basis
            .map(|csv| parse_basis(universe, &returns, csv))
            .transpose()?;
        Ok(Self {
            holdings,
            returns,
            basis,
        })
    }

    fn snapshot(&self, cutoff: CapitalReturnCutoff) -> Vec<PortfolioCapitalReturn> {
        let CapitalReturnCutoff {
            effective_at,
            known_at,
        } = cutoff;
        let mut rows = Vec::new();
        for (listing_id, listing, book) in self.returns.listing_books() {
            for report in book
                .known_reports(known_at)
                .filter(|report| report.ex_at <= effective_at)
            {
                let entitled_shares = shares_at_ex(
                    listing,
                    self.holdings.get(listing_id),
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
                    Some(_) if report.pay_at <= effective_at => PortfolioDividendState::Paid,
                    Some(_) => PortfolioDividendState::Receivable,
                };
                let adjustment = amount
                    .filter(|_| state == PortfolioDividendState::Paid)
                    .and_then(|amount| {
                        let (&observed_at, &before) = self
                            .basis
                            .as_ref()?
                            .get(&(
                                listing_id.to_owned(),
                                report.id.clone(),
                                report.currency.clone(),
                            ))?
                            .range(..=known_at)
                            .next_back()?;
                        let reduction = before.min(amount);
                        Some(CapitalReturnBasis {
                            observed_at,
                            before,
                            reduction,
                            remaining: before - reduction,
                            excess: amount - reduction,
                        })
                    });
                rows.push(PortfolioCapitalReturn {
                    listing_id: listing_id.to_owned(),
                    report: report.clone(),
                    entitled_shares,
                    state,
                    amount,
                    basis: adjustment,
                });
            }
        }
        rows
    }
}

fn amounts(
    row: Option<&PortfolioCapitalReturn>,
    currency: &str,
    cutoff: CapitalReturnCutoff,
) -> CapitalReturnAmounts {
    let zero = CapitalReturnAmounts {
        receivable: Some(0),
        cash: Some(0),
        basis_reduction: Some(0),
        above_basis: Some(0),
    };
    let Some(row) = row.filter(|row| row.report.currency == currency) else {
        return zero;
    };
    if row.report.pay_at > cutoff.effective_at {
        return CapitalReturnAmounts {
            receivable: row.amount,
            ..zero
        };
    }
    if row.amount == Some(0) {
        return zero;
    }
    CapitalReturnAmounts {
        cash: row.amount,
        basis_reduction: row.basis.map(|basis| basis.reduction),
        above_basis: row.basis.map(|basis| basis.excess),
        ..zero
    }
}

/// Compare the same reported actions at two independent effective and knowledge cutoffs.
pub fn compare_portfolio_capital_returns(
    universe: &UniverseBook,
    holdings: &str,
    returns: &str,
    basis: Option<&str>,
    baseline: CapitalReturnCutoff,
    comparison: CapitalReturnCutoff,
) -> Result<Vec<CapitalReturnComparison>, String> {
    baseline.validate()?;
    comparison.validate()?;
    let book = CapitalReturnBook::parse(universe, holdings, returns, basis)?;
    let mut pairs = BTreeMap::new();
    for row in book.snapshot(baseline) {
        let key = (row.listing_id.clone(), row.report.id.clone());
        pairs.insert(key, (Some(row), None));
    }
    for row in book.snapshot(comparison) {
        let key = (row.listing_id.clone(), row.report.id.clone());
        pairs.entry(key).or_default().1 = Some(row);
    }

    Ok(pairs
        .into_iter()
        .map(|((listing_id, action_id), (before, after))| {
            let currencies: BTreeSet<_> = before
                .iter()
                .chain(after.iter())
                .map(|row| row.report.currency.as_str())
                .collect();
            let movements = currencies
                .into_iter()
                .map(|currency| {
                    let prior = amounts(before.as_ref(), currency, baseline);
                    let current = amounts(after.as_ref(), currency, comparison);
                    CapitalReturnMovement {
                        currency: currency.to_owned(),
                        baseline: prior,
                        comparison: current,
                        change: current.difference(prior),
                    }
                })
                .collect();
            CapitalReturnComparison {
                listing_id,
                action_id,
                baseline: before,
                comparison: after,
                movements,
            }
        })
        .collect())
}
