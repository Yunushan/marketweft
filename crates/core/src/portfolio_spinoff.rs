use super::parse_holdings;
use crate::{history::exact_utc, universe::valid_id, UniverseAction, UniverseBook};
use std::{collections::BTreeMap, ops::Bound::Excluded};

const HEADER: &str = "universe,action_id,parent_listing,child_listing,announced_at,entitlement_at,distribution_at,observed_at,numerator,denominator";
const MAX_REPORTS: usize = 1_000;
const MAX_RATIO: u32 = 1_000_000;

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
    Ok(rows)
}
