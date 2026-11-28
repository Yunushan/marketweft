use crate::{
    history::{decimal, exact_utc},
    parse_universe, PortfolioScenarioConfig, PortfolioScenarioReport, PriceBook,
    ScenarioAllocation, ScenarioConfig,
};
use std::fmt::Write;

pub(crate) fn portfolio_scenario_report(
    input: &str,
    membership_bytes: usize,
) -> Result<PortfolioScenarioReport, String> {
    let mut inputs = input.splitn(4, '\n');
    let mut cutoffs = [0; 3];
    for cutoff in &mut cutoffs {
        *cutoff = inputs
            .next()
            .and_then(exact_utc)
            .ok_or("Screen times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")?;
    }
    let [from_at, through_at, known_at] = cutoffs;
    let rest = inputs.next().ok_or("Supply the universe CSV reports.")?;
    let mut fields = rest.splitn(8, '\n');
    let [Some(interval), Some(value), Some(fee), Some(seed), Some(paths), Some(horizon), Some(weights), Some(csvs)] =
        std::array::from_fn(|_| fields.next())
    else {
        return Err("Supply portfolio settings, weights, membership and price reports.".into());
    };
    let interval_seconds = interval
        .parse::<u32>()
        .map_err(|_| "Use a positive price interval.")?;
    let starting_value =
        decimal(value).ok_or("Use a starting value with up to six fractional digits.")?;
    let fee_basis_points = fee
        .parse::<u16>()
        .map_err(|_| "Use a whole fee in basis points.")?;
    let (horizon, block_size) = horizon.split_once(':').unwrap_or((horizon, "1"));
    let block_size = block_size
        .parse()
        .map_err(|_| "Use a whole number of moves per block.")?;
    let scenario = ScenarioConfig {
        seed: seed.parse().map_err(|_| "Use an unsigned 64-bit seed.")?,
        paths: paths
            .parse()
            .map_err(|_| "Use a whole number of scenario paths.")?,
        horizon: horizon
            .parse()
            .map_err(|_| "Use a whole number of moves per path.")?,
    };
    let mut allocations = Vec::new();
    for entry in weights.split('\t') {
        if allocations.len() == 16 {
            return Err("Choose at most 16 scenario listings.".into());
        }
        let (listing_id, weight) = entry
            .split_once('=')
            .ok_or("Supply listing weights in basis points.")?;
        let weight_basis_points = weight
            .parse()
            .map_err(|_| "Use whole listing weights in basis points.")?;
        allocations.push(ScenarioAllocation {
            listing_id,
            weight_basis_points,
        });
    }
    let (membership, closes) = csvs
        .split_at_checked(membership_bytes)
        .ok_or("Supply both membership and price reports.")?;
    let universe = parse_universe(membership)?;
    let prices = PriceBook::parse(&universe, closes)?;
    prices.portfolio_scenarios_with_block_size(
        &allocations,
        PortfolioScenarioConfig {
            from_at,
            through_at,
            known_at,
            interval_seconds,
            starting_value,
            fee_basis_points,
            scenario,
        },
        block_size,
    )
}

pub(crate) fn portfolio_scenario_rows(result: &PortfolioScenarioReport) -> String {
    let mut text = String::new();
    write!(
        &mut text,
        "H\t{}\t{}\t{}",
        result.expected_vectors, result.eligible_vectors, result.loss_paths
    )
    .unwrap();
    if result.block_size > 1 {
        write!(
            &mut text,
            "\t{}\t{}",
            result.block_size, result.eligible_blocks
        )
        .unwrap();
    }
    text.push('\n');
    for listing in &result.listings {
        writeln!(
            &mut text,
            "A\t{}\t{}\t{}",
            listing.listing_id, listing.weight_basis_points, listing.known_returns
        )
        .unwrap();
    }
    for (tag, values) in [
        ('V', result.ending_value),
        ('D', result.drawdown_millionths),
        ('F', result.fees),
    ] {
        writeln!(
            &mut text,
            "{tag}\t{}\t{}\t{}",
            values.p05, values.p50, values.p95
        )
        .unwrap();
    }
    for path in &result.paths {
        writeln!(
            &mut text,
            "P\t{}\t{}\t{}",
            path.ending_value, path.drawdown_millionths, path.fees
        )
        .unwrap();
    }
    text
}
