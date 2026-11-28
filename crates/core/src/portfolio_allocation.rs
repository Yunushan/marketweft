use super::{portfolio_scenarios::MAX_PORTFOLIO_LISTINGS, PortfolioVarianceQuery, PriceBook};
use crate::{history::valid_second, MAX_BARS};

const BASIS_POINTS: u16 = 10_000;
const MAX_ITERATIONS: u32 = 20_000;
const NORMALIZED_GAP: f64 = 1e-12;

#[derive(Clone, Debug, PartialEq)]
pub struct PortfolioAllocationListing {
    pub listing_id: String,
    pub known_returns: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct HistoricalAllocation {
    pub weights_basis_points: Vec<u16>,
    pub mean_return: f64,
    pub volatility: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PortfolioAllocationSample {
    pub equal: HistoricalAllocation,
    pub optimized: HistoricalAllocation,
    /// Estimated distance from the continuous minimum in squared fractional return units.
    pub variance_gap: f64,
    pub iterations: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PortfolioAllocationReport {
    pub expected_returns: usize,
    pub common_returns: usize,
    pub listings: Vec<PortfolioAllocationListing>,
    pub sample: Option<PortfolioAllocationSample>,
}

impl PriceBook<'_> {
    /// Estimate long-only minimum sample variance for two to sixteen listings
    /// using only return intervals present for the entire selected portfolio.
    pub fn portfolio_allocation(
        &self,
        listing_ids: &[&str],
        query: PortfolioVarianceQuery,
    ) -> Result<PortfolioAllocationReport, String> {
        if !(2..=MAX_PORTFOLIO_LISTINGS).contains(&listing_ids.len()) {
            return Err("Choose 2 to 16 listings for the portfolio.".into());
        }
        let mut listing_ids = listing_ids.to_vec();
        listing_ids.sort_unstable();
        let available = self.universe.listing_ids();
        if listing_ids.windows(2).any(|pair| pair[0] == pair[1])
            || listing_ids
                .iter()
                .any(|listing| !available.contains(listing))
        {
            return Err("Choose distinct listing IDs from the supplied universe.".into());
        }
        let PortfolioVarianceQuery {
            from_at,
            through_at,
            known_at,
            interval_seconds,
        } = query;
        if ![from_at, through_at, known_at]
            .into_iter()
            .all(valid_second)
            || from_at > through_at
            || interval_seconds == 0
        {
            return Err("Use valid ordered UTC cutoffs and a positive interval.".into());
        }
        let interval = i64::from(interval_seconds);
        let span = through_at - from_at;
        if span % interval != 0 || span / interval > MAX_BARS as i64 {
            return Err(
                "Use at most 100,000 intervals with the UTC end on the selected grid.".into(),
            );
        }
        let expected_returns = (span / interval) as usize;
        let (vectors, counts) = self.historical_vectors(&listing_ids, query, expected_returns);
        let common_returns = vectors.len();
        let sample = (common_returns >= 2).then(|| {
            let returns: Vec<Vec<f64>> = vectors
                .into_iter()
                .map(|vector| {
                    vector
                        .moves
                        .into_iter()
                        .map(|(before, after)| (after - before) as f64 / before as f64)
                        .collect()
                })
                .collect();
            estimate(&returns, listing_ids.len())
        });
        let listings = listing_ids
            .into_iter()
            .zip(counts)
            .map(|(listing_id, known_returns)| PortfolioAllocationListing {
                listing_id: listing_id.to_owned(),
                known_returns,
            })
            .collect();
        Ok(PortfolioAllocationReport {
            expected_returns,
            common_returns,
            listings,
            sample,
        })
    }
}

fn dot(left: &[f64], right: &[f64]) -> f64 {
    left.iter()
        .zip(right)
        .map(|(&left, &right)| left * right)
        .sum()
}

fn covariance(returns: &[Vec<f64>], mean: &[f64]) -> Vec<Vec<f64>> {
    let mut matrix = vec![vec![0.0; mean.len()]; mean.len()];
    let n = (returns.len() - 1) as f64;
    for values in returns {
        let centered: Vec<_> = values
            .iter()
            .zip(mean)
            .map(|(value, mean)| value - mean)
            .collect();
        for (row, &left) in matrix.iter_mut().zip(&centered) {
            for (product, &right) in row.iter_mut().zip(&centered) {
                *product += left * right;
            }
        }
    }
    for value in matrix.iter_mut().flatten() {
        *value /= n;
    }
    matrix
}

fn rounded_weights(weights: &[f64]) -> Vec<u16> {
    let scale = f64::from(BASIS_POINTS) / weights.iter().sum::<f64>();
    let scaled: Vec<_> = weights.iter().map(|weight| weight * scale).collect();
    let mut basis: Vec<_> = scaled.iter().map(|weight| weight.floor() as u16).collect();
    let shortfall = BASIS_POINTS - basis.iter().sum::<u16>();
    let mut indices: Vec<_> = (0..weights.len()).collect();
    indices.sort_by(|&left, &right| {
        scaled[right]
            .fract()
            .total_cmp(&scaled[left].fract())
            .then(left.cmp(&right))
    });
    for index in indices.into_iter().take(usize::from(shortfall)) {
        basis[index] += 1;
    }
    basis
}

fn optimize(matrix: &[Vec<f64>], mut weights: Vec<f64>) -> (Vec<f64>, f64, u32) {
    let mut iterations = 0;
    loop {
        let grad: Vec<_> = matrix.iter().map(|row| dot(row, &weights)).collect();
        let incoming = (0..weights.len())
            .min_by(|&left, &right| grad[left].total_cmp(&grad[right]))
            .expect("at least two listings");
        let variance = dot(&grad, &weights);
        let gap = (variance - grad[incoming]).max(0.0);
        // The tangent to a convex variance function is a lower bound on the simplex.
        if gap <= NORMALIZED_GAP || iterations == MAX_ITERATIONS {
            return (weights, (variance - 2.0 * gap).max(0.0), iterations);
        }
        let outgoing = (0..weights.len())
            .filter(|&index| weights[index] > 0.0)
            .max_by(|&left, &right| grad[left].total_cmp(&grad[right]))
            .expect("some portfolio weight is positive");
        let curvature = matrix[incoming][incoming] + matrix[outgoing][outgoing]
            - 2.0 * matrix[incoming][outgoing];
        let transfer = if curvature > 0.0 {
            ((grad[outgoing] - grad[incoming]) / curvature).min(weights[outgoing])
        } else {
            weights[outgoing]
        };
        weights[incoming] += transfer;
        weights[outgoing] -= transfer;
        iterations += 1;
    }
}

fn history(weights_basis_points: Vec<u16>, returns: &[Vec<f64>]) -> HistoricalAllocation {
    let weights: Vec<_> = weights_basis_points
        .iter()
        .map(|&weight| f64::from(weight) / f64::from(BASIS_POINTS))
        .collect();
    let initial = dot(&weights, &returns[0]);
    let mean_return = initial
        + returns
            .iter()
            .map(|values| dot(&weights, values) - initial)
            .sum::<f64>()
            / returns.len() as f64;
    let squared: f64 = returns
        .iter()
        .map(|values| (dot(&weights, values) - mean_return).powi(2))
        .sum();
    let volatility = (squared / (returns.len() - 1) as f64).sqrt();
    HistoricalAllocation {
        weights_basis_points,
        mean_return,
        volatility,
    }
}

fn estimate(returns: &[Vec<f64>], count: usize) -> PortfolioAllocationSample {
    let mean: Vec<_> = (0..count)
        .map(|index| {
            let initial = returns[0][index];
            initial
                + returns.iter().map(|row| row[index] - initial).sum::<f64>() / returns.len() as f64
        })
        .collect();
    let equal_weights = vec![1.0 / count as f64; count];
    let equal = history(rounded_weights(&equal_weights), returns);
    let mut matrix = covariance(returns, &mean);
    let scale = (0..count)
        .map(|index| matrix[index][index])
        .fold(0.0, f64::max);
    if scale == 0.0 {
        return PortfolioAllocationSample {
            optimized: equal.clone(),
            equal,
            variance_gap: 0.0,
            iterations: 0,
        };
    }
    for value in matrix.iter_mut().flatten() {
        *value /= scale;
    }
    let (weights, lower_bound, iterations) = optimize(&matrix, equal_weights);
    let mut optimized = history(rounded_weights(&weights), returns);
    if optimized.volatility > equal.volatility {
        optimized = equal.clone();
    }
    let variance_gap = (optimized.volatility.powi(2) - lower_bound * scale).max(0.0);
    PortfolioAllocationSample {
        equal,
        optimized,
        variance_gap,
        iterations,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minimizes_diagonal_sample_variance_in_inverse_variance_proportions() {
        let signs = [-1.0, 1.0];
        let mut returns = Vec::new();
        for left in signs {
            for middle in signs {
                for right in signs {
                    returns.push(vec![0.1 * left, 0.2 * middle, 0.4 * right]);
                }
            }
        }
        let sample = estimate(&returns, 3);
        assert_eq!(sample.optimized.weights_basis_points, [7619, 1905, 476]);
        assert!(sample.optimized.volatility < sample.equal.volatility);
        assert!(sample.optimized.mean_return.abs() < 1e-15);
        assert!(sample.variance_gap < 1e-9);
        assert!(sample.iterations < MAX_ITERATIONS);
    }

    #[test]
    fn supports_sixteen_listings_and_maintains_the_full_basis_point_total() {
        let count = MAX_PORTFOLIO_LISTINGS;
        let mut returns = Vec::with_capacity(count * 2);
        for listing in 0..count {
            for change in [-0.125, 0.125] {
                let mut row = vec![0.0; count];
                row[listing] = change;
                returns.push(row);
            }
        }
        let sample = estimate(&returns, count);
        assert_eq!(sample.optimized.weights_basis_points, vec![625; count]);
        assert_eq!(
            sample.optimized.weights_basis_points.iter().sum::<u16>(),
            10_000
        );
        assert!(sample.variance_gap < 1e-15);
    }

    #[test]
    fn preserves_flat_and_boundary_solutions_without_artificial_volatility() {
        let flat = estimate(&[vec![0.1, -0.2, 0.3], vec![0.1, -0.2, 0.3]], 3);
        assert_eq!(flat.optimized.weights_basis_points, [3334, 3333, 3333]);
        assert_eq!(flat.optimized.volatility, 0.0);
        assert_eq!(flat.variance_gap, 0.0);
        let corner = estimate(
            &[
                vec![0.1, 0.2, 0.0],
                vec![-0.1, 0.2, 0.0],
                vec![0.1, -0.2, 0.0],
                vec![-0.1, -0.2, 0.0],
            ],
            3,
        );
        assert_eq!(corner.optimized.weights_basis_points, [0, 0, 10_000]);
        assert_eq!(corner.optimized.volatility, 0.0);
    }
}
