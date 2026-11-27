use marketweft_core::{
    parse_exact_utc, parse_universe, portfolio_successor_delivery_ledger,
    portfolio_successor_shares_as_of, ChildShares, SuccessorShareDelta, SuccessorShareState,
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

#[test]
fn deliveries_post_only_after_economic_and_observation_cutoffs_and_rewind_exactly() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let postings = |effective, known| {
        portfolio_successor_delivery_ledger(&universe, HOLDINGS, TERMS, utc(effective), utc(known))
            .unwrap()
    };
    assert!(postings("14:48:59", "15:02:00").is_empty());
    assert!(postings("15:00:00", "14:48:59").is_empty());
    let original = postings("14:49:00", "14:49:00");
    assert_eq!(original.len(), 1);
    assert_eq!(original[0].position_effective_at, utc("14:06:00"));
    assert_eq!(original[0].scheduled_delivery_at, utc("14:49:00"));
    assert_eq!(original[0].terms_observed_at, utc("14:37:00"));
    assert_eq!(original[0].delisting_observed_at, utc("14:35:00"));
    let all = postings("15:00:00", "15:02:00");
    let moments: Vec<_> = all
        .iter()
        .map(|row| {
            (
                row.posted_at,
                row.successor_listing.as_str(),
                row.delta.numerator,
                row.delta.denominator,
                row.balance.numerator,
                row.balance.denominator,
            )
        })
        .collect();
    assert_eq!(
        moments,
        [
            (utc("14:49:00"), "BETA-002", 10, 3, 10, 3),
            (utc("14:56:00"), "BETA-002", -10, 3, 0, 1),
            (utc("15:00:00"), "ALFA-001", 6, 1, 6, 1),
            (utc("15:02:00"), "ALFA-001", -6, 1, 0, 1),
        ]
    );
    assert_eq!(all[2].entitled_shares, 8);
    assert_eq!(all[2].position_observed_at, utc("14:58:00"));
    assert_eq!(all[1].terms_observed_at, original[0].terms_observed_at);
    assert_eq!(&all[..1], postings("15:00:00", "14:55:00"));
    assert_eq!(&all[..2], postings("14:59:59", "15:02:00"));
    assert_eq!(original, postings("14:49:00", "14:49:00"));
}

#[test]
fn same_listing_revisions_net_exact_fractions_and_listing_switches_reverse_first() {
    let mut membership = MEMBERSHIP.to_owned();
    membership.push_str("DEMO-BASKET,BETA-DELIST,BETA-001,DEMO:BETA,2025-06-02T14:30:00Z,2025-06-02T15:01:00Z,cancel\n");
    let universe = parse_universe(&membership).unwrap();
    let terms = concat!(
        "universe,listing_id,change_id,successor_listing,observed_at,deliver_at,numerator,denominator\n",
        "DEMO-BASKET,BETA-001,BETA-DELIST,BETA-002,2025-06-02T14:50:00Z,2025-06-02T14:49:00Z,1,3\n",
        "DEMO-BASKET,BETA-001,BETA-DELIST,BETA-002,2025-06-02T14:51:00Z,2025-06-02T14:49:00Z,1,7\n",
        "DEMO-BASKET,BETA-001,BETA-DELIST,BETA-002,2025-06-02T14:52:00Z,2025-06-02T14:49:00Z,2,14\n",
        "DEMO-BASKET,BETA-001,BETA-DELIST,ALFA-001,2025-06-02T15:00:00Z,2025-06-02T14:49:00Z,3,4\n",
    );
    let all = portfolio_successor_delivery_ledger(
        &universe,
        HOLDINGS,
        terms,
        utc("14:59:59"),
        utc("15:01:00"),
    )
    .unwrap();
    assert_eq!(all.len(), 6);
    assert_eq!(all[0].posted_at, utc("14:50:00"));
    assert_eq!(all[0].scheduled_delivery_at, utc("14:49:00"));
    assert_eq!(
        all[1].delta,
        SuccessorShareDelta {
            numerator: -40,
            denominator: 21
        }
    );
    assert_eq!(all[2].posted_at, utc("14:58:00"));
    assert_eq!(
        all[2].delta,
        SuccessorShareDelta {
            numerator: -2,
            denominator: 7
        }
    );
    assert_eq!(
        all[2].balance,
        ChildShares {
            numerator: 8,
            denominator: 7
        }
    );
    assert_eq!(all[3].posted_at, all[4].posted_at);
    assert_eq!(
        (all[3].successor_listing.as_str(), all[3].delta.numerator),
        ("BETA-002", -8)
    );
    assert_eq!(
        (all[4].successor_listing.as_str(), all[4].delta.numerator),
        ("ALFA-001", 6)
    );
    assert_eq!(all[5].posted_at, utc("15:01:00"));
    assert_eq!(
        all[5].delta,
        SuccessorShareDelta {
            numerator: -6,
            denominator: 1
        }
    );
    assert_eq!(all[5].balance.numerator, 0);
}

#[test]
fn ledger_work_bound_counts_only_visible_holding_vintages() {
    use std::fmt::Write;
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let mut large = HOLDINGS.to_owned();
    for index in 0..1500 {
        let minute = index / 60;
        let second = index % 60;
        let observed = 50 + minute;
        writeln!(large, "DEMO-BASKET,BETA-001,2025-06-02T14:{minute:02}:{second:02}Z,2025-06-02T{:02}:{:02}:{second:02}Z,1,USD", 14 + observed / 60, observed % 60).unwrap();
    }
    let terms = TERMS.lines().take(2).collect::<Vec<_>>().join("\n");
    let run = |holdings, known| {
        portfolio_successor_delivery_ledger(
            &universe,
            holdings,
            &terms,
            utc("14:49:00"),
            utc(known),
        )
    };
    assert_eq!(
        run(&large, "14:49:00").unwrap(),
        run(HOLDINGS, "14:49:00").unwrap()
    );
    assert!(run(&large, "15:15:00").unwrap_err().contains("two million"));
}
