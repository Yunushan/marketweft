use crate::{
    history::{decimal, exact_utc},
    screen::rounded_div,
    universe::valid_id,
    UniverseAction, UniverseBook, UniverseChange, MAX_TICKS, SCALE,
};
use std::collections::{BTreeMap, BTreeSet};

const MAX_ROWS: usize = 5_000;
const MAX_LEDGER_EVALUATIONS: usize = 2_000_000;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CashOffer {
    pub currency: String,
    pub proceeds_per_share: i64,
    pub pay_at: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReferenceClose {
    pub at: i64,
    pub price: i64,
    pub currency: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelistingTerms {
    pub listing_id: String,
    pub change_id: String,
    pub observed_at: i64,
    pub offer: Option<CashOffer>,
    pub reference: Option<ReferenceClose>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DelistingState {
    Unobserved,
    Shares,
    MissingProceeds,
    Receivable,
    Paid,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelistingValuation<'a> {
    pub state: DelistingState,
    pub ordinary_shares: u32,
    pub entitled_shares: u32,
    pub delisting: Option<&'a UniverseChange>,
    pub terms: Option<&'a DelistingTerms>,
    pub reference: Option<&'a ReferenceClose>,
    pub cash_value: Option<i128>,
    pub return_pct_micros: Option<i128>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelistingCashPosting {
    pub at: i64,
    pub currency: String,
    pub delta: i128,
    pub balance: i128,
}

pub struct DelistingBook {
    membership: UniverseBook,
    by_change: BTreeMap<(String, String), Vec<DelistingTerms>>,
}

impl DelistingBook {
    pub fn new(membership: UniverseBook, terms: Vec<DelistingTerms>) -> Result<Self, String> {
        if terms.len() > MAX_ROWS {
            return Err("Supply at most 5,000 delisting reports.".into());
        }
        let delistings = membership.delisting_ids();
        let mut by_change = BTreeMap::<_, Vec<_>>::new();
        for row in terms {
            if !delistings.contains(&(row.listing_id.as_str(), row.change_id.as_str())) {
                return Err(format!(
                    "Unknown delisting {} for {}.",
                    row.change_id, row.listing_id
                ));
            }
            if row.offer.as_ref().is_some_and(|offer| {
                !valid_currency(&offer.currency)
                    || !(0..=MAX_TICKS).contains(&offer.proceeds_per_share)
            }) {
                return Err(
                    "Use a three-letter uppercase currency and nonnegative proceeds.".into(),
                );
            }
            if row.reference.as_ref().is_some_and(|reference| {
                reference.at > row.observed_at
                    || !(1..=MAX_TICKS).contains(&reference.price)
                    || !valid_currency(&reference.currency)
            }) {
                return Err(
                    "The positive reference close must be known when the terms were observed."
                        .into(),
                );
            }
            by_change
                .entry((row.listing_id.clone(), row.change_id.clone()))
                .or_default()
                .push(row);
        }
        for reports in by_change.values_mut() {
            reports.sort_unstable_by_key(|report| report.observed_at);
            if reports
                .windows(2)
                .any(|pair| pair[0].observed_at == pair[1].observed_at)
            {
                return Err("A delisting has duplicate terms observation times.".into());
            }
        }
        Ok(Self {
            membership,
            by_change,
        })
    }

    pub fn as_of(
        &self,
        listing: &str,
        shares: u32,
        effective_at: i64,
        known_at: i64,
    ) -> Result<DelistingValuation<'_>, String> {
        self.validate_query(listing, shares)?;
        let member = self
            .membership
            .as_of(effective_at, known_at)
            .into_iter()
            .find(|member| member.listing_id == listing);
        Ok(self.value(member, shares, effective_at, known_at))
    }

    pub fn ledger(
        &self,
        listing: &str,
        shares: u32,
        through: i64,
    ) -> Result<Vec<DelistingCashPosting>, String> {
        self.validate_query(listing, shares)?;
        let membership = self.membership.for_listing(listing).unwrap();
        let mut checkpoints: BTreeSet<_> = membership.checkpoints().into_iter().collect();
        for ((term_listing, _), terms) in &self.by_change {
            if term_listing == listing {
                for row in terms {
                    checkpoints.insert(row.observed_at);
                    if let Some(pay) = row.offer.as_ref().and_then(|offer| offer.pay_at) {
                        checkpoints.insert(pay);
                    }
                }
            }
        }
        let checkpoints: Vec<_> = checkpoints
            .into_iter()
            .take_while(|at| *at <= through)
            .collect();
        if checkpoints.len() > MAX_LEDGER_EVALUATIONS / membership.report_count() {
            return Err("Delisting replay exceeds two million membership evaluations.".into());
        }
        let mut ledger = Vec::new();
        let mut prior: Option<(&str, i128)> = None;
        for at in checkpoints {
            let current = self.value(membership.as_of(at, at).first().copied(), shares, at, at);
            let paid = (current.state == DelistingState::Paid).then(|| {
                let currency = current
                    .terms
                    .unwrap()
                    .offer
                    .as_ref()
                    .unwrap()
                    .currency
                    .as_str();
                (currency, current.cash_value.unwrap())
            });
            match (prior, paid) {
                (Some((old_currency, before)), Some((currency, after)))
                    if old_currency == currency =>
                {
                    post(&mut ledger, at, currency, after - before, after);
                }
                (old, new) => {
                    if let Some((currency, before)) = old {
                        post(&mut ledger, at, currency, -before, 0);
                    }
                    if let Some((currency, after)) = new {
                        post(&mut ledger, at, currency, after, after);
                    }
                }
            }
            prior = paid;
        }
        Ok(ledger)
    }

    fn validate_query(&self, listing: &str, shares: u32) -> Result<(), String> {
        if !self.membership.listing_ids().contains(listing) {
            return Err("Select a listing in the universe membership report.".into());
        }
        if shares > 1_000_000 {
            return Err("Supply at most 1,000,000 entitled shares.".into());
        }
        Ok(())
    }

    fn value<'a>(
        &'a self,
        member: Option<&'a UniverseChange>,
        shares: u32,
        effective_at: i64,
        known_at: i64,
    ) -> DelistingValuation<'a> {
        let Some(change) = member.filter(|row| row.action == UniverseAction::Delist) else {
            return DelistingValuation {
                state: if member.is_some() {
                    DelistingState::Shares
                } else {
                    DelistingState::Unobserved
                },
                ordinary_shares: if member.is_some() { shares } else { 0 },
                entitled_shares: 0,
                delisting: None,
                terms: None,
                reference: None,
                cash_value: None,
                return_pct_micros: None,
            };
        };
        let terms = self
            .by_change
            .get(&(change.listing_id.clone(), change.change_id.clone()))
            .and_then(|rows| {
                rows.partition_point(|row| row.observed_at <= known_at)
                    .checked_sub(1)
                    .map(|index| &rows[index])
            });
        let offer = terms.and_then(|row| row.offer.as_ref());
        let reference = terms
            .and_then(|row| row.reference.as_ref())
            .filter(|close| close.at <= change.effective_at);
        let state = match offer {
            Some(offer) if offer.pay_at.is_some_and(|pay| pay <= effective_at) => {
                DelistingState::Paid
            }
            Some(_) => DelistingState::Receivable,
            None => DelistingState::MissingProceeds,
        };
        DelistingValuation {
            state,
            ordinary_shares: 0,
            entitled_shares: shares,
            delisting: Some(change),
            terms,
            reference,
            cash_value: offer.map(|row| i128::from(row.proceeds_per_share) * i128::from(shares)),
            return_pct_micros: offer
                .zip(reference)
                .filter(|(row, close)| row.currency == close.currency)
                .map(|(row, close)| {
                    rounded_div(
                        i128::from(row.proceeds_per_share - close.price) * i128::from(100 * SCALE),
                        i128::from(close.price),
                    )
                }),
        }
    }
}

fn valid_currency(value: &str) -> bool {
    value.len() == 3 && value.bytes().all(|byte| byte.is_ascii_uppercase())
}

fn post(
    ledger: &mut Vec<DelistingCashPosting>,
    at: i64,
    currency: &str,
    delta: i128,
    balance: i128,
) {
    if delta != 0 {
        ledger.push(DelistingCashPosting {
            at,
            currency: currency.to_owned(),
            delta,
            balance,
        });
    }
}

pub fn parse_delistings(membership: UniverseBook, csv: &str) -> Result<DelistingBook, String> {
    if csv.len() > 1024 * 1024 {
        return Err("Delisting proceeds CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    const HEADER: &str = "listing_id,change_id,observed_at,pay_at,currency,proceeds_per_share,reference_at,reference_close,reference_currency";
    if lines.next().map(|(_, row)| row.trim()) != Some(HEADER) {
        return Err(format!("Expected delisting terms header {HEADER}."));
    }
    let mut terms = Vec::new();
    for (line, row) in lines {
        if terms.len() == MAX_ROWS {
            return Err("Supply at most 5,000 delisting reports.".into());
        }
        let invalid = || format!("Invalid delisting terms on line {}.", line + 1);
        let fields: Vec<_> = row.split(',').map(str::trim).collect();
        let &[listing, change, observed, pay, currency, proceeds, close_at, close, close_currency] =
            fields.as_slice()
        else {
            return Err(invalid());
        };
        if !valid_id(listing) || !valid_id(change) {
            return Err(invalid());
        }
        let reference = match (close_at, close, close_currency) {
            ("", "", "") => None,
            (_, _, _) => Some(ReferenceClose {
                at: exact_utc(close_at).ok_or_else(invalid)?,
                price: decimal(close).ok_or_else(invalid)?,
                currency: close_currency.to_owned(),
            }),
        };
        let offer = match (pay, currency, proceeds) {
            ("", "", "") => None,
            (_, _, _) => Some(CashOffer {
                pay_at: if pay.is_empty() {
                    None
                } else {
                    Some(exact_utc(pay).ok_or_else(invalid)?)
                },
                currency: currency.to_owned(),
                proceeds_per_share: decimal(proceeds).ok_or_else(invalid)?,
            }),
        };
        terms.push(DelistingTerms {
            listing_id: listing.to_owned(),
            change_id: change.to_owned(),
            observed_at: exact_utc(observed).ok_or_else(invalid)?,
            offer,
            reference,
        });
    }
    DelistingBook::new(membership, terms)
}
