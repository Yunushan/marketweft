use marketweft_core::{
    parse_exact_utc, parse_universe, portfolio_rights_as_of, ChildShares, RightsOfferingPhase,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const HOLDINGS: &str = include_str!("fixtures/synthetic-rights-holdings.csv");
const TERMS: &str = include_str!("fixtures/synthetic-subscription-rights.csv");

fn utc(time: &str) -> i64 {
    parse_exact_utc(&format!("2025-06-02T{time}Z")).unwrap()
}

#[test]
fn rights_use_independent_cutoffs_and_preserve_fractional_entitlement_and_exact_cost() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let run = |effective, known| {
        portfolio_rights_as_of(&universe, HOLDINGS, TERMS, utc(effective), utc(known)).unwrap()
    };
    assert!(run("14:11:59", "14:15:00").is_empty());
    assert!(run("14:30:00", "14:14:59").is_empty());
    let announced = run("14:29:59", "14:15:00");
    assert_eq!(announced[0].phase, RightsOfferingPhase::Announced);
    assert!(announced[0].entitlement.is_none());
    assert_eq!(
        run("14:30:00", "14:35:00")[0].phase,
        RightsOfferingPhase::AwaitingOpen
    );
    assert_eq!(
        run("14:39:59", "14:49:00")[0].phase,
        RightsOfferingPhase::AwaitingOpen
    );
    let open = run("14:40:00", "14:49:00");
    assert_eq!(open[0].phase, RightsOfferingPhase::Open);
    let initial = open[0].entitlement.unwrap();
    assert_eq!(initial.held_shares, 10);
    assert_eq!(initial.holding_effective_at, utc("14:06:00"));
    assert_eq!(
        initial.exact_shares,
        ChildShares {
            numerator: 10,
            denominator: 3
        }
    );
    assert_eq!(initial.subscribable_shares, 3);
    assert_eq!(initial.full_subscription_cost, 57_750_000);
    assert_eq!(
        run("14:55:00", "14:56:59")[0].phase,
        RightsOfferingPhase::Expired
    );

    let extended = run("15:00:00", "14:57:00");
    assert_eq!(extended[0].phase, RightsOfferingPhase::Open);
    assert_eq!(extended[0].terms.as_ref().unwrap().currency, "EUR");
    assert_eq!(
        extended[0].entitlement.unwrap().full_subscription_cost,
        100_625_005
    );
    let corrected = run("15:00:00", "14:58:00")[0].entitlement.unwrap();
    assert_eq!(corrected.held_shares, 8);
    assert_eq!(corrected.holding_observed_at, utc("14:58:00"));
    assert_eq!(corrected.subscribable_shares, 4);
    assert_eq!(corrected.full_subscription_cost, 80_500_004);
    assert_eq!(
        run("15:05:00", "15:02:59")[0].phase,
        RightsOfferingPhase::Expired
    );
    let canceled = run("15:00:00", "15:03:00");
    assert_eq!(canceled[0].phase, RightsOfferingPhase::Cancelled);
    assert!(canceled[0].terms.is_none() && canceled[0].entitlement.is_none());
    assert_eq!(open, run("14:40:00", "14:49:00"));
}

#[test]
fn fraction_policy_is_reported_and_missing_and_zero_holdings_are_distinct() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let run = |holdings: &str, terms: &str| {
        portfolio_rights_as_of(&universe, holdings, terms, utc("14:45:00"), utc("14:45:00"))
            .unwrap()
    };
    for (ratio, policy, expected) in [
        ("1,3", "up", 4),
        ("1,3", "nearest", 3),
        ("1,4", "nearest", 3),
        ("1,4", "down", 2),
    ] {
        let terms = TERMS.replacen(
            "1,3,USD,19.25,down",
            &format!("{ratio},USD,19.25,{policy}"),
            1,
        );
        let allocation = run(HOLDINGS, &terms)[0].entitlement.unwrap();
        assert_eq!(allocation.subscribable_shares, expected);
        assert_eq!(
            allocation.full_subscription_cost,
            19_250_000 * i128::from(expected)
        );
    }
    let empty = HOLDINGS.lines().next().unwrap();
    assert_eq!(run(empty, TERMS)[0].entitlement, None);
    let zero = HOLDINGS.replacen(",10,USD", ",0,USD", 1);
    assert_eq!(
        run(&zero, TERMS)[0]
            .entitlement
            .unwrap()
            .subscribable_shares,
        0
    );
}

#[test]
fn invalid_terms_and_ambiguous_revisions_fail_closed() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    for (before, after, expected) in [
        ("offer,ALFA-001,", "offer,MISSING,", "subscription listing"),
        ("14:55:00Z,1,3", "14:40:00Z,1,3", "ordered announcement"),
        (",1,3,USD", ",1,0,USD", "ratio integers"),
        (",USD,19.25", ",usd,19.25", "uppercase"),
        (",19.25,down", ",0,down", "positive subscription price"),
        (",19.25,down", ",19.25,unset", "fraction policy"),
        (
            "ALFA-001,2025-06-02T14:57",
            "BETA-002,2025-06-02T14:57",
            "original listing",
        ),
        (
            "14:57:00Z,offer",
            "14:15:00Z,offer",
            "Duplicate observation",
        ),
        ("cancel,,,,", "cancel,ALFA-001,,,", "terms empty"),
    ] {
        let terms = TERMS.replacen(before, after, 1);
        let error = portfolio_rights_as_of(
            &universe,
            HOLDINGS,
            &terms,
            utc("15:00:00"),
            utc("15:00:00"),
        )
        .unwrap_err();
        assert!(error.contains(expected), "{error}");
    }
}
