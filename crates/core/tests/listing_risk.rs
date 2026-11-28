use marketweft_core::{parse_universe, ListingRiskQuery, PortfolioVarianceQuery, PriceBook};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-listing-risk-membership.csv");
const PRICES: &str = include_str!("fixtures/synthetic-listing-risk-prices.csv");

fn constant_left() -> String {
    PRICES
        .lines()
        .map(|line| {
            if line.starts_with("RISK,A,") {
                format!("{},100", line.rsplit_once(',').unwrap().0)
            } else {
                line.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn risk_counts_exact_adjacent_closes_and_never_bridges_a_missing_slot() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let prices = PriceBook::parse(&universe, PRICES).unwrap();
    let from_at = universe.checkpoints()[0];
    let set = |known_minute: i64| ListingRiskQuery {
        from_at,
        through_at: from_at + 360,
        known_at: from_at + known_minute * 60,
        interval_seconds: 60,
        window_periods: 3,
        volatility_periods: 1,
    };
    let run = |known| prices.listing_risk("A", "B", set(known)).unwrap();

    let missing = run(6);
    assert_eq!(missing.len(), 4);
    assert_eq!(
        (missing[0].from_at, missing[0].through_at),
        (from_at, from_at + 180)
    );
    assert_eq!(
        missing
            .iter()
            .map(|row| (row.left_returns, row.right_returns, row.paired_returns))
            .collect::<Vec<_>>(),
        [(3, 1, 1), (3, 1, 1), (3, 2, 2), (3, 3, 3)]
    );
    assert_eq!(missing[0].expected_returns, 3);
    assert_eq!(missing[0].right_volatility, None);
    assert_eq!(missing[0].correlation, None);

    let observed = run(7);
    let expected = 0.1 / 3.0_f64.sqrt();
    for point in &observed {
        assert_eq!((point.paired_returns, point.expected_returns), (3, 3));
        assert!((point.left_volatility.unwrap() - expected).abs() < 1e-14);
        assert!((point.right_volatility.unwrap() - expected).abs() < 1e-14);
        assert!((point.correlation.unwrap() + 1.0).abs() < 1e-14);
    }
    assert_eq!(run(6), missing);

    let removed = run(8);
    assert_eq!(removed.last().unwrap().left_returns, 1);
    assert_eq!(removed.last().unwrap().paired_returns, 1);
    assert_eq!(removed.last().unwrap().correlation, None);
    assert_eq!(removed.last().unwrap().left_volatility, None);
    assert_eq!(
        removed.last().unwrap().right_volatility,
        observed.last().unwrap().right_volatility
    );
    let scaled = prices
        .listing_risk(
            "A",
            "B",
            ListingRiskQuery {
                volatility_periods: 252,
                ..set(7)
            },
        )
        .unwrap();
    assert!((scaled[0].left_volatility.unwrap() - expected * 252.0_f64.sqrt()).abs() < 1e-13);
}

#[test]
fn constant_returns_have_zero_volatility_and_undefined_correlation() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let prices = PriceBook::parse(&universe, &constant_left()).unwrap();
    let start = universe.checkpoints()[0];
    let query = ListingRiskQuery {
        from_at: start,
        through_at: start + 360,
        known_at: start + 420,
        interval_seconds: 60,
        window_periods: 2,
        volatility_periods: 1,
    };
    let rows = prices.listing_risk("A", "B", query).unwrap();
    assert_eq!(rows.len(), 5);
    assert!(rows
        .iter()
        .all(|row| row.left_volatility == Some(0.0) && row.correlation.is_none()));
    assert!(prices.listing_risk("A", "A", query).is_err());
    assert!(prices
        .listing_risk(
            "A",
            "B",
            ListingRiskQuery {
                through_at: start + 359,
                ..query
            }
        )
        .is_err());
    assert!(prices
        .listing_risk(
            "A",
            "B",
            ListingRiskQuery {
                through_at: start + 100_001,
                interval_seconds: 1,
                ..query
            }
        )
        .is_err());
}

#[test]
fn downside_counts_only_observed_losses_and_rewinds_at_knowledge_cutoffs() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let prices = PriceBook::parse(&universe, PRICES).unwrap();
    let start = universe.checkpoints()[0];
    let query = |minute: i64, volatility_periods| ListingRiskQuery {
        from_at: start,
        through_at: start + 360,
        known_at: start + minute * 60,
        interval_seconds: 60,
        window_periods: 3,
        volatility_periods,
    };
    let run = |minute, scale| {
        prices
            .listing_downside_risk("A", "B", query(minute, scale))
            .unwrap()
    };

    let missing = run(0, 1);
    assert!(missing.iter().all(|row| {
        row.left_loss_returns == 0
            && row.right_loss_returns == 0
            && row.left_downside.is_none()
            && row.right_downside.is_none()
    }));
    let early = run(6, 1);
    assert_eq!(
        (early[0].risk.left_returns, early[0].risk.right_returns),
        (3, 1)
    );
    assert_eq!(
        (early[0].left_loss_returns, early[0].right_loss_returns),
        (0, 1)
    );
    assert_eq!(early[0].left_downside, Some(0.0));
    assert!((early[0].right_downside.unwrap() - 0.1).abs() < 1e-14);
    let observed = run(7, 1);
    assert_eq!(
        (
            observed[0].risk.right_returns,
            observed[0].right_loss_returns
        ),
        (3, 2)
    );
    let expected = 0.1 * (2.0_f64 / 3.0).sqrt();
    assert!((observed[0].right_downside.unwrap() - expected).abs() < 1e-14);
    assert!((run(7, 4)[0].right_downside.unwrap() - 2.0 * expected).abs() < 1e-14);
    let removed = run(8, 1);
    assert_eq!(removed[3].risk.left_returns, 1);
    assert_eq!(removed[3].left_downside, Some(0.0));
    assert_eq!(run(6, 1), early);
    assert_eq!(
        observed.iter().map(|row| row.risk).collect::<Vec<_>>(),
        prices.listing_risk("A", "B", query(7, 1)).unwrap()
    );
}

#[test]
fn downside_wire_echoes_cutoffs_and_rejects_invalid_versions_lengths_and_windows() {
    use marketweft_core::research::{
        listing_downside_risk_request, MAX_LISTING_RISK_REQUEST_BYTES,
    };
    let at = |known: u8| {
        format!(
            "marketweft-listing-downside-risk\t1\t{}\n2025-06-02T14:00:00Z\n2025-06-02T14:06:00Z\n2025-06-02T14:0{known}:00Z\nA\tB\n60\t3\t1\n{MEMBERSHIP}{PRICES}",
            MEMBERSHIP.len(),
        )
    };
    let original = at(6);
    let early = listing_downside_risk_request(original.as_bytes()).unwrap();
    let mut lines = early.lines();
    assert_eq!(lines.next(), Some("marketweft-listing-downside-risk\t1\t4"));
    assert_eq!(
        lines.next(),
        Some("H\t1748872800\t1748873160\t1748873160\tA\tB\t60\t3\t1")
    );
    let row: Vec<_> = lines.next().unwrap().split('\t').collect();
    assert_eq!(
        &row[..9],
        &[
            "R",
            "1748872800",
            "1748872980",
            "3",
            "3",
            "1",
            "1",
            "0",
            "1"
        ]
    );
    assert_eq!(&row[10..13], &["", "", "0"]);
    assert!((row[13].parse::<f64>().unwrap() - 0.1).abs() < 1e-14);
    assert_ne!(
        listing_downside_risk_request(at(7).as_bytes()).unwrap(),
        early
    );
    assert_eq!(
        listing_downside_risk_request(original.as_bytes()).unwrap(),
        early
    );
    for invalid in [
        original.replacen("\t1\t", "\t2\t", 1),
        original.replacen(&format!("\t{}\n", MEMBERSHIP.len()), "\t0\n", 1),
        original.replacen("\n60\t3\t1\n", "\n70\t3\t1\n", 1),
        original.replacen("\nA\tB\n", "\nA\tA\n", 1),
    ] {
        assert!(listing_downside_risk_request(invalid.as_bytes()).is_err());
    }
    assert!(
        listing_downside_risk_request(&vec![b'A'; MAX_LISTING_RISK_REQUEST_BYTES + 1]).is_err()
    );
}

#[test]
fn portfolio_variance_uses_common_return_coverage_and_never_fills_an_unseen_price() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let prices = PriceBook::parse(&universe, PRICES).unwrap();
    let base = universe.checkpoints()[0];
    let query = |through: i64, known: i64| PortfolioVarianceQuery {
        from_at: base,
        through_at: base + through * 60,
        known_at: base + known * 60,
        interval_seconds: 60,
    };
    let at = |through, known| {
        prices
            .portfolio_variance("A", "B", query(through, known))
            .unwrap()
    };
    let pending = at(6, 1);
    assert_eq!(pending.paired_returns, 1);
    assert!(pending.sample.is_none());
    let first = at(6, 6);
    assert_eq!(
        (
            first.expected_returns,
            first.left_returns,
            first.right_returns,
            first.paired_returns
        ),
        (6, 6, 4, 4)
    );
    assert_eq!(at(6, 7).paired_returns, 6);
    let removal = at(6, 8);
    assert_eq!(
        (
            removal.left_returns,
            removal.right_returns,
            removal.paired_returns
        ),
        (4, 6, 4)
    );
    assert_eq!(at(6, 6), first);
    let sample = first.sample.unwrap();
    assert_eq!(sample.minimum.left_basis_points, 5000);
    assert_eq!(sample.minimum.mean_return, 0.0);
    assert_eq!(sample.minimum.volatility, 0.0);
    assert!((sample.covariance + 1.0 / 300.0).abs() < 1e-14);
    assert_eq!(sample.equal, sample.minimum);

    let constant = constant_left();
    let constant = PriceBook::parse(&universe, &constant).unwrap();
    assert_eq!(
        constant
            .portfolio_variance("A", "B", query(6, 7))
            .unwrap()
            .sample
            .unwrap()
            .minimum
            .left_basis_points,
        10_000
    );
    assert_eq!(
        constant
            .portfolio_variance("B", "A", query(6, 7))
            .unwrap()
            .sample
            .unwrap()
            .minimum
            .left_basis_points,
        0
    );
    let altered = PRICES
        .replace(",90\n", ",80\n")
        .replace(",81\n", ",64\n")
        .replace(",72.9\n", ",51.2\n");
    let altered = PriceBook::parse(&universe, &altered).unwrap();
    let non_equal = altered
        .portfolio_variance("A", "B", query(6, 7))
        .unwrap()
        .sample
        .unwrap();
    assert_eq!(non_equal.minimum.left_basis_points, 6667);
    assert!(non_equal.minimum.volatility < non_equal.equal.volatility);
    let reversed = altered
        .portfolio_variance("B", "A", query(6, 7))
        .unwrap()
        .sample
        .unwrap();
    assert_eq!(reversed.minimum.left_basis_points, 3333);

    let flat = PRICES
        .lines()
        .map(|line| {
            if line.starts_with("RISK,") {
                format!("{},100", line.rsplit_once(',').unwrap().0)
            } else {
                line.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    let flat = PriceBook::parse(&universe, &flat)
        .unwrap()
        .portfolio_variance("A", "B", query(6, 7))
        .unwrap()
        .sample
        .unwrap();
    assert_eq!(flat.minimum.left_basis_points, 5000);
    assert_eq!(flat.minimum.volatility, 0.0);
}
