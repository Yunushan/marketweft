use marketweft_core::{parse_universe, PriceBook, ScreenRow};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const PRICES: &str = include_str!("fixtures/synthetic-universe-prices.csv");
const HEADER: &str = "universe,listing_id,price_at,observed_at,close";

fn ranks<'a>(rows: &[ScreenRow<'a>]) -> Vec<(&'a str, Option<usize>, Option<i128>)> {
    rows.iter()
        .map(|row| (row.listing.listing_id.as_str(), row.rank, row.return_units))
        .collect()
}

#[test]
fn screen_tracks_membership_and_never_uses_a_close_before_observation() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let prices = PriceBook::parse(&universe, PRICES).unwrap();
    let start = universe.checkpoints()[0];
    let query = |end: i64, known: i64| prices.screen(start, start + end, start + known).unwrap();
    assert_eq!(
        ranks(&query(300, 300)),
        [("ALFA-001", Some(1), Some(10_000))]
    );
    let added = query(600, 719);
    assert_eq!(
        ranks(&added),
        [
            ("ALFA-001", Some(1), Some(20_000)),
            ("BETA-001", None, None)
        ]
    );
    assert_eq!(added[1].baseline.unwrap().ticks, 50_000_000);
    assert_eq!(added[1].current, None);
    let now_known = query(600, 720);
    assert_eq!(
        ranks(&now_known),
        [
            ("BETA-001", Some(1), Some(120_000)),
            ("ALFA-001", Some(2), Some(20_000))
        ]
    );
    assert_eq!(now_known[0].current.unwrap().observed_at, start + 720);
    let corrected = query(600, 960);
    assert_eq!(
        ranks(&corrected),
        [
            ("ALFA-001", Some(1), Some(20_000)),
            ("BETA-001", Some(2), Some(10_000))
        ]
    );
    assert_eq!(corrected[1].current.unwrap().ticks, 50_500_000);
    assert_eq!(
        ranks(&query(1200, 1499)),
        [
            ("BETA-001", Some(1), Some(80_000)),
            ("ALFA-001", Some(2), Some(40_000))
        ]
    );
    assert_eq!(
        ranks(&query(1200, 1500)),
        [("BETA-001", Some(1), Some(80_000))]
    );
    assert!(query(2100, 2100).is_empty());
    let relisted = query(2700, 2700);
    assert_eq!(ranks(&relisted), [("BETA-002", None, None)]);
    assert_eq!(relisted[0].baseline, None);
    assert_eq!(relisted[0].current.unwrap().ticks, 75_000_000);
    assert_eq!(query(3000, 3000)[1].current, None);
    assert_eq!(query(600, 719), added);
    assert!(prices.screen(start + 1, start, start + 10_000).is_err());
}

#[test]
fn exact_rank_is_deterministic_even_when_display_values_tie() {
    let membership = format!("{MEMBERSHIP}DEMO-BASKET,GAMMA-BASE,GAMMA-001,DEMO:GAMMA,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,add\n");
    let universe = parse_universe(&membership).unwrap();
    let start = universe.checkpoints()[0];
    let input = |g: &str| {
        format!(
            concat!(
        "{}\n",
        "DEMO-BASKET,GAMMA-001,2025-06-02T14:10:00Z,2025-06-02T14:10:00Z,{}\n",
        "DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:10:00Z,1999999999.999999\n",
        "DEMO-BASKET,ALFA-001,2025-06-02T14:10:00Z,2025-06-02T14:10:00Z,1999999999.999998\n",
        "DEMO-BASKET,GAMMA-001,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,1999999999.999999\n",
        "DEMO-BASKET,ALFA-001,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,2000000000\n",
        "DEMO-BASKET,BETA-001,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,1999999999.999999\n"),
            HEADER, g
        )
    };
    let run = |csv: &str| {
        PriceBook::parse(&universe, csv)
            .unwrap()
            .screen(start, start + 600, start + 600)
            .unwrap()
    };
    let exact = input("2000000000");
    assert_eq!(
        ranks(&run(&exact)),
        [
            ("GAMMA-001", Some(1), Some(0)),
            ("BETA-001", Some(2), Some(0)),
            ("ALFA-001", Some(3), Some(0))
        ]
    );
    let tie = input("1999999999.999999");
    assert_eq!(
        ranks(&run(&tie)),
        [
            ("BETA-001", Some(1), Some(0)),
            ("GAMMA-001", Some(1), Some(0)),
            ("ALFA-001", Some(3), Some(0))
        ]
    );
    let reordered = format!(
        "{HEADER}\n{}",
        tie.split_once('\n')
            .unwrap()
            .1
            .lines()
            .rev()
            .collect::<Vec<_>>()
            .join("\n")
    );
    assert_eq!(run(&tie), run(&reordered));
}

#[test]
fn large_returns_and_negative_halfway_rounding_are_exact() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let start = universe.checkpoints()[0];
    let input = format!(
        concat!(
            "{}\n",
            "DEMO-BASKET,ALFA-001,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,0.000001\n",
            "DEMO-BASKET,ALFA-001,2025-06-02T14:10:00Z,2025-06-02T14:10:00Z,2000000000\n",
            "DEMO-BASKET,BETA-001,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,2\n",
            "DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:10:00Z,1.999999\n"
        ),
        HEADER
    );
    let rows = PriceBook::parse(&universe, &input)
        .unwrap()
        .screen(start, start + 600, start + 600)
        .unwrap();
    assert_eq!(
        ranks(&rows),
        [
            ("ALFA-001", Some(1), Some(1_999_999_999_999_999_000_000)),
            ("BETA-001", Some(2), Some(-1))
        ]
    );
}

#[test]
fn validates_complete_reports_and_accepts_header_only() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let start = universe.checkpoints()[0];
    let no_prices = PriceBook::parse(&universe, HEADER)
        .unwrap()
        .screen(start, start, start)
        .unwrap();
    assert_eq!(ranks(&no_prices), [("ALFA-001", None, None)]);
    assert_eq!((no_prices[0].baseline, no_prices[0].current), (None, None));
    let bad = [
        PRICES.replacen("DEMO-BASKET", "OTHER", 1),
        PRICES.replacen("ALFA-001", "UNKNOWN", 1),
        PRICES.replacen(",100\n", ",-100\n", 1),
        PRICES.replacen(",100\n", ",100.0000001\n", 1),
        PRICES.replacen("14:00:00Z,100", "13:59:59Z,100", 1),
        format!("{PRICES}{}\n", PRICES.lines().nth(1).unwrap()),
    ];
    for file in bad {
        assert!(PriceBook::parse(&universe, &file).is_err());
    }
}
