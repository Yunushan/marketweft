use crate::{
    history::{decimal, exact_utc},
    UniverseAction, UniverseBook, UniverseChange,
};
use std::{cmp::Ordering, collections::BTreeMap};

const MAX_PRICE_ROWS: usize = 20_000;
const MAX_PRICE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PriceObservation {
    pub observed_at: i64,
    pub ticks: i64,
}

/// Close prices indexed by immutable listing identity, price time and observation time.
#[derive(Clone, Debug)]
pub struct PriceBook<'a> {
    universe: &'a UniverseBook,
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
            let series = self.prices.get(&listing.listing_id);
            let price = |at| {
                let (&observed_at, &ticks) = series?.get(&at)?.range(..=known_at).next_back()?;
                Some(PriceObservation { observed_at, ticks })
            };
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
            row.return_units = Some((scaled.abs() + base / 2) / base * scaled.signum());
            previous = Some((current, base));
        }
        Ok(rows)
    }
}

impl ScreenRow<'_> {
    fn ratio(&self) -> Option<(i128, i128)> {
        Some((self.current?.ticks.into(), self.baseline?.ticks.into()))
    }
}

fn compare((a, b): (i128, i128), (c, d): (i128, i128)) -> Ordering {
    (a * d).cmp(&(c * b))
}
