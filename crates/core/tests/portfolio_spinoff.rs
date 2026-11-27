use marketweft_core::{
    parse_exact_utc, parse_universe, portfolio_spin_offs_as_of, ChildShares, PortfolioSpinOffState,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const HOLDINGS: &str = include_str!("fixtures/synthetic-portfolio-holdings.csv");
const REPORTS: &str = include_str!("fixtures/synthetic-portfolio-spin-offs.csv");

fn time(value: &str) -> i64 {
    parse_exact_utc(&format!("2025-06-02T{value}Z")).unwrap()
}

#[test]
fn independently_cut_off_terms_holdings_entitlement_and_distribution() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let snapshot = |effective, known| {
        portfolio_spin_offs_as_of(&universe, HOLDINGS, REPORTS, time(effective), time(known))
            .unwrap()
    };
    let beta = |effective, known| {
        snapshot(effective, known)
            .into_iter()
            .find(|row| row.report.id == "BETA-UNIT")
            .unwrap()
    };
    assert!(snapshot("14:19:59", "14:50:00").is_empty());
    assert!(snapshot("14:20:00", "14:16:59").is_empty());

    let early = beta("14:20:00", "14:17:00");
    assert_eq!(early.state, PortfolioSpinOffState::Receivable);
    assert_eq!(early.report.parent_listing, "BETA-001");
    assert_eq!(early.report.child_listing, "ALFA-001");
    assert_eq!(early.entitled_parent_shares, Some(10));
    assert_eq!(early.position_effective_at, Some(time("14:06:00")));
    assert_eq!(early.position_observed_at, Some(time("14:06:00")));
    assert_eq!(
        early.child_shares,
        Some(ChildShares {
            numerator: 10,
            denominator: 3
        })
    );

    assert_eq!(
        beta("14:40:00", "14:49:59").state,
        PortfolioSpinOffState::Distributed
    );
    let rescheduled = beta("14:40:00", "14:50:00");
    assert_eq!(rescheduled.state, PortfolioSpinOffState::Receivable);
    assert_eq!(
        rescheduled.child_shares,
        Some(ChildShares {
            numerator: 20,
            denominator: 3
        })
    );
    let revised = beta("14:55:00", "14:58:00");
    assert_eq!(revised.state, PortfolioSpinOffState::Distributed);
    assert_eq!(revised.entitled_parent_shares, Some(8));
    assert_eq!(revised.position_observed_at, Some(time("14:58:00")));
    assert_eq!(
        revised.child_shares,
        Some(ChildShares {
            numerator: 16,
            denominator: 3
        })
    );
    assert_eq!(
        beta("14:55:00", "15:02:00").state,
        PortfolioSpinOffState::NoDistribution
    );
    assert_eq!(beta("14:20:00", "14:17:00"), early);
    assert!(snapshot("14:55:00", "14:58:00")
        .iter()
        .any(|row| row.report.child_listing == "BETA-002"
            && row.child_shares
                == Some(ChildShares {
                    numerator: 1,
                    denominator: 1
                })));
}

#[test]
fn missing_positions_and_known_zero_positions_stay_distinct() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let holdings = HOLDINGS.replace(
        "2025-06-02T14:06:00Z,2025-06-02T14:06:00Z,10",
        "2025-06-02T14:20:00Z,2025-06-02T14:20:00Z,10",
    );
    let query = |csv: &str| {
        portfolio_spin_offs_as_of(&universe, csv, REPORTS, time("14:40:00"), time("14:40:00"))
            .unwrap()
            .into_iter()
            .find(|row| row.report.id == "BETA-UNIT")
            .unwrap()
    };
    let missing = query(&holdings);
    assert_eq!(missing.state, PortfolioSpinOffState::UnknownPosition);
    assert_eq!(missing.child_shares, None);
    let zero = query(&HOLDINGS.replace("14:06:00Z,10,USD", "14:06:00Z,0,USD"));
    assert_eq!(zero.state, PortfolioSpinOffState::NoDistribution);
    assert_eq!(
        zero.child_shares,
        Some(ChildShares {
            numerator: 0,
            denominator: 1
        })
    );
}

#[test]
fn rejects_wrong_listings_duplicate_revisions_and_invalid_fraction() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let query = |reports: &str| {
        portfolio_spin_offs_as_of(
            &universe,
            HOLDINGS,
            reports,
            time("14:20:00"),
            time("14:20:00"),
        )
        .unwrap_err()
    };
    assert!(query(&REPORTS.replacen("ALFA-001", "UNKNOWN", 1)).contains("different listing IDs"));
    assert!(
        query(&REPORTS.replacen("ALFA-001", "BETA-002", 1)).contains("keep its original listings")
    );
    assert!(query(&REPORTS.replacen("14:50:00Z", "14:17:00Z", 1))
        .contains("duplicate observation times"));
    assert!(query(&REPORTS.replacen("Z,1,3", "Z,1,0", 1)).contains("denominator"));
}
