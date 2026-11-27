use super::super::PositionSeries;
use super::{parse_holdings, parse_successor_terms, value_successor_shares, SuccessorReports};
use crate::{
    history::valid_second, ChildShares, SuccessorShareState, SuccessorShareTerms, UniverseAction,
    UniverseBook, UniverseChange,
};
use std::{
    collections::{BTreeMap, BTreeSet},
    ops::Bound::Excluded,
};

const MAX_EVALUATIONS: usize = 2_000_000;
const EMPTY_BALANCE: ChildShares = ChildShares {
    numerator: 0,
    denominator: 1,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SuccessorShareDelta {
    pub numerator: i128,
    pub denominator: u64,
}

impl SuccessorShareDelta {
    fn between(before: ChildShares, after: ChildShares) -> Self {
        let denominator = u64::from(before.denominator) * u64::from(after.denominator);
        let numerator = i128::from(after.numerator) * i128::from(before.denominator)
            - i128::from(before.numerator) * i128::from(after.denominator);
        let mut divisor = denominator;
        let mut remainder = (numerator.unsigned_abs() % u128::from(denominator)) as u64;
        while remainder != 0 {
            (divisor, remainder) = (remainder, divisor % remainder);
        }
        Self {
            numerator: numerator / i128::from(divisor),
            denominator: denominator / divisor,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SuccessorDeliveryPosting {
    pub posted_at: i64,
    pub listing_id: String,
    pub change_id: String,
    pub successor_listing: String,
    pub delisted_at: i64,
    pub delisting_observed_at: i64,
    pub position_effective_at: i64,
    pub position_observed_at: i64,
    pub entitled_shares: u32,
    pub terms_observed_at: i64,
    pub scheduled_delivery_at: i64,
    pub delta: SuccessorShareDelta,
    pub balance: ChildShares,
}

struct DeliveredClaim<'a> {
    change: &'a UniverseChange,
    terms: &'a SuccessorShareTerms,
    position: (i64, i64, u32),
    deliver_at: i64,
    shares: ChildShares,
}

impl DeliveredClaim<'_> {
    fn post(
        &self,
        at: i64,
        before: ChildShares,
        after: ChildShares,
        rows: &mut Vec<SuccessorDeliveryPosting>,
    ) {
        if before == after {
            return;
        }
        let (position_effective_at, position_observed_at, entitled_shares) = self.position;
        rows.push(SuccessorDeliveryPosting {
            posted_at: at,
            listing_id: self.change.listing_id.clone(),
            change_id: self.change.change_id.clone(),
            successor_listing: self.terms.successor_listing.clone(),
            delisted_at: self.change.effective_at,
            delisting_observed_at: self.change.observed_at,
            position_effective_at,
            position_observed_at,
            entitled_shares,
            terms_observed_at: self.terms.observed_at,
            scheduled_delivery_at: self.deliver_at,
            delta: SuccessorShareDelta::between(before, after),
            balance: after,
        });
    }
}

/// Replay postings through the knowledge cutoff with economic events capped by the effective cutoff.
pub fn portfolio_successor_delivery_ledger(
    universe: &UniverseBook,
    holdings: &str,
    terms: &str,
    effective_at: i64,
    known_at: i64,
) -> Result<Vec<SuccessorDeliveryPosting>, String> {
    if !valid_second(effective_at) || !valid_second(known_at) {
        return Err("Supply valid UTC effective and knowledge cutoffs.".into());
    }
    let holdings = parse_holdings(universe, holdings)?;
    let reports = parse_successor_terms(universe, terms)?;
    delivery_postings(universe, &holdings, &reports, effective_at, known_at)
}

pub(crate) fn successor_delivery_postings_from_observed_positions<'a>(
    universe: &UniverseBook,
    reports: &SuccessorReports,
    effective_at: i64,
    known_at: i64,
    positions: impl Iterator<Item = (&'a str, i64, u32)>,
) -> Result<Vec<SuccessorDeliveryPosting>, String> {
    let mut holdings = BTreeMap::<String, PositionSeries>::new();
    for (listing, at, shares) in positions {
        holdings
            .entry(listing.to_owned())
            .or_insert_with(|| PositionSeries {
                currency: String::new(),
                quantities: BTreeMap::new(),
            })
            .quantities
            .insert(at, BTreeMap::from([(at, shares)]));
    }
    delivery_postings(universe, &holdings, reports, effective_at, known_at)
}

fn delivery_postings(
    universe: &UniverseBook,
    holdings: &BTreeMap<String, PositionSeries>,
    reports: &SuccessorReports,
    effective_at: i64,
    known_at: i64,
) -> Result<Vec<SuccessorDeliveryPosting>, String> {
    let mut listings: BTreeMap<_, Vec<_>> = BTreeMap::new();
    for (listing, change_id) in universe.delisting_ids() {
        if let Some(revisions) = reports
            .0
            .get(change_id)
            .filter(|_| holdings.contains_key(listing))
        {
            listings
                .entry(listing)
                .or_default()
                .extend(revisions.range(..=known_at).map(|(_, terms)| terms));
        }
    }
    let mut rows = Vec::new();
    let mut work = 0;
    for (listing, revisions) in listings {
        let Some(first_possible_delivery) = revisions
            .iter()
            .filter(|terms| terms.numerator > 0)
            .filter_map(|terms| {
                terms
                    .deliver_at
                    .filter(|&at| at <= effective_at)
                    .map(|at| at.max(terms.observed_at))
            })
            .min()
            .filter(|&at| at <= known_at)
        else {
            continue;
        };
        let Some(membership) = universe.for_listing_observed_by(listing, known_at) else {
            continue;
        };
        let source = &holdings[listing];
        let position = PositionSeries {
            currency: source.currency.clone(),
            quantities: source
                .quantities
                .range(..effective_at)
                .filter_map(|(&effective, vintages)| {
                    let visible: BTreeMap<_, _> = vintages
                        .range(..=known_at)
                        .map(|(&at, &qty)| (at, qty))
                        .collect();
                    (!visible.is_empty()).then_some((effective, visible))
                })
                .collect(),
        };
        let mut checkpoints: BTreeSet<_> = membership.checkpoints().into_iter().collect();
        checkpoints.extend(
            position
                .quantities
                .values()
                .flat_map(|vintages| vintages.keys().copied()),
        );
        for terms in revisions {
            checkpoints.insert(terms.observed_at);
            checkpoints.extend(terms.deliver_at.filter(|&at| at <= effective_at));
        }
        let checkpoints: Vec<_> = checkpoints
            .range(first_possible_delivery..=known_at)
            .copied()
            .collect();
        work += checkpoints.len() * (membership.report_count() + position.quantities.len());
        if work > MAX_EVALUATIONS {
            return Err("Successor delivery replay exceeds two million membership and holding evaluations. Use fewer reports or an earlier knowledge cutoff.".into());
        }

        let mut previous: Option<DeliveredClaim<'_>> = None;
        for at in checkpoints {
            let effective = at.min(effective_at);
            let current = membership.as_of(effective, at).first().and_then(|&change| {
                if change.action != UniverseAction::Delist {
                    return None;
                }
                let terms = reports.known_terms(&change.change_id, at)?;
                let holding = position.position(Excluded(change.effective_at), at)?;
                let (shares, state) =
                    value_successor_shares(Some(holding.2), Some(terms), effective);
                (state == SuccessorShareState::Delivered).then(|| DeliveredClaim {
                    change,
                    terms,
                    position: holding,
                    deliver_at: terms.deliver_at.expect("delivered terms have a schedule"),
                    shares: shares.expect("delivered terms have a quantity"),
                })
            });
            match (&previous, &current) {
                (Some(old), Some(new))
                    if old.change.change_id == new.change.change_id
                        && old.terms.successor_listing == new.terms.successor_listing =>
                {
                    new.post(at, old.shares, new.shares, &mut rows);
                }
                (old, new) => {
                    if let Some(old) = old {
                        old.post(at, old.shares, EMPTY_BALANCE, &mut rows);
                    }
                    if let Some(new) = new {
                        new.post(at, EMPTY_BALANCE, new.shares, &mut rows);
                    }
                }
            }
            previous = current;
        }
    }
    // Stable sorting retains posting order within each timestamp, including reversal before credit.
    rows.sort_by_key(|row| row.posted_at);
    Ok(rows)
}
