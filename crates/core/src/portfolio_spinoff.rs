use super::parse_holdings;
use crate::{
    history::{decimal, exact_utc},
    universe::valid_id,
    UniverseAction, UniverseBook, MAX_TICKS, SCALE,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    ops::Bound::Excluded,
};

const HEADER: &str = "universe,action_id,parent_listing,child_listing,announced_at,entitlement_at,distribution_at,observed_at,numerator,denominator";
const MAX_REPORTS: usize = 1_000;
const MAX_RATIO: u32 = 1_000_000;
const CASH_HEADER: &str = "universe,action_id,pay_at,observed_at,currency,amount_per_child_share";
const BASIS_HEADER: &str =
    "universe,action_id,observed_at,currency,original_parent_basis,child_basis_fraction";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PortfolioSpinOffReport {
    pub id: String,
    pub parent_listing: String,
    pub child_listing: String,
    pub announced_at: i64,
    pub entitlement_at: i64,
    pub distribution_at: i64,
    pub observed_at: i64,
    pub ratio_numerator: u32,
    pub ratio_denominator: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ChildShares {
    pub numerator: u64,
    pub denominator: u32,
}

impl ChildShares {
    fn from_rate(parent_shares: u32, numerator: u32, denominator: u32) -> Self {
        let numerator = u64::from(parent_shares) * u64::from(numerator);
        let mut divisor = denominator;
        let mut remainder = (numerator % u64::from(denominator)) as u32;
        while remainder != 0 {
            (divisor, remainder) = (remainder, divisor % remainder);
        }
        Self {
            numerator: numerator / u64::from(divisor),
            denominator: denominator / divisor,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PortfolioSpinOffState {
    UnknownPosition,
    NoDistribution,
    Receivable,
    Distributed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PortfolioSpinOffRow {
    pub report: PortfolioSpinOffReport,
    pub state: PortfolioSpinOffState,
    pub entitled_parent_shares: Option<u32>,
    pub position_effective_at: Option<i64>,
    pub position_observed_at: Option<i64>,
    pub child_shares: Option<ChildShares>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpinOffCashTerms {
    pub pay_at: i64,
    pub observed_at: i64,
    pub currency: String,
    pub amount_per_child_share: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SpinOffCashState {
    UnknownPosition,
    MissingTerms,
    NoPayment,
    Receivable,
    Paid,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpinOffCashRow {
    pub id: String,
    pub child_listing: String,
    pub fractional_shares: Option<ChildShares>,
    pub state: SpinOffCashState,
    pub terms: Option<SpinOffCashTerms>,
    pub amount: Option<i128>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpinOffBasisTerms {
    pub observed_at: i64,
    pub currency: String,
    pub original_parent_basis: i64,
    pub child_basis_fraction: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SpinOffBasisState {
    UnknownPosition,
    MissingTerms,
    NoDistribution,
    AwaitingDistribution,
    Allocated,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SpinOffBasisAllocation {
    pub retained_parent_basis: i64,
    pub child_basis: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpinOffBasisRow {
    pub id: String,
    pub parent_listing: String,
    pub child_listing: String,
    pub distribution_at: i64,
    pub state: SpinOffBasisState,
    pub terms: Option<SpinOffBasisTerms>,
    pub allocation: Option<SpinOffBasisAllocation>,
}

fn parse_reports(
    universe: &UniverseBook,
    csv: &str,
) -> Result<Vec<PortfolioSpinOffReport>, String> {
    if csv.len() > 1024 * 1024 {
        return Err("Portfolio spin-off CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, line)| line.trim()) != Some(HEADER) {
        return Err(format!("Expected portfolio spin-off header {HEADER}."));
    }
    let listings = universe.listing_ids();
    let mut reports = Vec::new();
    for (index, (line, record)) in lines.enumerate() {
        let error = |reason: &str| format!("Portfolio spin-off line {}: {reason}", line + 1);
        if index == MAX_REPORTS {
            return Err(error("Supply at most 1,000 spin-off reports."));
        }
        let mut fields = record.splitn(11, ',').map(str::trim);
        let [Some(scope), Some(id), Some(parent), Some(child), Some(announced), Some(entitlement), Some(distribution), Some(observed), Some(numerator), Some(denominator), None] =
            std::array::from_fn(|_| fields.next())
        else {
            return Err(error("Expected exactly ten fields."));
        };
        if scope != universe.name()
            || !listings.contains(parent)
            || !listings.contains(child)
            || parent == child
        {
            return Err(error(
                "Use two different listing IDs from the supplied universe.",
            ));
        }
        if !valid_id(id) {
            return Err(error("Use a valid action ID."));
        }
        let [Some(announced_at), Some(entitlement_at), Some(distribution_at), Some(observed_at)] =
            [announced, entitlement, distribution, observed].map(exact_utc)
        else {
            return Err(error("Use exact UTC timestamps."));
        };
        if announced_at > entitlement_at
            || announced_at > observed_at
            || entitlement_at > distribution_at
        {
            return Err(error("Announcement must precede or match entitlement and observation, and distribution must follow or match entitlement."));
        }
        let ratio = |text: &str| {
            text.bytes()
                .all(|byte| byte.is_ascii_digit())
                .then(|| text.parse::<u32>().ok())
                .flatten()
                .filter(|&value| value <= MAX_RATIO)
        };
        let (Some(ratio_numerator), Some(ratio_denominator)) = (
            ratio(numerator),
            ratio(denominator).filter(|&value| value > 0),
        ) else {
            return Err(error(
                "Use a numerator from 0 to 1,000,000 and a denominator from 1 to 1,000,000.",
            ));
        };
        reports.push(PortfolioSpinOffReport {
            id: id.into(),
            parent_listing: parent.into(),
            child_listing: child.into(),
            announced_at,
            entitlement_at,
            distribution_at,
            observed_at,
            ratio_numerator,
            ratio_denominator,
        });
    }
    if reports.is_empty() {
        return Err("Portfolio spin-off CSV contains no reports.".into());
    }
    reports.sort_unstable_by(|a, b| (&a.id, a.observed_at).cmp(&(&b.id, b.observed_at)));
    for pair in reports.windows(2).filter(|pair| pair[0].id == pair[1].id) {
        if pair[0].parent_listing != pair[1].parent_listing
            || pair[0].child_listing != pair[1].child_listing
        {
            return Err(format!(
                "Spin-off {} must keep its original listings.",
                pair[0].id
            ));
        }
        if pair[0].observed_at == pair[1].observed_at {
            return Err(format!(
                "Spin-off {} has duplicate observation times.",
                pair[0].id
            ));
        }
    }
    Ok(reports)
}

/// Evaluate stock distributions at independent inclusive effective and knowledge cutoffs.
/// Entitlement uses the position effective strictly before the entitlement timestamp.
pub fn portfolio_spin_offs_as_of(
    universe: &UniverseBook,
    holdings: &str,
    actions: &str,
    effective_at: i64,
    known_at: i64,
) -> Result<Vec<PortfolioSpinOffRow>, String> {
    let holdings = parse_holdings(universe, holdings)?;
    let reports = parse_reports(universe, actions)?;
    Ok(spin_off_rows(
        universe,
        &holdings,
        &reports,
        effective_at,
        known_at,
    ))
}

fn spin_off_rows(
    universe: &UniverseBook,
    holdings: &BTreeMap<String, super::PositionSeries>,
    reports: &[PortfolioSpinOffReport],
    effective_at: i64,
    known_at: i64,
) -> Vec<PortfolioSpinOffRow> {
    let mut parent_books = BTreeMap::new();
    let mut rows = Vec::new();
    for revisions in reports.chunk_by(|a, b| a.id == b.id) {
        let cutoff = revisions.partition_point(|report| report.observed_at <= known_at);
        let Some(report) = cutoff.checked_sub(1).map(|index| &revisions[index]) else {
            continue;
        };
        if report.entitlement_at > effective_at {
            continue;
        }
        let parent = parent_books
            .entry(report.parent_listing.as_str())
            .or_insert_with(|| {
                universe
                    .for_listing(&report.parent_listing)
                    .expect("validated parent listing")
            });
        let membership = parent.as_of(report.entitlement_at, known_at);
        let mut position = None;
        let entitled_parent_shares = membership.first().and_then(|listing| {
            if listing.action == UniverseAction::Delist {
                return Some(0);
            }
            position = holdings
                .get(&report.parent_listing)?
                .position(Excluded(report.entitlement_at), known_at);
            position.map(|(_, _, shares)| shares)
        });
        let child_shares = if report.ratio_numerator == 0 {
            Some(ChildShares {
                numerator: 0,
                denominator: 1,
            })
        } else {
            entitled_parent_shares.map(|shares| {
                ChildShares::from_rate(shares, report.ratio_numerator, report.ratio_denominator)
            })
        };
        let state = match child_shares {
            None => PortfolioSpinOffState::UnknownPosition,
            Some(ChildShares { numerator: 0, .. }) => PortfolioSpinOffState::NoDistribution,
            Some(_) if report.distribution_at <= effective_at => PortfolioSpinOffState::Distributed,
            Some(_) => PortfolioSpinOffState::Receivable,
        };
        rows.push(PortfolioSpinOffRow {
            report: report.clone(),
            state,
            entitled_parent_shares,
            position_effective_at: position.map(|(effective, _, _)| effective),
            position_observed_at: position.map(|(_, observed, _)| observed),
            child_shares,
        });
    }
    rows
}

fn parse_action_terms<'a, T>(
    universe: &UniverseBook,
    reports: &'a [PortfolioSpinOffReport],
    csv: &str,
    kind: &str,
    header: &str,
    decode: impl Fn([&str; 4]) -> Result<(i64, T), &'static str>,
) -> Result<BTreeMap<&'a str, BTreeMap<i64, T>>, String> {
    if csv.len() > 1024 * 1024 {
        return Err(format!("Spin-off {kind} CSV exceeds 1 MiB."));
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, line)| line.trim()) != Some(header) {
        return Err(format!("Expected spin-off {kind} header {header}."));
    }
    let ids: BTreeSet<_> = reports.iter().map(|report| report.id.as_str()).collect();
    let mut terms = BTreeMap::<_, BTreeMap<_, _>>::new();
    for (index, (line, record)) in lines.enumerate() {
        let error = |reason: &str| format!("Spin-off {kind} line {}: {reason}", line + 1);
        if index == MAX_REPORTS {
            return Err(error(&format!("Supply at most 1,000 {kind} reports.")));
        }
        let mut fields = record.splitn(7, ',').map(str::trim);
        let [Some(scope), Some(id), Some(a), Some(b), Some(c), Some(d), None] =
            std::array::from_fn(|_| fields.next())
        else {
            return Err(error("Expected exactly six fields."));
        };
        let id = ids
            .get(id)
            .copied()
            .filter(|_| scope == universe.name())
            .ok_or_else(|| {
                error("Use an action ID from the supplied universe and spin-off reports.")
            })?;
        let (observed_at, value) = decode([a, b, c, d]).map_err(error)?;
        if terms
            .entry(id)
            .or_default()
            .insert(observed_at, value)
            .is_some()
        {
            return Err(error(&format!(
                "Each action's {kind} need distinct observation times."
            )));
        }
    }
    if terms.is_empty() {
        return Err(format!("Spin-off {kind} CSV contains no reports."));
    }
    Ok(terms)
}

fn terms_as_of<'a, T>(
    terms: &'a BTreeMap<&str, BTreeMap<i64, T>>,
    id: &str,
    known_at: i64,
) -> Option<&'a T> {
    terms
        .get(id)?
        .range(..=known_at)
        .next_back()
        .map(|(_, terms)| terms)
}

fn parse_cash_terms(
    [pay, observed, currency, rate]: [&str; 4],
) -> Result<(i64, SpinOffCashTerms), &'static str> {
    let [Some(pay_at), Some(observed_at)] = [pay, observed].map(exact_utc) else {
        return Err("Use exact UTC timestamps.");
    };
    if currency.len() != 3 || !currency.bytes().all(|byte| byte.is_ascii_uppercase()) {
        return Err("Use a three-letter uppercase currency.");
    }
    let amount_per_child_share = decimal(rate)
        .filter(|amount| (0..=MAX_TICKS).contains(amount))
        .ok_or("Use a nonnegative cash rate with up to six decimal places.")?;
    Ok((
        observed_at,
        SpinOffCashTerms {
            pay_at,
            observed_at,
            currency: currency.into(),
            amount_per_child_share,
        },
    ))
}

fn parse_basis_terms(
    [observed, currency, basis, fraction]: [&str; 4],
) -> Result<(i64, SpinOffBasisTerms), &'static str> {
    let observed_at = exact_utc(observed).ok_or("Use an exact UTC observation timestamp.")?;
    if currency.len() != 3 || !currency.bytes().all(|byte| byte.is_ascii_uppercase()) {
        return Err("Use a three-letter uppercase currency.");
    }
    let original_parent_basis = decimal(basis)
        .filter(|amount| *amount >= 0)
        .ok_or("Use a nonnegative original parent basis with up to six decimal places.")?;
    let child_basis_fraction = decimal(fraction)
        .filter(|amount| (0..=SCALE).contains(amount))
        .ok_or("Use a child basis fraction from 0 through 1 with up to six decimal places.")?;
    Ok((
        observed_at,
        SpinOffBasisTerms {
            observed_at,
            currency: currency.into(),
            original_parent_basis,
            child_basis_fraction,
        },
    ))
}

/// Settle only the fractional remainder of a stock distribution. A positive claim
/// becomes paid when both the distribution and cash payment dates are effective.
pub fn portfolio_spin_off_cash_as_of(
    universe: &UniverseBook,
    holdings: &str,
    actions: &str,
    cash_terms: &str,
    effective_at: i64,
    known_at: i64,
) -> Result<Vec<SpinOffCashRow>, String> {
    let holdings = parse_holdings(universe, holdings)?;
    let reports = parse_reports(universe, actions)?;
    let terms = parse_action_terms(
        universe,
        &reports,
        cash_terms,
        "cash terms",
        CASH_HEADER,
        parse_cash_terms,
    )?;
    Ok(
        spin_off_rows(universe, &holdings, &reports, effective_at, known_at)
            .into_iter()
            .map(|row| {
                let terms = terms_as_of(&terms, &row.report.id, known_at);
                let fractional_shares = row.child_shares.map(|quantity| ChildShares {
                    numerator: quantity.numerator % u64::from(quantity.denominator),
                    denominator: quantity.denominator,
                });
                let (state, amount) = match (fractional_shares, terms) {
                    (Some(ChildShares { numerator: 0, .. }), _)
                    | (
                        _,
                        Some(SpinOffCashTerms {
                            amount_per_child_share: 0,
                            ..
                        }),
                    ) => (SpinOffCashState::NoPayment, Some(0)),
                    (None, _) => (SpinOffCashState::UnknownPosition, None),
                    (Some(_), None) => (SpinOffCashState::MissingTerms, None),
                    (Some(fraction), Some(terms)) => {
                        let numerator = i128::from(fraction.numerator)
                            * i128::from(terms.amount_per_child_share);
                        let denominator = i128::from(fraction.denominator);
                        let amount = (numerator + denominator / 2) / denominator;
                        let state = if row.report.distribution_at.max(terms.pay_at) <= effective_at
                        {
                            SpinOffCashState::Paid
                        } else {
                            SpinOffCashState::Receivable
                        };
                        (state, Some(amount))
                    }
                };
                SpinOffCashRow {
                    id: row.report.id,
                    child_listing: row.report.child_listing,
                    fractional_shares,
                    state,
                    terms: terms.cloned(),
                    amount,
                }
            })
            .collect(),
    )
}

/// Replay the supplied allocation of total basis for an entitled parent position.
pub fn portfolio_spin_off_basis_as_of(
    universe: &UniverseBook,
    holdings: &str,
    actions: &str,
    basis_terms: &str,
    effective_at: i64,
    known_at: i64,
) -> Result<Vec<SpinOffBasisRow>, String> {
    let holdings = parse_holdings(universe, holdings)?;
    let reports = parse_reports(universe, actions)?;
    let terms = parse_action_terms(
        universe,
        &reports,
        basis_terms,
        "basis terms",
        BASIS_HEADER,
        parse_basis_terms,
    )?;
    let scale = i128::from(SCALE);
    Ok(
        spin_off_rows(universe, &holdings, &reports, effective_at, known_at)
            .into_iter()
            .map(|row| {
                use PortfolioSpinOffState::*;
                let terms = terms_as_of(&terms, &row.report.id, known_at);
                let (state, allocation) = match (row.state, terms) {
                    (UnknownPosition, _) => (SpinOffBasisState::UnknownPosition, None),
                    (NoDistribution, _) => (SpinOffBasisState::NoDistribution, None),
                    (_, None) => (SpinOffBasisState::MissingTerms, None),
                    (Receivable, Some(_)) => (SpinOffBasisState::AwaitingDistribution, None),
                    (Distributed, Some(terms)) => {
                        let child_basis = ((i128::from(terms.original_parent_basis)
                            * i128::from(terms.child_basis_fraction)
                            + scale / 2)
                            / scale) as i64;
                        (
                            SpinOffBasisState::Allocated,
                            Some(SpinOffBasisAllocation {
                                retained_parent_basis: terms.original_parent_basis - child_basis,
                                child_basis,
                            }),
                        )
                    }
                };
                SpinOffBasisRow {
                    id: row.report.id,
                    parent_listing: row.report.parent_listing,
                    child_listing: row.report.child_listing,
                    distribution_at: row.report.distribution_at,
                    state,
                    terms: terms.cloned(),
                    allocation,
                }
            })
            .collect(),
    )
}
