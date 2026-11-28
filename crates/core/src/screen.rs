use crate::{
    history::{decimal, exact_utc},
    UniverseAction, UniverseBook, UniverseChange,
};
use std::{cmp::Ordering, collections::BTreeMap};

#[path = "relative.rs"]
mod relative;
pub use relative::{RelativeLegPoint, RelativePoint};
#[path = "portfolio_scenarios.rs"]
mod portfolio_scenarios;
pub use portfolio_scenarios::{
    PortfolioScenarioConfig, PortfolioScenarioPath, PortfolioScenarioReport, ScenarioAllocation,
    ScenarioCoverage,
};
#[path = "listing_risk.rs"]
mod listing_risk;
pub use listing_risk::{
    ListingRiskPoint, ListingRiskQuery, PortfolioVarianceAllocation, PortfolioVarianceQuery,
    PortfolioVarianceReport, PortfolioVarianceSample,
};

const MAX_PRICE_ROWS: usize = 20_000;
pub(crate) const MAX_PRICE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PriceObservation {
    pub observed_at: i64,
    pub ticks: i64,
}

/// Close prices indexed by immutable listing identity, price time and observation time.
#[derive(Clone, Debug)]
pub struct PriceBook<'a> {
    pub(crate) universe: &'a UniverseBook,
    prices: BTreeMap<String, BTreeMap<i64, BTreeMap<i64, i64>>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScreenRow<'a> {
    pub listing: &'a UniverseChange,
    pub baseline: Option<PriceObservation>,
    pub current: Option<PriceObservation>,
    pub rank: Option<usize>,
    /// Price return in 0.0001 percentage-point units. Ranking uses the exact ratio.
    pub return_units: Option<i128>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScreenCutoff {
    pub effective_at: i64,
    pub known_at: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScreenComparisonLeg<'a> {
    pub membership: Option<&'a UniverseChange>,
    pub rank: Option<usize>,
    pub return_units: Option<i128>,
    pub baseline: Option<PriceObservation>,
    pub current: Option<PriceObservation>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScreenComparisonRow<'a> {
    pub listing: &'a UniverseChange,
    pub before: ScreenComparisonLeg<'a>,
    pub after: ScreenComparisonLeg<'a>,
    /// Positive means that an active listing's rank improved.
    pub rank_move: Option<i64>,
}

impl<'a> PriceBook<'a> {
    pub fn parse(universe: &'a UniverseBook, csv: &str) -> Result<Self, String> {
        if csv.len() > MAX_PRICE_BYTES {
            return Err("Universe prices CSV exceeds 2 MiB.".into());
        }
        let mut lines = csv
            .trim_start_matches('\u{feff}')
            .lines()
            .enumerate()
            .filter(|(_, row)| !row.trim().is_empty());
        if lines.next().map(|(_, row)| row.trim())
            != Some("universe,listing_id,price_at,observed_at,close")
        {
            return Err(
                "Expected price header universe,listing_id,price_at,observed_at,close.".into(),
            );
        }

        let listing_ids = universe.listing_ids();
        let mut book = Self {
            universe,
            prices: BTreeMap::new(),
        };
        for (i, (line, row)) in lines.enumerate() {
            let error = |reason: &str| format!("Price line {}: {reason}", line + 1);
            if i == MAX_PRICE_ROWS {
                return Err(error("Supply at most 20,000 price reports."));
            }
            let fields: Vec<_> = row.split(',').map(str::trim).collect();
            let [name, listing, at, observed, close] = fields.as_slice() else {
                return Err(error("Expected exactly five fields."));
            };
            if *name != universe.name() {
                return Err(error("Price and membership universe IDs must match."));
            }
            if !listing_ids.contains(listing) {
                return Err(error(
                    "Price listing ID does not occur in the membership history.",
                ));
            }
            let price_at = exact_utc(at).ok_or_else(|| error("Use exact UTC price timestamps."))?;
            let observed_at = exact_utc(observed)
                .ok_or_else(|| error("Use exact UTC observation timestamps."))?;
            if observed_at < price_at {
                return Err(error("A close cannot be observed before its price time."));
            }
            let ticks = decimal(close)
                .filter(|ticks| *ticks > 0)
                .ok_or_else(|| error("Use a positive close with at most six decimal places."))?;
            if book
                .prices
                .entry((*listing).into())
                .or_default()
                .entry(price_at)
                .or_default()
                .insert(observed_at, ticks)
                .is_some()
            {
                return Err(error(
                    "Duplicate observation for this listing and price time.",
                ));
            }
        }
        Ok(book)
    }

    pub(crate) fn exact_close(
        &self,
        listing_id: &str,
        price_at: i64,
        known_at: i64,
    ) -> Option<PriceObservation> {
        let (&observed_at, &ticks) = self
            .prices
            .get(listing_id)?
            .get(&price_at)?
            .range(..=known_at)
            .next_back()?;
        Some(PriceObservation { observed_at, ticks })
    }

    /// Use members effective at the target and reports known by a shared observation cutoff.
    /// Each endpoint requires a close at its exact time. Missing members remain in the results.
    pub fn screen(
        &self,
        baseline_at: i64,
        effective_at: i64,
        known_at: i64,
    ) -> Result<Vec<ScreenRow<'a>>, String> {
        if baseline_at > effective_at {
            return Err("Baseline time must be at or before effective time.".into());
        }
        let mut rows = Vec::new();
        for listing in self.universe.as_of(effective_at, known_at) {
            if listing.action != UniverseAction::Add {
                continue;
            }
            let price = |at| self.exact_close(&listing.listing_id, at, known_at);
            rows.push(ScreenRow {
                listing,
                baseline: price(baseline_at),
                current: price(effective_at),
                rank: None,
                return_units: None,
            });
        }
        rows.sort_unstable_by(|a, b| {
            match (a.ratio(), b.ratio()) {
                (Some(a), Some(b)) => compare(b, a),
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                (None, None) => Ordering::Equal,
            }
            .then_with(|| a.listing.listing_id.cmp(&b.listing.listing_id))
        });

        let mut previous = None;
        let mut rank = 0;
        for (index, row) in rows.iter_mut().enumerate() {
            let Some((current, base)) = row.ratio() else {
                break;
            };
            if previous.is_none_or(|prior| compare(prior, (current, base)) != Ordering::Equal) {
                rank = index + 1;
            }
            let scaled = (current - base) * 1_000_000;
            row.rank = Some(rank);
            row.return_units = Some(rounded_div(scaled, base));
            previous = Some((current, base));
        }
        Ok(rows)
    }

    /// Join the two active sets by stable listing ID, retaining the known membership evidence.
    pub fn compare_ranks(
        &self,
        baseline_at: i64,
        before: ScreenCutoff,
        after: ScreenCutoff,
    ) -> Result<Vec<ScreenComparisonRow<'a>>, String> {
        fn states(book: &UniverseBook, cutoff: ScreenCutoff) -> BTreeMap<&str, &UniverseChange> {
            book.as_of(cutoff.effective_at, cutoff.known_at)
                .into_iter()
                .map(|change| (change.listing_id.as_str(), change))
                .collect()
        }

        fn leg<'a>(
            membership: Option<&'a UniverseChange>,
            row: Option<ScreenRow<'a>>,
        ) -> ScreenComparisonLeg<'a> {
            let row = row.as_ref();
            ScreenComparisonLeg {
                membership,
                rank: row.and_then(|row| row.rank),
                return_units: row.and_then(|row| row.return_units),
                baseline: row.and_then(|row| row.baseline),
                current: row.and_then(|row| row.current),
            }
        }

        let before_states = states(self.universe, before);
        let after_states = states(self.universe, after);
        let mut rows = BTreeMap::new();
        for row in self.screen(baseline_at, before.effective_at, before.known_at)? {
            let id = row.listing.listing_id.as_str();
            rows.entry(id).or_insert((None, None)).0 = Some(row);
        }
        for row in self.screen(baseline_at, after.effective_at, after.known_at)? {
            let id = row.listing.listing_id.as_str();
            rows.entry(id).or_insert((None, None)).1 = Some(row);
        }
        Ok(rows
            .into_iter()
            .map(|(id, (before, after))| {
                let listing = after
                    .as_ref()
                    .or(before.as_ref())
                    .expect("a comparison row is a member of at least one side")
                    .listing;
                let before = leg(before_states.get(id).copied(), before);
                let after = leg(after_states.get(id).copied(), after);
                let rank_move = before
                    .rank
                    .zip(after.rank)
                    .map(|(from, to)| from as i64 - to as i64);
                ScreenComparisonRow {
                    listing,
                    before,
                    after,
                    rank_move,
                }
            })
            .collect())
    }
}

impl ScreenRow<'_> {
    pub(crate) fn ratio(&self) -> Option<(i128, i128)> {
        Some((self.current?.ticks.into(), self.baseline?.ticks.into()))
    }
}

/// Rounds a nonnegative ratio to decimal units one digit at a time.
/// Callers bound the denominator so a remainder multiplied by ten fits in i128.
pub(crate) fn decimal_ratio(numerator: i128, denominator: i128, places: u32) -> i128 {
    let mut quotient = numerator / denominator;
    let mut remainder = numerator % denominator;
    for _ in 0..places {
        remainder *= 10;
        quotient = quotient * 10 + remainder / denominator;
        remainder %= denominator;
    }
    quotient + i128::from(2 * remainder >= denominator)
}

pub(crate) fn rounded_div(numerator: i128, denominator: i128) -> i128 {
    (numerator.abs() + denominator / 2) / denominator * numerator.signum()
}

fn compare((a, b): (i128, i128), (c, d): (i128, i128)) -> Ordering {
    (a * d).cmp(&(c * b))
}
