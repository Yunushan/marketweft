use super::PaperHoldings;
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
    pub receipt_id: Option<String>,
}

pub(super) struct DividendReplay<'a> {
    pub currency: &'a str,
    pub postings: Vec<CrossSectionDividendPosting>,
    schedule: Peekable<vec::IntoIter<(&'a str, DividendSchedule<'a>)>>,
    paid: BTreeMap<(&'a str, &'a str), (&'a str, i128)>,
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

    pub fn next_postings(
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
            .map_or(0, |(_, shares)| *shares);
        let amount = if report.pay_at <= effective.min(event.at) {
            i128::from(entitled_shares) * i128::from(report.amount_per_share)
        } else {
            0
        };
        let previous = self.paid.remove(&key);
        if amount != 0 {
            self.paid.insert(key, (report.currency.as_str(), amount));
        }

        let posting = |currency: &str, cash_delta: i128| CrossSectionDividendPosting {
            listing_id: listing.to_owned(),
            dividend_id: report.id.clone(),
            posted_at: event.at,
            observed_at: report.observed_at,
            ex_at: report.ex_at,
            pay_at: report.pay_at,
            entitled_shares,
            currency: currency.to_owned(),
            cash_delta,
            receipt_id: None,
        };
        let mut changes = Vec::new();
        let mut delta = amount;
        if let Some((currency, paid)) = previous {
            if currency == report.currency {
                delta -= paid;
            } else {
                changes.push(posting(currency, -paid));
            }
        }
        if delta != 0 {
            changes.push(posting(&report.currency, delta));
        }
        changes
    }
}
