use marketweft_core::{parse_universe, PriceBook};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const PRICES: &str = include_str!("fixtures/synthetic-universe-prices.csv");
const SECTORS: &str = include_str!("fixtures/synthetic-universe-sectors.csv");
const HEADER: &str = "universe,listing_id,effective_at,observed_at,sector,weight";

#[test]
fn heatmap_reconciles_with_screen_and_reports_covered_weight() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let book = PriceBook::parse(&universe, PRICES).unwrap();
    let start = universe.checkpoints()[0];
    let query = |effective: i64, known: i64| {
        let map = book
            .heatmap(SECTORS, start, start + effective, start + known)
            .unwrap();
        let mut ranking: Vec<_> = map
            .groups
            .iter()
            .flat_map(|g| g.listings.iter())
            .map(|listing| listing.ranking.clone())
            .collect();
        let mut expected = book
            .screen(start, start + effective, start + known)
            .unwrap();
        ranking.sort_by_key(|listing| &listing.listing.listing_id);
        expected.sort_by_key(|listing| &listing.listing.listing_id);
        assert_eq!(ranking, expected);
        map
    };
    let before = query(300, 300);
    assert_eq!(before.groups[0].sector.as_deref(), Some("Technology"));
    assert_eq!(
        (
            before.known_weight,
            before.covered_weight,
            before.contribution
        ),
        (600_000, 600_000, Some(10_000))
    );

    let added = query(600, 600);
    assert_eq!(
        (added.known_weight, added.covered_weight, added.contribution),
        (1_000_000, 600_000, Some(12_000))
    );
    assert_eq!(
        (
            added.groups[0].weighted_return,
            added.groups[0].contribution
        ),
        (Some(20_000), Some(12_000))
    );
    assert_eq!(added.groups[1].sector.as_deref(), Some("Financials"));
    assert_eq!(added.groups[1].weighted_return, None);

    let full = query(600, 720);
    assert_eq!(
        (full.covered_weight, full.contribution),
        (1_000_000, Some(60_000))
    );
    assert_eq!(full.groups[1].listings[0].contribution, Some(48_000));

    let revised = query(600, 960);
    assert_eq!(revised.groups.len(), 1);
    assert_eq!(revised.groups[0].weighted_return, Some(16_000));
    assert_eq!(
        revised.groups[0].listings[1]
            .classification
            .as_ref()
            .unwrap()
            .observed_at,
        start + 960
    );
    assert_eq!(query(600, 600), added);

    let removed = query(1200, 1500);
    assert_eq!(removed.groups[0].listings.len(), 1);
    assert_eq!(
        (
            removed.known_weight,
            removed.covered_weight,
            removed.contribution
        ),
        (400_000, 400_000, Some(80_000))
    );
    assert!(query(2100, 2100).groups.is_empty());

    let no_metadata = query(2700, 2700);
    assert_eq!(no_metadata.groups[0].sector, None);
    assert_eq!(no_metadata.groups[0].listings[0].classification, None);
    let next = query(3000, 3000);
    assert_eq!(next.groups[0].sector.as_deref(), Some("Industrials"));
    assert_eq!(next.groups[1].sector.as_deref(), Some("Financials"));
    assert_eq!(
        next.groups[1].listings[0]
            .classification
            .as_ref()
            .unwrap()
            .weight,
        None
    );
}

#[test]
fn metadata_validates_id_time_weight_duplicates_and_zero() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let book = PriceBook::parse(&universe, PRICES).unwrap();
    let start = universe.checkpoints()[0];
    let run = |source: &str| book.heatmap(source, start, start, start);
    for invalid in [
        SECTORS.replacen("DEMO-BASKET", "WRONG", 1),
        SECTORS.replacen("ALFA-001", "UNKNOWN", 1),
        SECTORS.replacen("14:00:00Z", "14:00:00+00:00", 1),
        SECTORS.replacen("0.6", "-0", 1),
        SECTORS.replacen("0.6", "1.000001", 1),
        SECTORS.replacen("0.6", "0.0000001", 1),
        format!("{SECTORS}{}\n", SECTORS.lines().nth(1).unwrap()),
    ] {
        assert!(run(&invalid).is_err());
    }
    let zero = run(&SECTORS.replacen("0.6", "0", 1)).unwrap();
    assert_eq!(zero.known_weight, 0);
    assert_eq!(
        zero.groups[0].listings[0]
            .classification
            .as_ref()
            .unwrap()
            .weight,
        Some(0)
    );
    assert_eq!(zero.groups[0].weighted_return, None);
    assert_eq!(zero.groups[0].contribution, None);
    assert_eq!(run(HEADER).unwrap().groups[0].sector, None);
}
