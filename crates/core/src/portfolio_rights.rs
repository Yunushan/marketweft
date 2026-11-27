use super::{parse_holdings, ChildShares, MAX_SHARE_RATIO};
use crate::{
    delisting::valid_currency,
    history::{decimal, exact_utc, valid_second},
    universe::valid_id,
    UniverseBook, MAX_TICKS,
};
use std::{collections::BTreeMap, ops::Bound::Excluded};

const HEADER: &str = "universe,offering_id,listing_id,observed_at,status,subscription_listing,announced_at,entitlement_at,opens_at,expires_at,numerator,denominator,currency,subscription_price,fraction_policy";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RightsFractionPolicy {
    Down,
    Nearest,
    Up,
}

impl RightsFractionPolicy {
    fn whole_shares(self, exact: ChildShares) -> u64 {
        let denominator = u64::from(exact.denominator);
        let whole = exact.numerator / denominator;
        let remainder = exact.numerator % denominator;
        whole
            + u64::from(match self {
                Self::Down => false,
                Self::Nearest => remainder * 2 >= denominator,
                Self::Up => remainder > 0,
            })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RightsOfferingPhase {
    Announced,
    AwaitingOpen,
    Open,
    Expired,
    Cancelled,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RightsOfferingTerms {
    pub subscription_listing: String,
    pub announced_at: i64,
    pub entitlement_at: i64,
    pub opens_at: i64,
    pub expires_at: i64,
    pub numerator: u32,
    pub denominator: u32,
    pub currency: String,
    pub subscription_price: i64,
    pub fraction_policy: RightsFractionPolicy,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RightsEntitlement {
    pub holding_effective_at: i64,
    pub holding_observed_at: i64,
    pub held_shares: u32,
    pub exact_shares: ChildShares,
    pub subscribable_shares: u64,
    pub full_subscription_cost: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RightsOfferingRow {
    pub offering_id: String,
    pub listing_id: String,
    pub observed_at: i64,
    pub phase: RightsOfferingPhase,
    pub terms: Option<RightsOfferingTerms>,
    pub entitlement: Option<RightsEntitlement>,
}

struct RightsHistory {
    listing_id: String,
    revisions: BTreeMap<i64, Option<RightsOfferingTerms>>,
}

fn parse_rights(
    universe: &UniverseBook,
    csv: &str,
) -> Result<BTreeMap<String, RightsHistory>, String> {
    if csv.len() > 1024 * 1024 {
        return Err("Subscription rights CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, line)| line.trim()) != Some(HEADER) {
        return Err(format!("Expected subscription rights header {HEADER}."));
    }
    let listings = universe.listing_ids();
    let mut reports = BTreeMap::new();
    for (index, (line, row)) in lines.enumerate() {
        let error = |message: &str| format!("Subscription rights line {}: {message}", line + 1);
        if index == 1_000 {
            return Err(error("Supply at most 1,000 subscription rights reports."));
        }
        let mut fields = row.splitn(16, ',').map(str::trim);
        let [Some(scope), Some(id), Some(listing), Some(observed), Some(status), Some(target), Some(announced), Some(entitlement), Some(opens), Some(expires), Some(numerator), Some(denominator), Some(currency), Some(price), Some(policy), None] =
            std::array::from_fn(|_| fields.next())
        else {
            return Err(error("Expected exactly fifteen fields."));
        };
        if scope != universe.name() || !valid_id(id) || !listings.contains(listing) {
            return Err(error(
                "Supply a valid offering ID and a listing ID from this universe.",
            ));
        }
        let time = |value| exact_utc(value).ok_or_else(|| error("Use exact UTC times."));
        let observed_at = time(observed)?;
        let terms = match status {
            "cancel" => {
                if [
                    target,
                    announced,
                    entitlement,
                    opens,
                    expires,
                    numerator,
                    denominator,
                    currency,
                    price,
                    policy,
                ]
                .into_iter()
                .any(|field| !field.is_empty())
                {
                    return Err(error("Leave the offer terms empty for a cancellation."));
                }
                None
            }
            "offer" => {
                if !listings.contains(target) {
                    return Err(error(
                        "Supply a subscription listing ID from this universe.",
                    ));
                }
                let (announced_at, entitlement_at, opens_at, expires_at) = (
                    time(announced)?,
                    time(entitlement)?,
                    time(opens)?,
                    time(expires)?,
                );
                if announced_at > observed_at
                    || announced_at > entitlement_at
                    || entitlement_at > opens_at
                    || opens_at >= expires_at
                {
                    return Err(error("Use an ordered announcement, entitlement and exercise window, with observation at or after announcement."));
                }
                let ratio = |value: &str| {
                    value
                        .parse::<u32>()
                        .ok()
                        .filter(|value| (1..=MAX_SHARE_RATIO).contains(value))
                        .ok_or_else(|| error("Use ratio integers from 1 to 1,000,000."))
                };
                let subscription_price = decimal(price)
                    .filter(|price| (1..=MAX_TICKS).contains(price))
                    .ok_or_else(|| {
                        error("Use a positive subscription price with up to six decimal places.")
                    })?;
                if !valid_currency(currency) {
                    return Err(error("Use a three-letter uppercase subscription currency."));
                }
                let fraction_policy = match policy {
                    "down" => RightsFractionPolicy::Down,
                    "nearest" => RightsFractionPolicy::Nearest,
                    "up" => RightsFractionPolicy::Up,
                    _ => return Err(error("Use down, nearest or up as the fraction policy.")),
                };
                Some(RightsOfferingTerms {
                    subscription_listing: target.to_owned(),
                    announced_at,
                    entitlement_at,
                    opens_at,
                    expires_at,
                    numerator: ratio(numerator)?,
                    denominator: ratio(denominator)?,
                    currency: currency.to_owned(),
                    subscription_price,
                    fraction_policy,
                })
            }
            _ => return Err(error("Use offer or cancel as the status.")),
        };
        let history = reports
            .entry(id.to_owned())
            .or_insert_with(|| RightsHistory {
                listing_id: listing.to_owned(),
                revisions: BTreeMap::new(),
            });
        if history.listing_id != listing {
            return Err(error("An offering must retain its original listing ID."));
        }
        if history.revisions.insert(observed_at, terms).is_some() {
            return Err(error("Duplicate observation time for this offering."));
        }
    }
    if reports.is_empty() {
        return Err("Subscription rights CSV contains no reports.".into());
    }
    Ok(reports)
}

/// Reconstruct reported basic subscription rights at independent economic and knowledge cutoffs.
pub fn portfolio_rights_as_of(
    universe: &UniverseBook,
    holdings: &str,
    reports: &str,
    effective_at: i64,
    known_at: i64,
) -> Result<Vec<RightsOfferingRow>, String> {
    if !valid_second(effective_at) || !valid_second(known_at) {
        return Err("Supply valid UTC effective and knowledge cutoffs.".into());
    }
    let holdings = parse_holdings(universe, holdings)?;
    let reports = parse_rights(universe, reports)?;
    Ok(reports
        .into_iter()
        .filter_map(|(offering_id, history)| {
            let (&observed_at, terms) = history.revisions.range(..=known_at).next_back()?;
            let (phase, entitlement) = match terms {
                None => (RightsOfferingPhase::Cancelled, None),
                Some(terms) if effective_at < terms.announced_at => return None,
                Some(terms) if effective_at < terms.entitlement_at => {
                    (RightsOfferingPhase::Announced, None)
                }
                Some(terms) => {
                    let phase = if effective_at < terms.opens_at {
                        RightsOfferingPhase::AwaitingOpen
                    } else if effective_at < terms.expires_at {
                        RightsOfferingPhase::Open
                    } else {
                        RightsOfferingPhase::Expired
                    };
                    let entitlement = holdings
                        .get(&history.listing_id)
                        .and_then(|series| {
                            series.position(Excluded(terms.entitlement_at), known_at)
                        })
                        .map(|(holding_effective_at, holding_observed_at, held_shares)| {
                            let exact_shares = ChildShares::from_rate(
                                held_shares,
                                terms.numerator,
                                terms.denominator,
                            );
                            let subscribable_shares =
                                terms.fraction_policy.whole_shares(exact_shares);
                            RightsEntitlement {
                                holding_effective_at,
                                holding_observed_at,
                                held_shares,
                                exact_shares,
                                subscribable_shares,
                                full_subscription_cost: i128::from(subscribable_shares)
                                    * i128::from(terms.subscription_price),
                            }
                        });
                    (phase, entitlement)
                }
            };
            Some(RightsOfferingRow {
                offering_id,
                listing_id: history.listing_id,
                observed_at,
                phase,
                terms: terms.clone(),
                entitlement,
            })
        })
        .collect())
}
