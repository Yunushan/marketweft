use marketweft_core::{
    parse_universe, PortfolioScenarioConfig, PortfolioScenarioPath, PortfolioVarianceQuery,
    PriceBook, ScenarioAllocation, ScenarioConfig, SCALE,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-listing-risk-membership.csv");
const PRICES: &str = include_str!("fixtures/synthetic-listing-risk-prices.csv");
const ALLOCATIONS: [ScenarioAllocation<'_>; 2] = [
    ScenarioAllocation {
        listing_id: "A",
        weight_basis_points: 5000,
    },
    ScenarioAllocation {
        listing_id: "B",
        weight_basis_points: 5000,
    },
];

fn config(from_at: i64, known_minutes: i64) -> PortfolioScenarioConfig {
    PortfolioScenarioConfig {
        from_at,
        through_at: from_at + 360,
        known_at: from_at + known_minutes * 60,
        interval_seconds: 60,
        starting_value: 100 * SCALE,
        fee_basis_points: 0,
        scenario: ScenarioConfig {
            seed: 9_007_199_254_740_993,
            paths: 10,
            horizon: 12,
        },
    }
}

#[test]
fn scenarios_sample_complete_vectors_and_preserve_cross_listing_dependence() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let prices = PriceBook::parse(&universe, PRICES).unwrap();
    let start = universe.checkpoints()[0];
    let run = |known| {
        prices
            .portfolio_scenarios(&ALLOCATIONS, config(start, known))
            .unwrap()
    };
    let early = run(6);
    assert_eq!(early.expected_vectors, 6);
    assert_eq!(early.eligible_vectors, 4);
    assert_eq!(
        early
            .listings
            .iter()
            .map(|row| row.known_returns)
            .collect::<Vec<_>>(),
        [6, 4]
    );
    for result in &early.paths {
        assert_eq!(result.ending_value, 100_000_000);
        assert_eq!(result.drawdown_millionths, 0);
    }
    let all = run(7);
    assert_eq!(all.eligible_vectors, 6);
    assert_eq!(all.ending_value.p05, 100_000_000);
    assert_eq!(all.ending_value.p95, 100_000_000);
    assert_eq!(all.loss_paths, 0);
    let removed = run(8);
    assert_eq!(removed.eligible_vectors, 4);
    assert_eq!(removed.listings[0].known_returns, 4);
    assert_eq!(removed.listings[1].known_returns, 6);
    assert_eq!(run(6), early);
    assert_eq!(
        prices
            .portfolio_scenarios(&[ALLOCATIONS[1], ALLOCATIONS[0]], config(start, 7))
            .unwrap(),
        all
    );
    assert!(prices
        .portfolio_scenarios(&ALLOCATIONS, config(start, 0))
        .is_err());
}

#[test]
fn turnover_fees_reduce_net_value_by_the_exact_rebalancing_charge() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let prices = PriceBook::parse(&universe, PRICES).unwrap();
    let start = universe.checkpoints()[0];
    let mut fixed = config(start, 1);
    fixed.through_at = start + 60;
    fixed.scenario.horizon = 1;
    fixed.fee_basis_points = 100;
    let report = prices.portfolio_scenarios(&ALLOCATIONS, fixed).unwrap();
    assert_eq!(report.eligible_vectors, 1);
    assert_eq!(report.loss_paths, fixed.scenario.paths);
    for path in &report.paths {
        assert_eq!(path.ending_value, 99_950_000);
        assert_eq!(path.fees, 50_000);
        assert_eq!(path.drawdown_millionths, 500);
    }
    let duplicate = [ALLOCATIONS[0], ALLOCATIONS[0]];
    assert!(prices.portfolio_scenarios(&duplicate, fixed).is_err());
    let mut unequal = ALLOCATIONS;
    unequal[1].weight_basis_points = 4999;
    assert!(prices.portfolio_scenarios(&unequal, fixed).is_err());
}

#[test]
fn a_third_listing_joins_only_when_its_own_adjacent_closes_are_known() {
    let reports = format!(
        "{MEMBERSHIP}RISK,C-ADD,C,DEMO:GAMMA,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,add\n"
    );
    let universe = parse_universe(&reports).unwrap();
    let closes = format!(
        "{PRICES}{}{}{}",
        "RISK,C,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,10\n",
        "RISK,C,2025-06-02T14:01:00Z,2025-06-02T14:01:00Z,10\n",
        "RISK,C,2025-06-02T14:02:00Z,2025-06-02T14:07:00Z,10\n"
    );
    let book = PriceBook::parse(&universe, &closes).unwrap();
    let start = universe.checkpoints()[0];
    let allocations = [
        ScenarioAllocation {
            listing_id: "A",
            weight_basis_points: 4000,
        },
        ScenarioAllocation {
            listing_id: "B",
            weight_basis_points: 4000,
        },
        ScenarioAllocation {
            listing_id: "C",
            weight_basis_points: 2000,
        },
    ];
    let early = book
        .portfolio_scenarios(&allocations, config(start, 6))
        .unwrap();
    let late = book
        .portfolio_scenarios(&allocations, config(start, 7))
        .unwrap();
    assert_eq!((early.eligible_vectors, late.eligible_vectors), (1, 2));
    assert_eq!(
        (
            early.listings[2].known_returns,
            late.listings[2].known_returns
        ),
        (1, 2)
    );
    assert!(late
        .paths
        .iter()
        .all(|path| path.ending_value == 100_000_000));
}

#[test]
fn moving_blocks_do_not_bridge_missing_closes_or_known_removals() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let book = PriceBook::parse(&universe, PRICES).unwrap();
    let start = universe.checkpoints()[0];
    let run = |known, size| {
        book.portfolio_scenarios_with_block_size(&ALLOCATIONS, config(start, known), size)
    };
    assert_eq!(
        run(6, 1).unwrap(),
        book.portfolio_scenarios(&ALLOCATIONS, config(start, 6))
            .unwrap()
    );
    let early = run(6, 2).unwrap();
    assert_eq!(
        (
            early.eligible_vectors,
            early.block_size,
            early.eligible_blocks
        ),
        (4, 2, 2)
    );
    assert_eq!(run(7, 2).unwrap().eligible_blocks, 5);
    assert_eq!(run(8, 2).unwrap().eligible_blocks, 3);
    assert_eq!(run(6, 2).unwrap(), early);
    assert!(run(6, 4).unwrap_err().contains("No complete return block"));
    assert_eq!(run(7, 4).unwrap().eligible_blocks, 3);
    assert!(run(6, 0).is_err());
    assert!(run(6, 13).is_err());
}

#[test]
fn a_single_available_block_replays_in_order_and_truncates_at_the_horizon() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let revised = PRICES
        .replace(
            "14:04:00Z,2025-06-02T14:04:00Z,121",
            "14:04:00Z,2025-06-02T14:04:00Z,242",
        )
        .replace(
            "14:04:00Z,2025-06-02T14:04:00Z,81",
            "14:04:00Z,2025-06-02T14:04:00Z,162",
        );
    let book = PriceBook::parse(&universe, &revised).unwrap();
    let mut query = config(universe.checkpoints()[0], 6);
    query.fee_basis_points = 100;
    query.scenario.horizon = 4;
    let report = book
        .portfolio_scenarios_with_block_size(&ALLOCATIONS, query, 3)
        .unwrap();
    assert_eq!(report.eligible_blocks, 1);
    assert!(report.paths.iter().all(|path| *path
        == PortfolioScenarioPath {
            ending_value: 199_900_000,
            drawdown_millionths: 500_250,
            fees: 50_000,
        }));
}

#[test]
fn allocation_uses_only_returns_common_to_every_listing_and_preserves_coverage_on_rewind() {
    let reports = format!(
        "{MEMBERSHIP}RISK,C-ADD,C,DEMO:GAMMA,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,add\n"
    );
    let universe = parse_universe(&reports).unwrap();
    let closes = format!(
        "{PRICES}{}{}{}",
        "RISK,C,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,10\n",
        "RISK,C,2025-06-02T14:01:00Z,2025-06-02T14:01:00Z,10\n",
        "RISK,C,2025-06-02T14:02:00Z,2025-06-02T14:07:00Z,10\n"
    );
    let book = PriceBook::parse(&universe, &closes).unwrap();
    let start = universe.checkpoints()[0];
    let query = |known: i64| PortfolioVarianceQuery {
        from_at: start,
        through_at: start + 360,
        known_at: start + known * 60,
        interval_seconds: 60,
    };
    let early = book
        .portfolio_allocation(&["B", "C", "A"], query(6))
        .unwrap();
    assert_eq!((early.expected_returns, early.common_returns), (6, 1));
    assert_eq!(
        early
            .listings
            .iter()
            .map(|row| (row.listing_id.as_str(), row.known_returns))
            .collect::<Vec<_>>(),
        [("A", 6), ("B", 4), ("C", 1)]
    );
    assert!(early.sample.is_none());
    let whole = book
        .portfolio_allocation(&["C", "A", "B"], query(7))
        .unwrap();
    assert_eq!(whole.common_returns, 2);
    let sample = whole.sample.unwrap();
    assert!(sample.optimized.volatility <= sample.equal.volatility);
    assert_eq!(
        sample.optimized.weights_basis_points.iter().sum::<u16>(),
        10_000
    );
    assert_eq!(
        book.portfolio_allocation(&["A", "B", "C"], query(6))
            .unwrap(),
        early
    );
    assert!(book
        .portfolio_allocation(&["A", "B", "A"], query(7))
        .is_err());
    assert!(book
        .portfolio_allocation(&["A", "B", "UNKNOWN"], query(7))
        .is_err());
}

#[test]
fn native_allocation_protocol_echoes_cutoffs_and_rejects_bad_boundaries() {
    use marketweft_core::research::portfolio_allocation_request;
    let request = |version, membership_len, ids: &str| {
        format!("marketweft-portfolio-allocation\t{version}\t{membership_len}\n\
            2025-06-02T14:00:00Z\n2025-06-02T14:06:00Z\n2025-06-02T14:06:00Z\n60\n{ids}\n{MEMBERSHIP}{PRICES}")
    };
    let valid = request(1, MEMBERSHIP.len(), "B\tA");
    let result = portfolio_allocation_request(valid.as_bytes()).unwrap();
    let lines: Vec<_> = result.lines().collect();
    assert_eq!(lines.len(), 6);
    assert_eq!(lines[0], "marketweft-portfolio-allocation\t1\t2");
    assert_eq!(lines[1], "T\t1748872800\t1748873160\t1748873160\t60");
    assert_eq!(lines[2], "6\t4");
    assert_eq!(lines[4..], ["A\t6\t5000\t5000", "B\t4\t5000\t5000"]);
    assert!(portfolio_allocation_request(request(2, MEMBERSHIP.len(), "A\tB").as_bytes()).is_err());
    assert!(portfolio_allocation_request(request(1, usize::MAX, "A\tB").as_bytes()).is_err());
    assert!(portfolio_allocation_request(request(1, MEMBERSHIP.len(), "A\tA").as_bytes()).is_err());
    assert!(portfolio_allocation_request(valid.replace("60\nB", "70\nB").as_bytes()).is_err());
}
