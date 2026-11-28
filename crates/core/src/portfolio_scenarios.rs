use super::{relative::MembershipCursor, rounded_div, PortfolioVarianceQuery, PriceBook};
use crate::{
    history::valid_second,
    scenarios::{quantiles, SplitMix64},
    ScenarioConfig, ThreeQuantiles, UniverseAction, MAX_BARS, MAX_TICKS, SCALE,
};

const BPS: i128 = 10_000;
pub(super) const MAX_PORTFOLIO_LISTINGS: usize = 16;
const MAX_POSITION_EVALUATIONS: usize = 2_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScenarioAllocation<'a> {
    pub listing_id: &'a str,
    pub weight_basis_points: u16,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PortfolioScenarioConfig {
    pub from_at: i64,
    pub through_at: i64,
    pub known_at: i64,
    pub interval_seconds: u32,
    pub starting_value: i64,
    /// Fee on one-way turnover before reallocating net value to target weights.
    pub fee_basis_points: u16,
    pub scenario: ScenarioConfig,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PortfolioScenarioPath {
    pub ending_value: i128,
    /// Maximum peak-to-trough fraction in millionths.
    pub drawdown_millionths: i128,
    pub fees: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScenarioCoverage {
    pub listing_id: String,
    pub weight_basis_points: u16,
    pub known_returns: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PortfolioScenarioReport {
    pub config: PortfolioScenarioConfig,
    pub expected_vectors: usize,
    pub eligible_vectors: usize,
    pub block_size: usize,
    pub eligible_blocks: usize,
    pub listings: Vec<ScenarioCoverage>,
    pub ending_value: ThreeQuantiles,
    pub drawdown_millionths: ThreeQuantiles,
    pub fees: ThreeQuantiles,
    pub loss_paths: usize,
    pub paths: Vec<PortfolioScenarioPath>,
}

type PriceMove = (i64, i64);

pub(super) struct ReturnVector {
    step: usize,
    pub(super) moves: Vec<PriceMove>,
}

impl PriceBook<'_> {
    /// Resample whole historical return vectors and rebalance to fixed long-only weights.
    pub fn portfolio_scenarios(
        &self,
        allocations: &[ScenarioAllocation<'_>],
        config: PortfolioScenarioConfig,
    ) -> Result<PortfolioScenarioReport, String> {
        self.portfolio_scenarios_with_block_size(allocations, config, 1)
    }

    /// Resample overlapping blocks of consecutive, complete return vectors.
    /// Draw blocks with replacement and truncate the final block to the path horizon.
    pub fn portfolio_scenarios_with_block_size(
        &self,
        allocations: &[ScenarioAllocation<'_>],
        config: PortfolioScenarioConfig,
        block_size: usize,
    ) -> Result<PortfolioScenarioReport, String> {
        if !(2..=MAX_PORTFOLIO_LISTINGS).contains(&allocations.len())
            || allocations
                .iter()
                .any(|entry| entry.weight_basis_points == 0)
            || allocations
                .iter()
                .map(|entry| i128::from(entry.weight_basis_points))
                .sum::<i128>()
                != BPS
        {
            return Err(
                "Choose 2 to 16 listings with positive weights totaling 10,000 basis points."
                    .into(),
            );
        }
        let mut allocations = allocations.to_vec();
        allocations.sort_unstable_by_key(|entry| entry.listing_id);
        let ids = self.universe.listing_ids();
        if allocations
            .iter()
            .any(|entry| !ids.contains(entry.listing_id))
            || allocations
                .windows(2)
                .any(|pair| pair[0].listing_id == pair[1].listing_id)
        {
            return Err("Choose distinct listing IDs from the supplied universe.".into());
        }
        if ![config.from_at, config.through_at, config.known_at]
            .into_iter()
            .all(valid_second)
            || config.from_at >= config.through_at
            || config.interval_seconds == 0
        {
            return Err("Use valid ordered UTC cutoffs and a positive interval.".into());
        }
        let interval = i64::from(config.interval_seconds);
        let span = config.through_at - config.from_at;
        if span % interval != 0 || span / interval > MAX_BARS as i64 {
            return Err(
                "Use at most 100,000 intervals with the UTC end on the selected grid.".into(),
            );
        }
        if !(1..=MAX_TICKS).contains(&config.starting_value)
            || i128::from(config.fee_basis_points) > BPS
        {
            return Err("Use a positive starting value within range and a fee from 0 to 10,000 basis points.".into());
        }
        let ScenarioConfig {
            seed,
            paths,
            horizon,
        } = config.scenario;
        if !(1..=10_000).contains(&paths)
            || !(1..=1_000).contains(&horizon)
            || paths > MAX_POSITION_EVALUATIONS / horizon / allocations.len()
        {
            return Err("Supply 1 to 10,000 paths and 1 to 1,000 moves per path within two million position evaluations.".into());
        }
        if !(1..=horizon).contains(&block_size) {
            return Err("Choose a block size from one to the number of moves per path.".into());
        }

        let expected_vectors = (span / interval) as usize;
        let listing_ids: Vec<_> = allocations.iter().map(|entry| entry.listing_id).collect();
        let window = PortfolioVarianceQuery {
            from_at: config.from_at,
            through_at: config.through_at,
            known_at: config.known_at,
            interval_seconds: config.interval_seconds,
        };
        let (vectors, known) = self.historical_vectors(&listing_ids, window, expected_vectors);
        if vectors.is_empty() {
            return Err(
                "No interval has observed adjacent closes for every selected listing.".into(),
            );
        }
        let block_starts: Vec<_> = vectors
            .windows(block_size)
            .enumerate()
            .filter_map(|(index, block)| {
                (block[block_size - 1].step - block[0].step == block_size - 1).then_some(index)
            })
            .collect();
        if block_starts.is_empty() {
            return Err(
                "No complete return block of this size is visible at the selected cutoffs.".into(),
            );
        }
        let weights: Vec<_> = allocations
            .iter()
            .map(|entry| i128::from(entry.weight_basis_points))
            .collect();
        let mut random = SplitMix64::new(seed);
        let start = i128::from(config.starting_value);
        let starting_positions = allocate(start, &weights);
        let mut outcomes = Vec::with_capacity(paths);
        for _ in 0..paths {
            let mut positions = starting_positions.clone();
            let mut path = PortfolioScenarioPath {
                ending_value: start,
                drawdown_millionths: 0,
                fees: 0,
            };
            let mut peak = start;
            let samples = (0..horizon.div_ceil(block_size))
                .flat_map(|_| {
                    let start = block_starts[random.uniform_index(block_starts.len())];
                    &vectors[start..start + block_size]
                })
                .take(horizon);
            for sample in samples {
                for (value, &(before, after)) in positions.iter_mut().zip(&sample.moves) {
                    *value = rounded_div(*value * i128::from(after), i128::from(before));
                }
                let marked: i128 = positions.iter().sum();
                if marked > i128::from(MAX_TICKS) {
                    return Err(
                        "A simulated portfolio value exceeds the supported valuation range.".into(),
                    );
                }
                let target = allocate(marked, &weights);
                let turnover: i128 = positions
                    .iter()
                    .zip(&target)
                    .map(|(&value, &desired)| (desired - value).max(0))
                    .sum();
                let fee = rounded_div(turnover * i128::from(config.fee_basis_points), BPS);
                path.fees += fee;
                path.ending_value = marked - fee;
                positions = if fee == 0 {
                    target
                } else {
                    allocate(path.ending_value, &weights)
                };
                peak = peak.max(path.ending_value);
                path.drawdown_millionths = path.drawdown_millionths.max(rounded_div(
                    (peak - path.ending_value) * i128::from(SCALE),
                    peak,
                ));
            }
            outcomes.push(path);
        }
        Ok(PortfolioScenarioReport {
            config,
            expected_vectors,
            eligible_vectors: vectors.len(),
            block_size,
            eligible_blocks: block_starts.len(),
            listings: allocations
                .iter()
                .zip(known)
                .map(|(entry, known_returns)| ScenarioCoverage {
                    listing_id: entry.listing_id.to_owned(),
                    weight_basis_points: entry.weight_basis_points,
                    known_returns,
                })
                .collect(),
            ending_value: quantiles(&outcomes, |path| path.ending_value),
            drawdown_millionths: quantiles(&outcomes, |path| path.drawdown_millionths),
            fees: quantiles(&outcomes, |path| path.fees),
            loss_paths: outcomes
                .iter()
                .filter(|path| path.ending_value < start)
                .count(),
            paths: outcomes,
        })
    }

    pub(super) fn historical_vectors(
        &self,
        listing_ids: &[&str],
        config: PortfolioVarianceQuery,
        intervals: usize,
    ) -> (Vec<ReturnVector>, Vec<usize>) {
        let mut membership: Vec<_> = listing_ids
            .iter()
            .map(|_| MembershipCursor::new())
            .collect();
        for row in self
            .universe
            .visible_changes(config.through_at, config.known_at)
        {
            if let Ok(index) = listing_ids.binary_search(&row.listing_id.as_str()) {
                membership[index].add(row);
            }
        }
        let mut close = |index: usize, time| {
            if membership[index].through(time) == Some(UniverseAction::Add) {
                self.exact_close(listing_ids[index], time, config.known_at)
                    .map(|report| report.ticks)
            } else {
                None
            }
        };
        let mut previous: Vec<_> = (0..listing_ids.len())
            .map(|index| close(index, config.from_at))
            .collect();
        let mut vectors = Vec::new();
        let mut sample = Vec::with_capacity(listing_ids.len());
        let mut counts = vec![0; listing_ids.len()];
        let interval = i64::from(config.interval_seconds);
        for step in 1..=intervals {
            let time = config.from_at + step as i64 * interval;
            sample.clear();
            for (index, before) in previous.iter_mut().enumerate() {
                let current = close(index, time);
                if let Some(pair) = before.zip(current) {
                    counts[index] += 1;
                    sample.push(pair);
                }
                *before = current;
            }
            if sample.len() == listing_ids.len() {
                vectors.push(ReturnVector {
                    step,
                    moves: sample.clone(),
                });
            }
        }
        (vectors, counts)
    }
}

fn allocate(value: i128, weights: &[i128]) -> Vec<i128> {
    let mut positions: Vec<_> = weights.iter().map(|weight| value * weight / BPS).collect();
    let remainder = (value - positions.iter().sum::<i128>()) as usize;
    if remainder > 0 {
        let mut ranked: Vec<_> = weights.iter().enumerate().collect();
        ranked.sort_unstable_by_key(|&(index, weight)| {
            (std::cmp::Reverse(value * weight % BPS), index)
        });
        for (index, _) in ranked.into_iter().take(remainder) {
            positions[index] += 1;
        }
    }
    positions
}
