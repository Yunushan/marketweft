use marketweft_core::{
    parse_universe, PortfolioBook, PortfolioCurrency, PortfolioSnapshot, PortfolioState,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const PRICES: &str = include_str!("fixtures/synthetic-universe-prices.csv");
const DELISTING: &str = include_str!("fixtures/synthetic-delisting-terms.csv");
const HOLDINGS: &str = include_str!("fixtures/synthetic-portfolio-holdings.csv");
const BASE: i64 = 1_748_872_800;
const MILLION: i128 = 1_000_000;
fn t(minute: i64) -> i64 {
    BASE + minute * 60
}
fn funds(snapshot: &PortfolioSnapshot<'_>, currency: &str) -> PortfolioCurrency {
    snapshot.totals.get(currency).copied().unwrap_or_default()
}

#[test]
fn valuation_tracks_open_holdings_late_closes_and_unobserved_listings() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let portfolio = PortfolioBook::parse(&universe, HOLDINGS, PRICES, DELISTING).unwrap();
    assert_eq!(portfolio.as_of(t(5), t(5)).rows.len(), 1);
    let early = portfolio.as_of(t(6), t(6));
    assert_eq!(early.rows[1].state, PortfolioState::ListingUnobserved);
    let missing = portfolio.as_of(t(10), t(10));
    assert_eq!(missing.rows[1].state, PortfolioState::MissingClose);
    assert_eq!(missing.unvalued_positions, 1);
    assert_eq!(funds(&missing, "USD").shares_value, 204 * MILLION);
    let observed = portfolio.as_of(t(10), t(12));
    assert_eq!(observed.rows[1].price.unwrap().observed_at, t(12));
    assert_eq!(funds(&observed, "USD").shares_value, 764 * MILLION);
    assert_eq!(observed.unvalued_positions, 0);
    let revised = portfolio.as_of(t(10), t(16));
    assert_eq!(funds(&revised, "USD").shares_value, 709 * MILLION);
    assert_eq!(portfolio.as_of(t(10), t(10)), missing);
    let removed_from_universe = portfolio.as_of(t(25), t(25));
    assert_eq!(
        removed_from_universe.rows[0].state,
        PortfolioState::MarkedShares
    );
    assert_eq!(
        funds(&removed_from_universe, "USD").shares_value,
        750 * MILLION
    );
}

#[test]
fn delisting_proceeds_follow_held_lots_and_currency_without_inheriting_a_reused_ticker() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let portfolio = PortfolioBook::parse(&universe, HOLDINGS, PRICES, DELISTING).unwrap();
    let unknown = portfolio.as_of(t(35), t(35));
    assert_eq!(unknown.rows[1].state, PortfolioState::MissingProceeds);
    assert_eq!(unknown.rows[1].shares, 10);
    assert_eq!(unknown.rows[1].value, None);
    let unrecognized = portfolio.as_of(t(37), t(34));
    assert_eq!(unrecognized.rows[1].state, PortfolioState::MissingClose);
    let recognized = portfolio.as_of(t(37), t(37));
    assert_eq!(funds(&recognized, "USD").delisting_receivable, 70 * MILLION);
    let reused = portfolio.as_of(t(45), t(45));
    assert_eq!(reused.rows[2].listing_id, "BETA-002");
    assert_eq!(reused.rows[2].state, PortfolioState::MarkedShares);
    assert_eq!(reused.rows[1].instrument, reused.rows[2].instrument);
    assert_eq!(funds(&reused, "EUR").shares_value, 225 * MILLION);
    assert_eq!(funds(&reused, "USD").delisting_receivable, 70 * MILLION);
    let paid = portfolio.as_of(t(50), t(50));
    assert_eq!(funds(&paid, "USD").shares_value, 214 * MILLION);
    assert_eq!(funds(&paid, "USD").delisting_cash, 70 * MILLION);
    assert_eq!(
        funds(&portfolio.as_of(t(55), t(55)), "USD").delisting_cash,
        80 * MILLION
    );
    let late = portfolio.as_of(t(58), t(58));
    assert_eq!(late.rows[1].shares, 8);
    assert_eq!(late.rows[1].position_observed_at, t(58));
    assert_eq!(funds(&late, "USD").delisting_cash, 64 * MILLION);
    let euro_receivable = portfolio.as_of(t(61), t(61));
    assert_eq!(funds(&euro_receivable, "USD").delisting_cash, 0);
    assert_eq!(
        funds(&euro_receivable, "EUR").delisting_receivable,
        72 * MILLION
    );
    let euro_paid = portfolio.as_of(t(64), t(64));
    assert_eq!(funds(&euro_paid, "EUR").delisting_cash, 72 * MILLION);
    assert_eq!(portfolio.as_of(t(65), t(65)).rows[1].value, Some(0));
    assert_eq!(portfolio.as_of(t(50), t(50)), paid);
}

#[test]
fn portfolio_rejects_unknown_listing_ids_and_conflicting_input_evidence() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    for input in [
        HOLDINGS.replace("BETA-001", "UNLISTED"),
        HOLDINGS.replace(",8,USD", ",8,EUR"),
        HOLDINGS.replace("T14:58:00Z,8", "T14:06:00Z,8"),
        HOLDINGS.replace("T14:58:00Z,8", "T14:05:00Z,8"),
    ] {
        assert!(PortfolioBook::parse(&universe, &input, PRICES, DELISTING).is_err());
    }
}
