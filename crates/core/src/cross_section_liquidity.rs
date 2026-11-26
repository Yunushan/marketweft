use crate::{
    history::{decimal, exact_utc},
    paper::MAX_SHARES,
    UniverseBook,
};

const MAX_ROWS: usize = 20_000;
const MAX_BYTES: usize = 2 * 1024 * 1024;
const HEADER: &str = "universe,listing_id,price_at,observed_at,sequence,price,shares";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplayLiquidity {
    pub listing_id: String,
    pub price_at: i64,
    pub observed_at: i64,
    pub sequence: u64,
    pub price: i64,
    pub shares: u64,
}

/// Captured whole-share capacity in observation order.
pub struct LiquidityTape {
    universe: String,
    rows: Vec<ReplayLiquidity>,
}

impl LiquidityTape {
    pub fn parse(universe: &UniverseBook, csv: &str) -> Result<Self, String> {
        if csv.len() > MAX_BYTES {
            return Err("Paper liquidity CSV exceeds 2 MiB.".into());
        }
        let mut records = csv
            .trim_start_matches('\u{feff}')
            .lines()
            .enumerate()
            .filter(|(_, row)| !row.trim().is_empty());
        if records.next().map(|(_, row)| row.trim()) != Some(HEADER) {
            return Err(format!("Expected liquidity CSV header {HEADER}."));
        }
        let ids = universe.listing_ids();
        let mut rows: Vec<ReplayLiquidity> = Vec::new();
        for (index, row) in records {
            let error = |message: &str| format!("Liquidity line {}: {message}", index + 1);
            if rows.len() == MAX_ROWS {
                return Err(error("Supply at most 20,000 liquidity observations."));
            }
            let mut columns = row.split(',').map(str::trim);
            let [Some(name), Some(listing), Some(effective), Some(known), Some(sequence), Some(price), Some(shares)] =
                std::array::from_fn(|_| columns.next())
            else {
                return Err(error("Expected exactly seven fields."));
            };
            if columns.next().is_some() {
                return Err(error("Expected exactly seven fields."));
            }
            if name != universe.name() || !ids.contains(listing) {
                return Err(error(
                    "Use the membership universe and one of its listing IDs.",
                ));
            }
            let price_at =
                exact_utc(effective).ok_or_else(|| error("Use an exact UTC price time."))?;
            let observed_at =
                exact_utc(known).ok_or_else(|| error("Use an exact UTC observation time."))?;
            if observed_at < price_at {
                return Err(error("Observation time precedes the price time."));
            }
            let sequence = sequence
                .parse::<u64>()
                .ok()
                .filter(|value| *value > 0)
                .ok_or_else(|| error("Use a positive capture sequence."))?;
            if rows.last().is_some_and(|previous| {
                previous.sequence >= sequence || previous.observed_at > observed_at
            }) {
                return Err(error(
                    "Capture sequences must increase and observation times must not decrease.",
                ));
            }
            let price = decimal(price).filter(|value| *value > 0).ok_or_else(|| {
                error("Use a positive execution price with up to six fractional places.")
            })?;
            let shares = shares
                .parse::<u64>()
                .ok()
                .filter(|value| (1..=MAX_SHARES).contains(value))
                .ok_or_else(|| {
                    error("Use positive whole-share capacity within the paper position limit.")
                })?;
            rows.push(ReplayLiquidity {
                listing_id: listing.to_owned(),
                price_at,
                observed_at,
                sequence,
                price,
                shares,
            });
        }
        Ok(Self {
            universe: universe.name().to_owned(),
            rows,
        })
    }

    pub(crate) fn universe_name(&self) -> &str {
        &self.universe
    }

    pub fn through(&self, known_at: i64) -> &[ReplayLiquidity] {
        &self.rows[..self.rows.partition_point(|row| row.observed_at <= known_at)]
    }
}
