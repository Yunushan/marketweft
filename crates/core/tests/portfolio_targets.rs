use marketweft_core::research::equity_target_drift_request;
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
fn native_equity_target_frames_echo_cutoffs_and_validate_source_boundaries() {
    let request = |version, membership_bytes, terms_bytes| {
        format!(
            "marketweft-equity-target-drift\t{version}\t{membership_bytes}\t{}\t{}\t{terms_bytes}\n2025-06-02T14:10:00Z\n2025-06-02T14:16:00Z\n{MEMBERSHIP}{HOLDINGS}{PRICES}{TERMS}{TARGETS}",
            HOLDINGS.len(), PRICES.len()
        )
    };
    let valid = request(1, MEMBERSHIP.len(), TERMS.len());
    let output = equity_target_drift_request(valid.as_bytes()).unwrap();
    assert_eq!(
        output,
        "marketweft-equity-target-drift\t1\t2\nH\t1748873400\t1748873760\n\
         USD\tALFA-001\t1\t28772920\t1748872800\t1748873760\t30000000\t-1227080\n\
         USD\tBETA-001\t1\t71227080\t1748872800\t1748873760\t70000000\t1227080\n"
    );
    assert!(
        equity_target_drift_request(request(2, MEMBERSHIP.len(), TERMS.len()).as_bytes()).is_err()
    );
    assert!(equity_target_drift_request(request(1, usize::MAX, TERMS.len()).as_bytes()).is_err());
    assert!(
        equity_target_drift_request(request(1, MEMBERSHIP.len(), 1024 * 1024 + 1).as_bytes())
            .is_err()
    );
    assert!(
        equity_target_drift_request(valid.replace("DEMO-BASKET", "ÄMO-BASKET").as_bytes()).is_err()
    );
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

#[test]
fn target_comparison_keeps_currency_keys_and_independent_evidence() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let book = PortfolioBook::parse(&universe, HOLDINGS, PRICES, TERMS).unwrap();
    let targets = EquityTargetBook::parse(&universe, TARGETS).unwrap();
    let at = |effective, known| book.as_of(time(effective), time(known));
    let pending = at(10, 11);
    let original = at(10, 12);
    let revised = at(10, 16);
    let missing = targets.compare(&pending, &original).unwrap();
    assert_eq!(
        missing[1].before.unwrap().target.unwrap().weight_micros,
        Some(60_000_000)
    );
    assert_eq!(missing[1].before.unwrap().drift_micros, None);
    assert_eq!(missing[1].drift_change_micros, None);

    let correction = targets.compare(&original, &revised).unwrap();
    assert_eq!(correction[1].drift_change_micros, Some(-12_071_349));
    assert_eq!(
        correction[1].before.unwrap().target.unwrap().observed_at,
        time(11)
    );
    assert_eq!(
        correction[1].after.unwrap().target.unwrap().observed_at,
        time(16)
    );
    assert_eq!(
        targets.compare(&revised, &original).unwrap()[1].drift_change_micros,
        Some(12_071_349)
    );
    assert_eq!(
        targets.compare(&original, &original).unwrap()[1].drift_change_micros,
        Some(0)
    );

    let successor = at(45, 45);
    let rows = targets.compare(&original, &successor).unwrap();
    assert_eq!(
        (rows[0].listing_id, rows[0].currency),
        ("BETA-002", Some("EUR"))
    );
    assert_eq!(rows[0].before, None);
    assert_eq!(rows[0].after.unwrap().drift_micros, Some(0));
    assert_eq!(
        rows[1].after.unwrap().target.unwrap().weight_micros,
        Some(0)
    );
    assert_eq!(rows[2].listing_id, "BETA-001");
    assert!(rows[2].after.unwrap().actual.is_none());
    assert_eq!(rows[2].after.unwrap().target.unwrap().weight_micros, None);
    assert_eq!(rows[2].drift_change_micros, None);
}
