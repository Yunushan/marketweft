use super::{PaperHoldings, Replay};
use crate::{dividend::DividendSchedule, portfolio::PortfolioIncomeReports};
use std::{collections::BTreeMap, iter::Peekable, vec};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossSectionDividendPosting {
    pub listing_id: String,
    pub dividend_id: String,
    pub posted_at: i64,
    pub observed_at: i64,
    pub ex_at: i64,
    pub pay_at: i64,
    pub entitled_shares: u64,
    pub currency: String,
    pub cash_delta: i128,
    pub gross_delta: i128,
    pub withholding_delta: Option<i128>,
    pub receipt_id: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct Payment {
    gross: i128,
    withholding: i128,
}

impl Payment {
    fn difference(self, previous: Self) -> Self {
        Self {
            gross: self.gross - previous.gross,
            withholding: self.withholding - previous.withholding,
        }
    }
}

pub(super) struct DividendReplay<'a> {
    currency: &'a str,
    pub postings: Vec<CrossSectionDividendPosting>,
    schedule: Peekable<vec::IntoIter<(&'a str, DividendSchedule<'a>)>>,
    paid: BTreeMap<(&'a str, &'a str), (&'a str, Payment)>,
}

impl<'a> DividendReplay<'a> {
    pub fn new(reports: &'a PortfolioIncomeReports, currency: &'a str) -> Self {
        let mut schedule = Vec::new();
        for (listing, book) in reports.dividend_books() {
            schedule.extend(book.schedule().into_iter().map(|event| (listing, event)));
        }
        schedule.sort_unstable_by(|(a, left), (b, right)| {
            (left.at, a, &left.row.id).cmp(&(right.at, b, &right.row.id))
        });
        Self {
            currency,
            postings: Vec::new(),
            schedule: schedule.into_iter().peekable(),
            paid: BTreeMap::new(),
        }
    }

    pub fn next_time(&mut self) -> Option<i64> {
        self.schedule.peek().map(|(_, event)| event.at)
    }

    pub(super) fn advance(
        &mut self,
        replay: &mut Replay<'_>,
        effective: i64,
    ) -> Result<(), String> {
        let mut changes = self.next_postings(effective, replay.holdings.as_ref().unwrap());
        for posting in &mut changes {
            if posting.currency == self.currency && posting.cash_delta != 0 {
                posting.receipt_id = Some(replay.post_cash(
                    &posting.listing_id,
                    posting.posted_at,
                    &posting.dividend_id,
                    posting.cash_delta,
                )?);
            }
        }
        self.postings.extend(changes);
        Ok(())
    }

    fn next_postings(
        &mut self,
        effective: i64,
        holdings: &PaperHoldings,
    ) -> Vec<CrossSectionDividendPosting> {
        let (listing, event) = self
            .schedule
            .next()
            .expect("a dividend checkpoint is pending");
        let report = event.row;
        let key = (listing, report.id.as_str());
        let entitled_shares = holdings
            .get(listing)
            .and_then(|history| history.range(..report.ex_at).next_back())
            .map_or(0, |(_, observation)| u64::from(observation.shares));
        let zero = Payment::default();
        let payment = if report.pay_at <= effective.min(event.at) {
            let shares = i128::from(entitled_shares);
            Payment {
                gross: shares * i128::from(report.amount_per_share),
                withholding: shares * i128::from(event.withholding_per_share.unwrap_or_default()),
            }
        } else {
            zero
        };
        let previous = self.paid.remove(&key);
        if payment != zero {
            self.paid.insert(key, (report.currency.as_str(), payment));
        }

        let posting = |currency: &str, delta: Payment| CrossSectionDividendPosting {
            listing_id: listing.to_owned(),
            dividend_id: report.id.clone(),
            posted_at: event.at,
            observed_at: report.observed_at,
            ex_at: report.ex_at,
            pay_at: report.pay_at,
            entitled_shares,
            currency: currency.to_owned(),
            cash_delta: delta.gross - delta.withholding,
            gross_delta: delta.gross,
            withholding_delta: event.withholding_per_share.map(|_| delta.withholding),
            receipt_id: None,
        };
        let mut changes = Vec::new();
        let mut delta = payment;
        if let Some((currency, paid)) = previous {
            if currency == report.currency {
                delta = payment.difference(paid);
            } else {
                changes.push(posting(currency, zero.difference(paid)));
            }
        }
        if delta != zero {
            changes.push(posting(&report.currency, delta));
        }
        changes
    }
}
