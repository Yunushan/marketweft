use marketweft_core::{
    parse_exact_utc, parse_universe, portfolio_capital_returns_as_of, CapitalReturnBasis,
    PortfolioDividendState,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const HOLDINGS: &str = include_str!("fixtures/synthetic-rights-holdings.csv");
const RETURNS: &str = include_str!("fixtures/synthetic-capital-returns.csv");
const BASIS: &str = include_str!("fixtures/synthetic-capital-return-basis.csv");

fn utc(time: &str) -> i64 {
    parse_exact_utc(&format!("2025-06-02T{time}Z")).unwrap()
}

#[test]
fn revises_cash_entitlement_and_basis_at_independent_cutoffs() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let run = |effective, known| {
        portfolio_capital_returns_as_of(
            &universe,
            HOLDINGS,
            RETURNS,
            Some(BASIS),
            utc(effective),
            utc(known),
        )
        .unwrap()
    };
    assert!(run("14:17:59", "15:04:00").is_empty());
    assert!(run("14:50:00", "14:12:59").is_empty());
    let pending = run("14:49:59", "14:49:00");
    assert_eq!(pending[0].state, PortfolioDividendState::Receivable);
    assert_eq!(pending[0].entitled_shares, Some(10));
    assert_eq!(pending[0].amount, Some(25_000_000));
    assert!(pending[0].basis.is_none());
    assert!(run("14:50:00", "14:39:59")[0].basis.is_none());

    let original = run("14:50:00", "14:49:00");
    assert_eq!(original[0].state, PortfolioDividendState::Paid);
    assert_eq!(
        original[0].basis,
        Some(CapitalReturnBasis {
            observed_at: utc("14:40:00"),
            before: 30_000_000,
            reduction: 25_000_000,
            remaining: 5_000_000,
            excess: 0,
        })
    );
    let revised = run("14:50:00", "14:55:00")[0].basis.unwrap();
    assert_eq!(
        (
            revised.before,
            revised.reduction,
            revised.remaining,
            revised.excess
        ),
        (10_000_000, 10_000_000, 0, 15_000_000)
    );

    let rescheduled = run("14:59:59", "14:58:00");
    assert_eq!(rescheduled[0].state, PortfolioDividendState::Receivable);
    assert_eq!(rescheduled[0].report.currency, "EUR");
    assert_eq!(rescheduled[0].entitled_shares, Some(8));
    assert_eq!(rescheduled[0].amount, Some(24_000_008));
    assert!(run("15:00:00", "15:01:59")[0].basis.is_none());
    assert_eq!(
        run("15:00:00", "15:02:00")[0].basis,
        Some(CapitalReturnBasis {
            observed_at: utc("15:02:00"),
            before: 8_125_001,
            reduction: 8_125_001,
            remaining: 0,
            excess: 15_875_007,
        })
    );
    let withdrawn = run("15:00:00", "15:04:00");
    assert_eq!(withdrawn[0].state, PortfolioDividendState::NoPayment);
    assert_eq!(withdrawn[0].amount, Some(0));
    assert!(withdrawn[0].basis.is_none());
    assert_eq!(run("14:50:00", "14:49:00"), original);
}

#[test]
fn separates_unavailable_holdings_and_basis_from_explicit_zero() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let query = |holdings: &str, basis: Option<&str>| {
        portfolio_capital_returns_as_of(
            &universe,
            holdings,
            RETURNS,
            basis,
            utc("14:50:00"),
            utc("14:49:00"),
        )
    };
    let missing = HOLDINGS.lines().next().unwrap();
    let unknown = query(missing, Some(BASIS)).unwrap();
    assert_eq!(unknown[0].state, PortfolioDividendState::UnknownPosition);
    assert_eq!(unknown[0].amount, None);
    let zero_shares = HOLDINGS.replace(",10,USD", ",0,USD");
    assert_eq!(query(&zero_shares, Some(BASIS)).unwrap()[0].amount, Some(0));
    assert_eq!(query(HOLDINGS, None).unwrap()[0].basis, None);
    let zero_basis = BASIS.replace("USD,30", "USD,0");
    let exposed = query(HOLDINGS, Some(&zero_basis)).unwrap()[0]
        .basis
        .unwrap();
    assert_eq!(
        (exposed.reduction, exposed.remaining, exposed.excess),
        (0, 0, 25_000_000)
    );
    for (original, replacement, message) in [
        ("ALFA-ROC", "MISSING-ROC", "listing and action"),
        ("USD,30", "USD,-30", "nonnegative basis"),
        ("USD,30", "USD,0.0000001", "six decimal places"),
        ("EUR,8.125001", "eur,8.125001", "basis currency"),
    ] {
        let invalid = BASIS.replace(original, replacement);
        assert!(query(HOLDINGS, Some(&invalid))
            .unwrap_err()
            .contains(message));
    }
}
