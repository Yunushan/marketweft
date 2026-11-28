use marketweft_core::{parse_universe, EquityTargetBook, EquityTargetReport, PortfolioBook};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const HOLDINGS: &str = include_str!("fixtures/synthetic-portfolio-holdings.csv");
const PRICES: &str = include_str!("fixtures/synthetic-universe-prices.csv");
const TERMS: &str = include_str!("fixtures/synthetic-delisting-terms.csv");
const TARGETS: &str = include_str!("fixtures/synthetic-equity-targets.csv");
const BASE: i64 = 1_748_872_800;

fn time(minute: i64) -> i64 {
    BASE + minute * 60
}

#[test]
fn targets_follow_independent_cutoffs_and_reconcile_only_known_weights() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let book = PortfolioBook::parse(&universe, HOLDINGS, PRICES, TERMS).unwrap();
    let targets = EquityTargetBook::parse(&universe, TARGETS).unwrap();
    let query = |effective, known| {
        targets
            .drift_as_of(&book.as_of(time(effective), time(known)))
            .unwrap()
    };
    let missing = query(10, 10);
    assert_eq!(missing[0].listing_id, "ALFA-001");
    assert_eq!(missing[0].drift_micros, Some(60_000_000));
    assert_eq!(missing[1].actual.unwrap().weight_micros, None);
    assert_eq!(missing[1].target, None);
    let only_target = query(10, 11);
    assert_eq!(
        only_target[1].target.unwrap().weight_micros,
        Some(60_000_000)
    );
    assert_eq!(only_target[1].drift_micros, None);
    let original = query(10, 12);
    assert_eq!(original[0].drift_micros, Some(-13_298_429));
    assert_eq!(original[1].drift_micros, Some(13_298_429));
    let revised = query(10, 16);
    assert_eq!(revised[0].drift_micros, Some(-1_227_080));
    assert_eq!(revised[1].drift_micros, Some(1_227_080));
    assert_eq!(
        revised[1].target,
        Some(EquityTargetReport {
            effective_at: time(0),
            observed_at: time(16),
            weight_micros: Some(70_000_000),
        })
    );
    assert_eq!(query(10, 12), original);
    assert_eq!(query(10, 10), missing);

    let before_scheduled = query(44, 45);
    assert_eq!(
        before_scheduled[0].target.unwrap().weight_micros,
        Some(30_000_000)
    );
    let successor = query(45, 45);
    assert_eq!(
        (successor[0].currency, successor[0].listing_id),
        (Some("EUR"), "BETA-002")
    );
    assert_eq!(successor[0].drift_micros, Some(0));
    assert_eq!(
        successor[1].target,
        Some(EquityTargetReport {
            effective_at: time(45),
            observed_at: time(44),
            weight_micros: Some(0),
        })
    );
    assert_eq!(successor[1].drift_micros, None);
    assert_eq!(successor[2].listing_id, "BETA-001");
    assert_eq!(successor[2].actual, None);
    assert_eq!(successor[2].target.unwrap().weight_micros, None);
}

#[test]
fn targets_reject_duplicate_keys_and_report_overallocation_at_the_known_cutoff() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    assert!(
        EquityTargetBook::parse(&universe, &TARGETS.replace("ALFA-001", "UNKNOWN-001")).is_err()
    );
    assert!(EquityTargetBook::parse(&universe, &TARGETS.replace(",40", ",100.000001")).is_err());
    assert!(EquityTargetBook::parse(
        &universe,
        &format!("{TARGETS}{}", TARGETS.lines().nth(1).unwrap())
    )
    .is_err());
    let overallocated = TARGETS.replace(",60", ",60.000001");
    let targets = EquityTargetBook::parse(&universe, &overallocated).unwrap();
    let portfolio = PortfolioBook::parse(&universe, HOLDINGS, PRICES, TERMS).unwrap();
    assert!(targets
        .drift_as_of(&portfolio.as_of(time(10), time(10)))
        .is_ok());
    let failure = targets
        .drift_as_of(&portfolio.as_of(time(10), time(11)))
        .unwrap_err();
    assert_eq!(failure, "Known USD equity targets exceed 100%.");
    assert!(targets
        .drift_as_of(&portfolio.as_of(time(10), time(16)))
        .is_ok());
}
