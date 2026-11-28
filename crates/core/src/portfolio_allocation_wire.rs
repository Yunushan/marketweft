use crate::{parse_universe, PortfolioAllocationReport, PortfolioVarianceQuery, PriceBook};
use std::fmt::Write;

pub(crate) fn portfolio_allocation_report(
    input: &str,
    membership_bytes: usize,
    query: PortfolioVarianceQuery,
    maximum_weight: Option<u16>,
) -> Result<PortfolioAllocationReport, String> {
    let (listings, csvs) = input
        .split_once('\n')
        .ok_or("Supply portfolio listing IDs.")?;
    let listings: Vec<_> = listings.splitn(17, '\t').collect();
    let (membership, closes) = csvs
        .split_at_checked(membership_bytes)
        .ok_or("Supply both membership and price reports.")?;
    let universe = parse_universe(membership)?;
    let prices = PriceBook::parse(&universe, closes)?;
    match maximum_weight {
        Some(maximum) => prices.portfolio_allocation_with_limit(&listings, query, maximum),
        None => prices.portfolio_allocation(&listings, query),
    }
}

pub(crate) fn portfolio_allocation_rows(portfolio: &PortfolioAllocationReport) -> String {
    let mut text = format!(
        "{}\t{}\n",
        portfolio.expected_returns, portfolio.common_returns
    );
    if let Some(sample) = &portfolio.sample {
        writeln!(
            text,
            "{}\t{}\t{}\t{}\t{}\t{}",
            sample.equal.mean_return,
            sample.equal.volatility,
            sample.optimized.mean_return,
            sample.optimized.volatility,
            sample.variance_gap,
            sample.iterations
        )
        .unwrap();
    } else {
        text.push('\n');
    }
    for (index, listing) in portfolio.listings.iter().enumerate() {
        write!(text, "{}\t{}\t", listing.listing_id, listing.known_returns).unwrap();
        if let Some(sample) = &portfolio.sample {
            write!(
                text,
                "{}\t{}",
                sample.equal.weights_basis_points[index],
                sample.optimized.weights_basis_points[index]
            )
            .unwrap();
        } else {
            text.push('\t');
        }
        text.push('\n');
    }
    text
}
