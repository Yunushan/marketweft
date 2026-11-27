use super::Replay;
use crate::{DelistingBook, DelistingState, PaperAction, UniverseAction};
use std::{collections::BTreeMap, iter::Peekable, vec};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionDelistingClaim {
    pub listing_id: String,
    pub change_id: String,
    pub effective_at: i64,
    pub observed_at: i64,
    pub terms_observed_at: Option<i64>,
    pub pay_at: Option<i64>,
    pub shares: u64,
    pub state: DelistingState,
    pub currency: Option<String>,
    pub amount: Option<i128>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionDelistingPosting {
    pub claim: CrossSectionDelistingClaim,
    pub posted_at: i64,
    pub cash_delta: i128,
    pub receipt_id: Option<String>,
}

pub(super) struct DelistingReplay<'a> {
    book: &'a DelistingBook,
    currency: &'a str,
    schedule: Peekable<vec::IntoIter<i64>>,
    claims: BTreeMap<String, CrossSectionDelistingClaim>,
    pub postings: Vec<CrossSectionDelistingPosting>,
}

impl<'a> DelistingReplay<'a> {
    pub fn new(
        book: &'a DelistingBook,
        currency: &'a str,
        from: i64,
        known: i64,
    ) -> Result<Self, String> {
        Ok(Self {
            book,
            currency,
            schedule: book.paper_checkpoints(from, known)?.into_iter().peekable(),
            claims: BTreeMap::new(),
            postings: Vec::new(),
        })
    }

    pub fn next_time(&mut self) -> Option<i64> {
        self.schedule.peek().copied()
    }

    pub fn claims(&self) -> impl Iterator<Item = &CrossSectionDelistingClaim> {
        self.claims.values()
    }

    pub fn advance(&mut self, replay: &mut Replay<'_>, effective: i64) -> Result<(), String> {
        let at = self
            .schedule
            .next()
            .expect("a delisting checkpoint is pending");
        let through = effective.min(at);
        let delisted: BTreeMap<_, _> = replay
            .prices
            .universe
            .as_of(through, at)
            .into_iter()
            .filter(|row| row.action == UniverseAction::Delist)
            .map(|row| (row.listing_id.as_str(), row))
            .collect();
        for (listing, previous) in std::mem::take(&mut self.claims) {
            if !delisted.contains_key(listing.as_str()) {
                replay.move_position(&listing, at, &previous.change_id, false)?;
                self.post_delta(replay, at, Some(&previous), None)?;
            } else {
                self.claims.insert(listing, previous);
            }
        }

        for (listing, change) in delisted {
            if let Some(order_id) = replay.pending.remove(listing) {
                replay.record(listing, at, PaperAction::Cancel { order_id })?;
            }
            if replay.shares(listing) > 0 {
                replay.move_position(listing, at, &change.change_id, true)?;
            }
            let Some(position) = replay.ledger.retired_position(&replay.aliases[listing]) else {
                continue;
            };
            let valuation = self
                .book
                .value(Some(change), position.shares as u32, through, at);
            let offer = valuation.terms.and_then(|row| row.offer.as_ref());
            let claim = CrossSectionDelistingClaim {
                listing_id: listing.to_owned(),
                change_id: change.change_id.clone(),
                effective_at: change.effective_at,
                observed_at: change.observed_at,
                terms_observed_at: valuation.terms.map(|row| row.observed_at),
                pay_at: offer.and_then(|row| row.pay_at),
                shares: position.shares,
                state: valuation.state,
                currency: offer.map(|row| row.currency.clone()),
                amount: valuation.cash_value,
            };
            let previous = self.claims.remove(listing);
            self.post_delta(replay, at, previous.as_ref(), Some(&claim))?;
            self.claims.insert(claim.listing_id.clone(), claim);
        }
        Ok(())
    }

    fn post_delta(
        &mut self,
        replay: &mut Replay<'_>,
        at: i64,
        previous: Option<&CrossSectionDelistingClaim>,
        current: Option<&CrossSectionDelistingClaim>,
    ) -> Result<(), String> {
        let previous = previous.filter(|row| row.state == DelistingState::Paid);
        let paid = current.filter(|row| row.state == DelistingState::Paid);
        match (previous, paid) {
            (Some(old), Some(new)) if old.currency == new.currency => {
                self.post(replay, at, new, new.amount.unwrap() - old.amount.unwrap())?;
            }
            (old, new) => {
                if let Some(old) = old {
                    self.post(replay, at, old, -old.amount.unwrap())?;
                }
                if let Some(new) = new {
                    self.post(replay, at, new, new.amount.unwrap())?;
                }
            }
        }
        Ok(())
    }

    fn post(
        &mut self,
        replay: &mut Replay<'_>,
        at: i64,
        claim: &CrossSectionDelistingClaim,
        cash_delta: i128,
    ) -> Result<(), String> {
        if cash_delta != 0 {
            let receipt_id = if claim.currency.as_deref() == Some(self.currency) {
                Some(replay.post_cash(&claim.listing_id, at, &claim.change_id, cash_delta)?)
            } else {
                None
            };
            self.postings.push(CrossSectionDelistingPosting {
                claim: claim.clone(),
                posted_at: at,
                cash_delta,
                receipt_id,
            });
        }
        Ok(())
    }
}
