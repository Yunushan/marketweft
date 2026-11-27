use marketweft_core::{
    parse_exact_utc, parse_universe, portfolio_spin_off_cash_as_of, portfolio_spin_offs_as_of,
    ChildShares, PortfolioSpinOffState, SpinOffCashState,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const HOLDINGS: &str = include_str!("fixtures/synthetic-portfolio-holdings.csv");
const REPORTS: &str = include_str!("fixtures/synthetic-portfolio-spin-offs.csv");
const CASH_TERMS: &str = include_str!("fixtures/synthetic-spin-off-cash-terms.csv");

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

#[test]
fn cash_uses_only_the_fraction_and_both_settlement_dates() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let select = |effective, known| {
        portfolio_spin_off_cash_as_of(
            &universe,
            HOLDINGS,
            REPORTS,
            CASH_TERMS,
            time(effective),
            time(known),
        )
        .unwrap()
        .into_iter()
        .find(|row| row.id == "BETA-UNIT")
        .unwrap()
    };
    let missing = select("14:25:00", "14:23:59");
    assert_eq!(
        (missing.state, missing.amount),
        (SpinOffCashState::MissingTerms, None)
    );
    assert_eq!(
        missing.fractional_shares,
        Some(ChildShares {
            numerator: 1,
            denominator: 3
        })
    );
    let early = select("14:47:59", "14:48:00");
    assert_eq!(
        (early.state, early.amount),
        (SpinOffCashState::Receivable, Some(1_000_000))
    );
    assert_eq!(select("14:48:00", "14:48:00").state, SpinOffCashState::Paid);
    let revised = select("14:52:00", "14:52:00");
    assert_eq!(revised.terms.unwrap().currency, "EUR");
    assert_eq!(
        revised.fractional_shares,
        Some(ChildShares {
            numerator: 2,
            denominator: 3
        })
    );
    assert_eq!(
        (revised.state, revised.amount),
        (SpinOffCashState::Receivable, Some(4_000_000))
    );
    assert_eq!(select("14:55:00", "14:55:00").state, SpinOffCashState::Paid);
    assert_eq!(select("14:55:00", "14:58:00").amount, Some(2_000_000));
    let rate_cancelled = select("14:55:00", "14:59:00");
    assert_eq!(
        (rate_cancelled.state, rate_cancelled.amount),
        (SpinOffCashState::NoPayment, Some(0))
    );
    assert_eq!(
        rate_cancelled.fractional_shares,
        Some(ChildShares {
            numerator: 1,
            denominator: 3
        })
    );
    let rounded = select("14:55:00", "15:00:00");
    assert_eq!(
        (rounded.state, rounded.amount),
        (SpinOffCashState::Paid, Some(1))
    );
    assert_eq!(rounded.terms.unwrap().currency, "GBP");
    assert_eq!(
        select("14:55:00", "15:02:00").state,
        SpinOffCashState::NoPayment
    );
    assert_eq!(select("14:47:59", "14:48:00"), early);
}

#[test]
fn cash_terms_require_a_known_action_and_distinct_valid_reports() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let validate = |csv: &str| {
        portfolio_spin_off_cash_as_of(
            &universe,
            HOLDINGS,
            REPORTS,
            csv,
            time("14:55:00"),
            time("14:58:00"),
        )
    };
    let rows = validate(CASH_TERMS).unwrap();
    let whole_shares = rows.iter().find(|row| row.id == "ALFA-UNIT").unwrap();
    assert_eq!(whole_shares.state, SpinOffCashState::NoPayment);
    assert_eq!(whole_shares.amount, Some(0));
    for (fixture, error) in [
        (
            CASH_TERMS.replacen("BETA-UNIT", "NO-SUCH-ACTION", 1),
            "action ID",
        ),
        (
            CASH_TERMS.replacen("14:51:00Z", "14:24:00Z", 1),
            "distinct observation",
        ),
        (
            CASH_TERMS.replacen(",USD,3", ",USD,-3", 1),
            "nonnegative cash rate",
        ),
        (
            CASH_TERMS.replacen(",USD,3", ",usd,3", 1),
            "uppercase currency",
        ),
    ] {
        assert!(validate(&fixture).unwrap_err().contains(error));
    }
}

const BASIS_TERMS: &str = include_str!("fixtures/synthetic-spin-off-basis-terms.csv");

#[test]
fn spin_off_basis_conserves_original_amount_with_revised_terms_and_distribution() {
    use marketweft_core::{portfolio_spin_off_basis_as_of, SpinOffBasisState};
    let book = parse_universe(MEMBERSHIP).unwrap();
    let rows = |effective, known| {
        portfolio_spin_off_basis_as_of(
            &book,
            HOLDINGS,
            REPORTS,
            BASIS_TERMS,
            time(effective),
            time(known),
        )
        .unwrap()
    };
    let beta = |effective, known| {
        rows(effective, known)
            .into_iter()
            .find(|row| row.id == "BETA-UNIT")
            .unwrap()
    };
    let unavailable = beta("14:40:00", "14:27:59");
    assert_eq!(unavailable.state, SpinOffBasisState::MissingTerms);
    assert!(unavailable.terms.is_none());
    assert!(unavailable.allocation.is_none());
    let awaiting = beta("14:39:59", "14:40:00");
    assert_eq!(awaiting.state, SpinOffBasisState::AwaitingDistribution);
    assert!(awaiting.allocation.is_none());

    let before = beta("14:40:00", "14:49:59");
    assert_eq!(before.state, SpinOffBasisState::Allocated);
    assert_eq!(
        (
            before.parent_listing.as_str(),
            before.child_listing.as_str()
        ),
        ("BETA-001", "ALFA-001")
    );
    let first_terms = before.terms.unwrap();
    assert_eq!(
        (first_terms.currency.as_str(), first_terms.observed_at),
        ("USD", time("14:28:00"))
    );
    let first_allocation = before.allocation.unwrap();
    assert_eq!(first_allocation.retained_parent_basis, 750_000_003);
    assert_eq!(first_allocation.child_basis, 250_000_001);

    let postponed = beta("14:52:00", "14:52:00");
    assert_eq!(postponed.distribution_at, time("14:55:00"));
    assert_eq!(postponed.state, SpinOffBasisState::AwaitingDistribution);
    assert_eq!(postponed.terms.unwrap().currency, "EUR");
    let later = beta("14:55:00", "14:58:00");
    assert_eq!(later.state, SpinOffBasisState::Allocated);
    let terms = later.terms.unwrap();
    let allocation = later.allocation.unwrap();
    assert_eq!(allocation.child_basis, 300_000_001);
    assert_eq!(allocation.retained_parent_basis, 900_000_001);
    assert_eq!(
        allocation.child_basis + allocation.retained_parent_basis,
        terms.original_parent_basis
    );

    let other = rows("14:55:00", "14:58:00")
        .into_iter()
        .find(|row| row.id == "ALFA-UNIT")
        .unwrap();
    assert_eq!(other.child_listing, "BETA-002");
    assert_eq!(other.state, SpinOffBasisState::MissingTerms);
    let canceled = beta("14:55:00", "15:02:00");
    assert_eq!(canceled.state, SpinOffBasisState::NoDistribution);
    assert!(canceled.allocation.is_none());
    assert_eq!(
        beta("14:40:00", "14:49:59").allocation.unwrap(),
        first_allocation
    );
}

#[test]
fn spin_off_basis_validates_source_and_keeps_missing_holdings_distinct() {
    use marketweft_core::{portfolio_spin_off_basis_as_of, SpinOffBasisState};
    let book = parse_universe(MEMBERSHIP).unwrap();
    let query = |holdings: &str, basis: &str| {
        portfolio_spin_off_basis_as_of(
            &book,
            holdings,
            REPORTS,
            basis,
            time("14:55:00"),
            time("14:58:00"),
        )
    };
    let without_beta = HOLDINGS
        .lines()
        .filter(|row| !row.starts_with("DEMO-BASKET,BETA-001,"))
        .collect::<Vec<_>>()
        .join("\n");
    let unknown = query(&without_beta, BASIS_TERMS)
        .unwrap()
        .into_iter()
        .find(|row| row.id == "BETA-UNIT")
        .unwrap();
    assert_eq!(unknown.state, SpinOffBasisState::UnknownPosition);
    assert!(unknown.terms.is_some());
    assert!(unknown.allocation.is_none());

    for (before, after, message) in [
        ("BETA-UNIT", "Unknown", "action ID"),
        ("USD", "usd", "uppercase currency"),
        ("1000.000004", "-1", "original parent basis"),
        ("0.25", "1.000001", "child basis fraction"),
        ("14:28:00Z", "14:51:00Z", "distinct observation times"),
    ] {
        let invalid = BASIS_TERMS.replacen(before, after, 1);
        assert!(
            query(HOLDINGS, &invalid).unwrap_err().contains(message),
            "{message}"
        );
    }
    for (fraction, expected) in [("0", 0), ("1", 1_200_000_002)] {
        let boundary = BASIS_TERMS.replace("0.25", fraction);
        let beta = query(HOLDINGS, &boundary)
            .unwrap()
            .into_iter()
            .find(|row| row.id == "BETA-UNIT")
            .unwrap();
        let allocation = beta.allocation.unwrap();
        assert_eq!(allocation.child_basis, expected);
        assert_eq!(allocation.retained_parent_basis + expected, 1_200_000_002);
    }
}
