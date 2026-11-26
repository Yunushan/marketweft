use marketweft_core::{parse_universe, PriceBook, UniverseAction};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const PRICES: &str = include_str!("fixtures/synthetic-universe-prices.csv");

#[test]
fn relative_series_aligns_exact_closes_at_the_shared_observation_cutoff() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let csv = format!(
        "{PRICES}DEMO-BASKET,ALFA-001,2025-06-02T14:12:00Z,2025-06-02T14:12:00Z,105\n\
         DEMO-BASKET,BETA-001,2025-06-02T14:12:00Z,2025-06-02T14:13:00Z,57\n\
         DEMO-BASKET,BETA-001,2025-06-02T14:11:00Z,2025-06-02T14:16:00Z,52\n\
         DEMO-BASKET,BETA-001,2025-06-02T14:07:00Z,2025-06-02T14:07:00Z,54\n"
    );
    let prices = PriceBook::parse(&universe, &csv).unwrap();
    let start = universe.checkpoints()[0];
    let query = |end: i64, known: i64| {
        prices
            .relative_series(
                "ALFA-001",
                "BETA-001",
                start + 600,
                start + end,
                start + known,
            )
            .unwrap()
    };

    let before_add = prices
        .relative_series("ALFA-001", "BETA-001", start, start + 600, start + 720)
        .unwrap();
    assert_eq!(before_add.len(), 3);
    assert_eq!(before_add[1].effective_at, start + 300);
    assert_eq!(before_add[1].right.close, None);
    assert_eq!(before_add[2].right.close.unwrap().ticks, 56_000_000);

    let missing = query(720, 720);
    assert_eq!(missing.len(), 2);
    assert_eq!(missing[1].left.return_units, Some(29_412));
    assert_eq!(missing[1].right.membership, Some(UniverseAction::Add));
    assert_eq!(missing[1].right.close, None);
    assert_eq!(missing[1].spread_units, None);

    let observed = query(720, 780);
    assert_eq!(observed[0].spread_units, Some(0));
    assert_eq!(observed[1].right.close.unwrap().observed_at, start + 780);
    assert_eq!(observed[1].right.return_units, Some(17_857));
    assert_eq!(observed[1].spread_units, Some(11_555));

    let revised = query(720, 960);
    assert_eq!(revised.len(), 3);
    assert_eq!(revised[1].effective_at, start + 660);
    assert_eq!(revised[1].left.close, None);
    assert_eq!(revised[1].spread_units, None);
    assert_eq!(revised[2].right.return_units, Some(128_713));
    assert_eq!(revised[2].spread_units, Some(-99_301));
    assert_eq!(query(720, 780), observed);

    assert_eq!(
        query(1200, 1200).last().unwrap().spread_units,
        Some(-49_699)
    );
    let removed = query(1200, 1500);
    let point = removed.last().unwrap();
    assert_eq!(point.left.membership, Some(UniverseAction::Remove));
    assert_eq!(point.left.close, None);
    assert_eq!(point.left.return_units, None);
    assert_eq!(point.right.return_units, Some(69_307));
    assert_eq!(point.spread_units, None);

    let delisted = query(2100, 2100);
    let point = delisted.last().unwrap();
    assert_eq!(point.right.membership, Some(UniverseAction::Delist));
    assert_eq!(point.right.close, None);

    let resumed = query(3000, 3000);
    let point = resumed.last().unwrap();
    assert_eq!(point.left.membership, Some(UniverseAction::Add));
    assert_eq!(point.left.return_units, Some(49_020));
    assert_eq!(point.right.membership, Some(UniverseAction::Delist));
}

#[test]
fn relative_series_requires_distinct_listings_and_does_not_fill_missing_baselines() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let prices = PriceBook::parse(&universe, PRICES).unwrap();
    let start = universe.checkpoints()[0];
    for (left, right, from, through) in [
        ("ALFA-001", "ALFA-001", start, start + 600),
        ("ALFA-001", "MISSING", start, start + 600),
        ("ALFA-001", "BETA-001", start + 600, start),
    ] {
        assert!(prices
            .relative_series(left, right, from, through, start + 1200)
            .is_err());
    }
    let series = prices
        .relative_series("ALFA-001", "BETA-001", start, start + 600, start + 721)
        .unwrap();
    assert_eq!(series[0].right.membership, None);
    let point = series.last().unwrap();
    assert_eq!(point.right.membership, Some(UniverseAction::Add));
    assert_eq!(point.right.close.unwrap().ticks, 56_000_000);
    assert_eq!(point.right.return_units, None);
    assert_eq!(point.spread_units, None);
}
