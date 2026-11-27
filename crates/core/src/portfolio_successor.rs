use super::{parse_holdings, ChildShares, MAX_SHARE_RATIO};
use crate::{history::exact_utc, UniverseAction, UniverseBook, UniverseChange};
use std::{collections::BTreeMap, ops::Bound::Excluded};

#[path = "portfolio_successor_ledger.rs"]
mod ledger;
pub(crate) use ledger::successor_delivery_postings_from_observed_positions;
pub use ledger::{
    portfolio_successor_delivery_ledger, SuccessorDeliveryPosting, SuccessorShareDelta,
};

const HEADER: &str =
    "universe,listing_id,change_id,successor_listing,observed_at,deliver_at,numerator,denominator";
const MAX_REPORTS: usize = 5_000;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SuccessorShareTerms {
    pub successor_listing: String,
    pub observed_at: i64,
    pub deliver_at: Option<i64>,
    pub numerator: u32,
    pub denominator: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SuccessorShareState {
    MissingTerms,
    UnknownPosition,
    NoDistribution,
    Receivable,
    Delivered,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SuccessorShareRow<'a> {
    pub delisting: &'a UniverseChange,
    pub terms: Option<SuccessorShareTerms>,
    pub state: SuccessorShareState,
    pub entitled_shares: Option<u32>,
    pub position_effective_at: Option<i64>,
    pub position_observed_at: Option<i64>,
    pub successor_shares: Option<ChildShares>,
}

pub(crate) struct SuccessorReports(BTreeMap<String, BTreeMap<i64, SuccessorShareTerms>>);

impl SuccessorReports {
    pub(crate) fn known_terms(
        &self,
        change_id: &str,
        known_at: i64,
    ) -> Option<&SuccessorShareTerms> {
        self.0
            .get(change_id)?
            .range(..=known_at)
            .next_back()
            .map(|(_, report)| report)
    }
}

pub(crate) fn parse_successor_terms(
    universe: &UniverseBook,
    csv: &str,
) -> Result<SuccessorReports, String> {
    if csv.len() > 1024 * 1024 {
        return Err("Successor share terms CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, line)| line.trim()) != Some(HEADER) {
        return Err(format!("Expected successor share terms header {HEADER}."));
    }
    let listings = universe.listing_ids();
    let delistings = universe.delisting_ids();
    let mut reports = BTreeMap::<String, BTreeMap<i64, SuccessorShareTerms>>::new();
    for (index, (line, record)) in lines.enumerate() {
        let invalid = |reason| format!("Successor share terms line {}: {reason}", line + 1);
        if index == MAX_REPORTS {
            return Err(invalid("Supply at most 5,000 successor share reports."));
        }
        let mut fields = record.splitn(9, ',').map(str::trim);
        let [Some(scope), Some(listing), Some(change), Some(successor), Some(observed), Some(deliver), Some(numerator), Some(denominator), None] =
            std::array::from_fn(|_| fields.next())
        else {
            return Err(invalid("Expected exactly eight fields."));
        };
        if scope != universe.name() || !delistings.contains(&(listing, change)) {
            return Err(invalid(
                "Use a delisting and listing ID from the supplied universe.",
            ));
        }
        if successor == listing || !listings.contains(successor) {
            return Err(invalid(
                "Use a distinct successor listing from the supplied universe.",
            ));
        }
        let observed_at =
            exact_utc(observed).ok_or_else(|| invalid("Use an exact UTC observation time."))?;
        let deliver_at = if deliver.is_empty() {
            None
        } else {
            Some(
                exact_utc(deliver)
                    .ok_or_else(|| invalid("Use an exact UTC delivery time or leave it blank."))?,
            )
        };
        let numerator = numerator
            .parse::<u32>()
            .ok()
            .filter(|value| *value <= MAX_SHARE_RATIO)
            .ok_or_else(|| invalid("The share ratio numerator must be from 0 to 1,000,000."))?;
        let denominator = denominator
            .parse::<u32>()
            .ok()
            .filter(|value| (1..=MAX_SHARE_RATIO).contains(value))
            .ok_or_else(|| invalid("The share ratio denominator must be from 1 to 1,000,000."))?;
        let report = SuccessorShareTerms {
            successor_listing: successor.to_owned(),
            observed_at,
            deliver_at,
            numerator,
            denominator,
        };
        if reports
            .entry(change.to_owned())
            .or_default()
            .insert(observed_at, report)
            .is_some()
        {
            return Err(invalid(
                "Duplicate terms observation time for this delisting.",
            ));
        }
    }
    if reports.is_empty() {
        return Err("Successor share terms CSV contains no reports.".into());
    }
    Ok(SuccessorReports(reports))
}

pub(crate) fn value_successor_shares(
    entitled_shares: Option<u32>,
    terms: Option<&SuccessorShareTerms>,
    effective_at: i64,
) -> (Option<ChildShares>, SuccessorShareState) {
    let shares = match (entitled_shares, terms) {
        (Some(0), _) | (_, Some(SuccessorShareTerms { numerator: 0, .. })) => Some(ChildShares {
            numerator: 0,
            denominator: 1,
        }),
        (Some(shares), Some(report)) => Some(ChildShares::from_rate(
            shares,
            report.numerator,
            report.denominator,
        )),
        _ => None,
    };
    let state = match (shares, terms) {
        (Some(ChildShares { numerator: 0, .. }), _) => SuccessorShareState::NoDistribution,
        (_, None) => SuccessorShareState::MissingTerms,
        (None, _) => SuccessorShareState::UnknownPosition,
        (Some(_), Some(report)) if report.deliver_at.is_some_and(|at| at <= effective_at) => {
            SuccessorShareState::Delivered
        }
        (Some(_), Some(_)) => SuccessorShareState::Receivable,
    };
    (shares, state)
}

/// Recognize reported stock consideration for delistings visible at both cutoffs.
/// The supplied holdings history remains the source for portfolio positions.
pub fn portfolio_successor_shares_as_of<'a>(
    universe: &'a UniverseBook,
    holdings: &str,
    terms: &str,
    effective_at: i64,
    known_at: i64,
) -> Result<Vec<SuccessorShareRow<'a>>, String> {
    let holdings = parse_holdings(universe, holdings)?;
    let reports = parse_successor_terms(universe, terms)?;
    let mut rows = Vec::new();
    for delisting in universe.as_of(effective_at, known_at) {
        if delisting.action != UniverseAction::Delist {
            continue;
        }
        let position = holdings.get(&delisting.listing_id);
        if position.is_none() && !reports.0.contains_key(&delisting.change_id) {
            continue;
        }
        let terms = reports.known_terms(&delisting.change_id, known_at);
        let position =
            position.and_then(|series| series.position(Excluded(delisting.effective_at), known_at));
        let entitled_shares = position.map(|(_, _, shares)| shares);
        let (successor_shares, state) =
            value_successor_shares(entitled_shares, terms, effective_at);
        rows.push(SuccessorShareRow {
            delisting,
            terms: terms.cloned(),
            state,
            entitled_shares,
            position_effective_at: position.map(|(effective, _, _)| effective),
            position_observed_at: position.map(|(_, observed, _)| observed),
            successor_shares,
        });
    }
    Ok(rows)
}
