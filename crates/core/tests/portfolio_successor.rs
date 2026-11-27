use marketweft_core::{
    parse_exact_utc, parse_universe, portfolio_successor_shares_as_of, ChildShares,
    SuccessorShareState,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const HOLDINGS: &str = include_str!("fixtures/synthetic-portfolio-holdings.csv");
const TERMS: &str = include_str!("fixtures/synthetic-successor-shares.csv");

fn utc(time: &str) -> i64 {
    parse_exact_utc(&format!("2025-06-02T{time}Z")).unwrap()
}

#[test]
fn successor_claims_follow_delisting_terms_holdings_and_delivery_cutoffs() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let rows = |effective, known| {
        portfolio_successor_shares_as_of(&universe, HOLDINGS, TERMS, utc(effective), utc(known))
            .unwrap()
    };
    assert!(rows("14:29:59", "15:00:00").is_empty());
    assert!(rows("14:30:00", "14:34:59").is_empty());
    let missing = rows("14:30:00", "14:36:59").remove(0);
    assert_eq!(missing.state, SuccessorShareState::MissingTerms);
    assert_eq!(missing.entitled_shares, Some(10));
    let offer = rows("14:48:59", "14:55:00").remove(0);
    assert_eq!(offer.state, SuccessorShareState::Receivable);
    assert_eq!(offer.delisting.change_id, "BETA-DELIST");
    assert_eq!(offer.terms.as_ref().unwrap().successor_listing, "BETA-002");
    assert_eq!(
        offer.successor_shares,
        Some(ChildShares {
            numerator: 10,
            denominator: 3
        })
    );
    assert_eq!(
        rows("14:49:00", "14:55:00")[0].state,
        SuccessorShareState::Delivered
    );

    let unscheduled = rows("14:59:59", "14:57:00").remove(0);
    assert_eq!(unscheduled.terms.as_ref().unwrap().deliver_at, None);
    assert_eq!(unscheduled.state, SuccessorShareState::Receivable);
    let revised = rows("15:00:00", "15:00:00").remove(0);
    assert_eq!(
        revised.terms.as_ref().unwrap().successor_listing,
        "ALFA-001"
    );
    assert_eq!(revised.position_effective_at, Some(utc("14:06:00")));
    assert_eq!(revised.position_observed_at, Some(utc("14:58:00")));
    assert_eq!(revised.entitled_shares, Some(8));
    assert_eq!(revised.state, SuccessorShareState::Delivered);
    assert_eq!(
        revised.successor_shares,
        Some(ChildShares {
            numerator: 6,
            denominator: 1
        })
    );
    let zero = rows("15:00:00", "15:02:00").remove(0);
    assert_eq!(zero.state, SuccessorShareState::NoDistribution);
    assert_eq!(
        zero.successor_shares,
        Some(ChildShares {
            numerator: 0,
            denominator: 1
        })
    );
    assert_eq!(
        rows("14:49:00", "14:55:00")[0].successor_shares,
        offer.successor_shares
    );
}

#[test]
fn membership_cancellation_withdraws_the_claim_and_absent_holdings_stay_unknown() {
    let mut membership = MEMBERSHIP.to_string();
    membership.push_str("DEMO-BASKET,BETA-DELIST,BETA-001,DEMO:BETA,2025-06-02T14:30:00Z,2025-06-02T15:01:00Z,cancel\n");
    let universe = parse_universe(&membership).unwrap();
    let no_position = "universe,listing_id,effective_at,observed_at,shares,quote_currency\nDEMO-BASKET,ALFA-001,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,1,USD\n";
    let query = |holdings, known| {
        portfolio_successor_shares_as_of(&universe, holdings, TERMS, utc("15:00:00"), utc(known))
            .unwrap()
    };
    assert_eq!(
        query(no_position, "15:00:59")[0].state,
        SuccessorShareState::UnknownPosition
    );
    assert_eq!(
        query(HOLDINGS, "15:00:59")[0].state,
        SuccessorShareState::Delivered
    );
    assert!(query(HOLDINGS, "15:01:00").is_empty());
}

#[test]
fn terms_require_an_exact_known_delisting_distinct_listing_and_valid_ratio() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    for (before, after, expected) in [
        ("BETA-DELIST", "ALFA-REMOVE", "delisting and listing ID"),
        ("BETA-002", "BETA-001", "distinct successor listing"),
        ("BETA-002", "UNKNOWN", "distinct successor listing"),
        (",1,3", ",1,0", "denominator"),
        (",1,3", ",1000001,3", "numerator"),
        ("14:56:00Z", "14:37:00Z", "Duplicate terms observation"),
        ("14:49:00Z", "14:49:00", "exact UTC delivery time"),
    ] {
        let csv = TERMS.replacen(before, after, 1);
        let error = portfolio_successor_shares_as_of(
            &universe,
            HOLDINGS,
            &csv,
            utc("15:00:00"),
            utc("15:00:00"),
        )
        .unwrap_err();
        assert!(error.contains(expected), "{error}");
    }
}
