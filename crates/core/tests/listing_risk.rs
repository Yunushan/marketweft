use marketweft_core::{parse_universe, ListingRiskQuery, PriceBook};

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
