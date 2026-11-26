use marketweft_core::{Instrument, ProfileArea, TradeTape};

const TRADES: &str = include_str!("fixtures/synthetic-footprint.csv");

#[test]
fn volume_and_time_opportunity_profiles_reconcile_the_observed_buckets() {
    let id = Instrument::new("NASDAQ", "NVDA").unwrap();
    let tape = TradeTape::parse_aggressors(TRADES, &id).unwrap();
    let query = |known| {
        tape.price_profile(60, 500_000, -1, 60, known, 7_000)
            .unwrap()
    };
    let empty = query(-1);
    assert!(empty.levels.is_empty());
    assert_eq!(empty.volume, None);
    assert_eq!(empty.time_opportunities, None);
    assert_eq!(empty.observed_brackets, 0);

    let early = query(60);
    assert_eq!(early.observed_brackets, 3);
    assert_eq!(
        early
            .levels
            .iter()
            .map(|level| (level.price_from, level.volume.total(), level.opportunities))
            .collect::<Vec<_>>(),
        [
            (-500_000, 1_500_000, 2),
            (100_500_000, 3_000_000, 1),
            (101_000_000, 2_000_000, 1),
        ]
    );
    assert_eq!(
        early.volume,
        Some(ProfileArea {
            point_of_control_from: 100_500_000,
            point_of_control_to: 101_000_000,
            value_from: 100_500_000,
            value_to: 101_500_000,
            covered: 5_000_000,
            total: 6_500_000,
        })
    );
    assert_eq!(
        early.time_opportunities,
        Some(ProfileArea {
            point_of_control_from: -500_000,
            point_of_control_to: 0,
            value_from: -500_000,
            value_to: 101_000_000,
            covered: 3,
            total: 4,
        })
    );

    let later = query(61);
    assert_eq!(later.levels[0].volume.trades, 3);
    assert_eq!(later.levels[0].opportunities, 2);
    assert_eq!(later.levels[1].volume.unknown, 3_000_000);
    assert_eq!(later.volume.unwrap().covered, 13_000_001);
    assert_eq!(later.volume.unwrap().total, 16_600_001);
    assert_eq!(later.volume.unwrap().value_to, 101_000_000);
    assert_eq!(later.time_opportunities, early.time_opportunities);
    assert_eq!(query(65), later);
    assert_eq!(query(60), early);
}

#[test]
fn area_expansion_resolves_ties_towards_lower_prices_and_obeys_exact_thresholds() {
    let id = Instrument::new("NASDAQ", "NVDA").unwrap();
    let csv = concat!(
        "instrument,executed_at,observed_at,sequence,price,size,aggressor\n",
        "NASDAQ:NVDA,0,0,1,0,1,buy\n",
        "NASDAQ:NVDA,0,0,2,1,2,buy\n",
        "NASDAQ:NVDA,0,0,3,2,1,buy\n"
    );
    let tape = TradeTape::parse_aggressors(csv, &id).unwrap();
    let query = |target| tape.price_profile(60, 1_000_000, 0, 0, 0, target);
    let area = query(7_500).unwrap().volume.unwrap();
    assert_eq!(
        (area.value_from, area.value_to, area.covered),
        (0, 2_000_000, 3_000_000)
    );
    assert_eq!(query(7_501).unwrap().volume.unwrap().covered, 4_000_000);
    let tpo = query(10_000).unwrap().time_opportunities.unwrap();
    assert_eq!(tpo.point_of_control_from, 0);
    assert_eq!(tpo.covered, 3);
    assert!(query(0).is_err());
    assert!(query(10_001).is_err());
}

#[test]
fn a_late_trade_adds_opportunity_only_when_it_occupies_a_new_bracket_and_bin() {
    let id = Instrument::new("NASDAQ", "NVDA").unwrap();
    let csv = concat!(
        "instrument,executed_at,observed_at,sequence,price,size,aggressor\n",
        "NASDAQ:NVDA,0,0,1,10,1,buy\n",
        "NASDAQ:NVDA,0,0,2,11,1,sell\n",
        "NASDAQ:NVDA,60,60,3,10,1,buy\n",
        "NASDAQ:NVDA,0,61,4,11,1,unknown\n",
        "NASDAQ:NVDA,0,61,5,12,1,buy\n",
        "NASDAQ:NVDA,60,62,6,11,1,unknown\n"
    );
    let tape = TradeTape::parse_aggressors(csv, &id).unwrap();
    let query = |known| {
        tape.price_profile(60, 1_000_000, 0, 60, known, 7_000)
            .unwrap()
    };
    let counts = |known| {
        query(known)
            .levels
            .into_iter()
            .map(|level| level.opportunities)
            .collect::<Vec<_>>()
    };
    assert_eq!(counts(60), [2, 1]);
    assert_eq!(counts(61), [2, 1, 1]);
    assert_eq!(counts(62), [2, 2, 1]);
    assert_eq!(
        query(62).time_opportunities.unwrap().point_of_control_from,
        10_000_000
    );
}
