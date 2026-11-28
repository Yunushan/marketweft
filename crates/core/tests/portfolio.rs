use marketweft_core::{
    parse_universe, PortfolioBook, PortfolioCurrency, PortfolioDividendState,
    PortfolioIncomeSnapshot, PortfolioSnapshot, PortfolioState,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const PRICES: &str = include_str!("fixtures/synthetic-universe-prices.csv");
const DELISTING: &str = include_str!("fixtures/synthetic-delisting-terms.csv");
const HOLDINGS: &str = include_str!("fixtures/synthetic-portfolio-holdings.csv");
const DIVIDENDS: &str = include_str!("fixtures/synthetic-portfolio-dividends.csv");
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
fn equity_concentration_reranks_late_marks_and_keeps_delisted_cash_outside_share_weights() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let portfolio = PortfolioBook::parse(&universe, HOLDINGS, PRICES, DELISTING).unwrap();
    let summary = |effective, known| {
        portfolio
            .as_of(t(effective), t(known))
            .equity_concentration()
    };
    let missing = summary(10, 10);
    assert_eq!(missing[0].gross_mark, Some(204 * MILLION));
    assert_eq!(missing[0].positions[0].weight_micros, Some(100_000_000));
    assert_eq!(missing[0].positions[1].listing_id, "BETA-001");
    assert_eq!(missing[0].positions[1].rank, None);
    let listed = summary(10, 12);
    assert_eq!(listed[0].gross_mark, Some(764 * MILLION));
    assert_eq!(listed[0].positions[0].listing_id, "BETA-001");
    assert_eq!(listed[0].positions[0].rank, Some(1));
    assert_eq!(listed[0].positions[0].weight_micros, Some(73_298_429));
    assert_eq!(listed[0].positions[1].weight_micros, Some(26_701_571));
    let revised = summary(10, 16);
    assert_eq!(revised[0].gross_mark, Some(709 * MILLION));
    assert_eq!(revised[0].positions[0].weight_micros, Some(71_227_080));
    assert_eq!(summary(10, 10), missing);

    let unobserved = summary(6, 6);
    assert_eq!(unobserved[0].currency, None);
    assert_eq!(unobserved[0].positions[0].listing_id, "BETA-001");
    let reused = summary(45, 45);
    assert_eq!(reused[0].currency, Some("EUR"));
    assert_eq!(reused[0].gross_mark, Some(225 * MILLION));
    assert_eq!(reused[0].positions[0].listing_id, "BETA-002");
    assert_eq!(reused[1].currency, Some("USD"));
    assert_eq!(reused[1].gross_mark, None);
    assert_eq!(reused[1].positions[0].listing_id, "ALFA-001");
    assert!(reused.iter().all(|group| group
        .positions
        .iter()
        .all(|row| row.listing_id != "BETA-001")));
}

#[test]
fn concentration_comparison_keeps_unknown_marks_and_absent_positions_distinct() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let portfolio = PortfolioBook::parse(&universe, HOLDINGS, PRICES, DELISTING).unwrap();
    let missing = portfolio.as_of(t(10), t(10));
    let late = portfolio.as_of(t(10), t(12));
    let corrected = portfolio.as_of(t(10), t(16));
    let first = missing.compare_equity_concentration(&late);
    let [alfa, beta] = first.as_slice() else {
        panic!("expected two USD listings");
    };
    assert_eq!(alfa.listing_id, "ALFA-001");
    assert_eq!(alfa.rank_improvement, Some(-1));
    assert_eq!(alfa.weight_change_micros, Some(-73_298_429));
    assert_eq!(beta.listing_id, "BETA-001");
    assert_eq!(beta.before.unwrap().mark, None);
    assert_eq!(beta.after.unwrap().mark, Some(560 * MILLION));
    assert_eq!(beta.weight_change_micros, None);

    let revision = late.compare_equity_concentration(&corrected);
    assert_eq!(revision[0].weight_change_micros, Some(2_071_349));
    assert_eq!(revision[1].weight_change_micros, Some(-2_071_349));
    assert_eq!(revision[1].rank_improvement, Some(0));
    let reverse = corrected.compare_equity_concentration(&late);
    assert_eq!(reverse[1].weight_change_micros, Some(2_071_349));

    let reused = late.compare_equity_concentration(&portfolio.as_of(t(45), t(45)));
    let [new_beta, _alfa, old_beta] = reused.as_slice() else {
        panic!("expected the EUR and USD listings");
    };
    assert_eq!(
        (new_beta.currency, new_beta.listing_id),
        (Some("EUR"), "BETA-002")
    );
    assert_eq!(new_beta.before, None);
    assert_eq!(new_beta.after.unwrap().weight_micros, Some(100_000_000));
    assert_eq!(
        (old_beta.currency, old_beta.listing_id),
        (Some("USD"), "BETA-001")
    );
    assert_eq!(old_beta.after, None);
    assert_eq!(old_beta.weight_change_micros, None);
}

#[test]
fn concentration_keeps_signed_marks_equal_magnitudes_and_all_zero_exposure_distinct() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let portfolio = PortfolioBook::parse(&universe, HOLDINGS, PRICES, DELISTING).unwrap();
    let mut snapshot = portfolio.as_of(t(10), t(16));
    snapshot.rows[1].value = Some(-204 * MILLION);
    let groups = snapshot.equity_concentration();
    let usd = &groups[0];
    assert_eq!(usd.gross_mark, Some(408 * MILLION));
    assert_eq!(
        usd.positions
            .iter()
            .map(|row| (row.listing_id, row.mark, row.rank, row.weight_micros))
            .collect::<Vec<_>>(),
        [
            ("ALFA-001", Some(204 * MILLION), Some(1), Some(50_000_000)),
            ("BETA-001", Some(-204 * MILLION), Some(2), Some(50_000_000))
        ]
    );

    for row in &mut snapshot.rows {
        row.value = Some(0);
    }
    let groups = snapshot.equity_concentration();
    assert_eq!(groups[0].gross_mark, Some(0));
    assert!(groups[0]
        .positions
        .iter()
        .all(|row| row.mark == Some(0) && row.rank.is_none() && row.weight_micros.is_none()));
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

fn income(snapshot: &PortfolioIncomeSnapshot<'_>, currency: &str) -> (i128, i128) {
    let totals = snapshot.totals.get(currency).copied().unwrap_or_default();
    (totals.receivable, totals.cash)
}

#[test]
fn portfolio_dividends_respect_ex_date_late_reports_and_listing_identity() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let holdings =
        format!("{HOLDINGS}\nDEMO-BASKET,ALFA-001,2025-06-02T14:10:00Z,2025-06-02T14:10:00Z,3,USD");
    let book = PortfolioBook::parse_with_income(&universe, &holdings, PRICES, DELISTING, DIVIDENDS)
        .unwrap();
    assert!(book.as_of_with_income(t(10), t(2)).dividends.is_empty());
    assert!(book.as_of_with_income(t(9), t(10)).dividends.is_empty());

    let ex = book.as_of_with_income(t(10), t(10));
    assert_eq!(ex.dividends[0].entitled_shares, Some(2));
    assert_eq!(income(&ex, "USD"), (2_500_000, 0));
    let before_delisting_report = book.as_of_with_income(t(34), t(34));
    assert_eq!(income(&before_delisting_report, "USD"), (16_500_000, 0));
    let known_delisting = book.as_of_with_income(t(34), t(35));
    assert_eq!(income(&known_delisting, "USD"), (7_500_000, 0));
    assert!(known_delisting
        .dividends
        .iter()
        .any(|row| row.report.id == "BETA-POST-DELIST"
            && row.state == PortfolioDividendState::NoPayment));
    let open_claim = book.as_of_with_income(t(37), t(37));
    assert_eq!(
        funds(&open_claim.portfolio, "USD").delisting_receivable,
        70 * MILLION
    );
    assert_eq!(income(&open_claim, "USD"), (7_500_000, 0));

    let paid = book.as_of_with_income(t(55), t(55));
    assert_eq!(income(&paid, "USD"), (0, 5 * MILLION));
    assert_eq!(income(&paid, "EUR"), (0, 8 * MILLION));
    assert_eq!(
        paid.dividends
            .iter()
            .filter(|row| row.report.id == "BETA-PAYOUT")
            .count(),
        2
    );
    let hindsight = book.as_of_with_income(t(40), t(58));
    assert_eq!(income(&hindsight, "USD"), (4 * MILLION, 0));
    assert_eq!(income(&hindsight, "EUR"), (2 * MILLION, 0));
    let corrected = book.as_of_with_income(t(55), t(58));
    assert_eq!(income(&corrected, "USD"), (0, 4 * MILLION));
    assert_eq!(income(&book.as_of_with_income(t(55), t(61)), "USD"), (0, 0));
    assert_eq!(book.as_of_with_income(t(55), t(55)), paid);
}

#[test]
fn portfolio_dividends_keep_unknown_holdings_distinct_and_validate_report_identity() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let holdings = HOLDINGS
        .lines()
        .filter(|row| !row.contains("ALFA-001"))
        .collect::<Vec<_>>()
        .join("\n");
    let book = PortfolioBook::parse_with_income(&universe, &holdings, PRICES, DELISTING, DIVIDENDS)
        .unwrap();
    let ex = book.as_of_with_income(t(10), t(10));
    assert_eq!(
        ex.dividends[0].state,
        PortfolioDividendState::UnknownPosition
    );
    assert_eq!(ex.dividends[0].amount, None);
    assert_eq!(income(&ex, "USD"), (0, 0));
    assert!(PortfolioBook::parse_with_income(
        &universe,
        HOLDINGS,
        PRICES,
        DELISTING,
        &DIVIDENDS.replace("ALFA-001", "UNKNOWN")
    )
    .is_err());
    assert!(PortfolioBook::parse_with_income(
        &universe,
        HOLDINGS,
        PRICES,
        DELISTING,
        &DIVIDENDS.replace("14:52:00Z", "14:03:00Z")
    )
    .is_err());
}

#[test]
fn portfolio_replays_reported_dividend_withholding_and_net_cash_at_each_cutoff() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let dividends = include_str!("fixtures/synthetic-portfolio-dividend-withholding.csv");
    let book = PortfolioBook::parse_with_income(&universe, HOLDINGS, PRICES, DELISTING, dividends)
        .unwrap();
    let before_ex = book.as_of_with_income(t(9), t(10));
    assert!(before_ex.has_reported_withholding);
    assert!(before_ex.dividends.is_empty());
    assert!(book.as_of_with_income(t(10), t(2)).dividends.is_empty());

    let ex = book.as_of_with_income(t(10), t(10));
    let alfa = &ex.dividends[0];
    assert_eq!(alfa.state, PortfolioDividendState::Receivable);
    assert_eq!(alfa.withholding_per_share, Some(250_000));
    assert_eq!(
        (alfa.amount, alfa.paid_withholding, alfa.net_paid),
        (Some(2_500_000), None, None)
    );
    assert_eq!(income(&ex, "USD"), (2_500_000, 0));
    assert_eq!(ex.totals["USD"].withholding, 0);

    let first_pay = book.as_of_with_income(t(45), t(45));
    assert_eq!(income(&first_pay, "USD"), (5_000_000, 2_000_000));
    assert_eq!(first_pay.totals["USD"].withholding, 500_000);
    let refunded = book.as_of_with_income(t(45), t(48));
    assert_eq!(income(&refunded, "USD"), (5_000_000, 2_300_000));
    assert_eq!(refunded.totals["USD"].withholding, 200_000);
    assert_eq!(book.as_of_with_income(t(45), t(45)), first_pay);

    let full_withholding = book.as_of_with_income(t(50), t(50));
    let beta = &full_withholding.dividends[1];
    assert_eq!(beta.state, PortfolioDividendState::Paid);
    assert_eq!(beta.amount, Some(5_000_000));
    assert_eq!(beta.paid_withholding, Some(5_000_000));
    assert_eq!(beta.net_paid, Some(0));
    assert_eq!(income(&full_withholding, "USD"), (0, 2_300_000));
    assert_eq!(full_withholding.totals["USD"].withholding, 5_200_000);

    let rebooked = book.as_of_with_income(t(55), t(55));
    assert_eq!(income(&rebooked, "CAD"), (0, 1_600_000));
    assert_eq!(rebooked.totals["CAD"].withholding, 400_000);
    assert_eq!(income(&rebooked, "EUR"), (0, 5_400_000));
    assert_eq!(rebooked.totals["EUR"].withholding, 600_000);
    assert_eq!(income(&rebooked, "USD"), (0, 0));
    assert_eq!(rebooked.totals["USD"].withholding, 5_000_000);
    let late_holdings = book.as_of_with_income(t(55), t(58));
    assert_eq!(late_holdings.dividends[1].entitled_shares, Some(8));
    assert_eq!(late_holdings.totals["USD"].withholding, 4_000_000);
    let cancelled = book.as_of_with_income(t(55), t(61));
    assert_eq!(
        cancelled.dividends[1].state,
        PortfolioDividendState::NoPayment
    );
    assert!(!cancelled.totals.contains_key("USD"));
    assert_eq!(book.as_of_with_income(t(55), t(55)), rebooked);

    let unknown_holdings = HOLDINGS
        .lines()
        .filter(|line| !line.contains("ALFA-001"))
        .collect::<Vec<_>>()
        .join("\n");
    let unknown = PortfolioBook::parse_with_income(
        &universe,
        &unknown_holdings,
        PRICES,
        DELISTING,
        dividends,
    )
    .unwrap();
    let snapshot = unknown.as_of_with_income(t(45), t(45));
    let alfa = &snapshot.dividends[0];
    assert_eq!(alfa.state, PortfolioDividendState::UnknownPosition);
    assert_eq!(
        (alfa.amount, alfa.paid_withholding, alfa.net_paid),
        (None, None, None)
    );

    for invalid in [
        ",USD,1.25,1.26",
        ",USD,1.25,-0.01",
        ",USD,1.25",
        ",USD,1.25,0.25,0",
    ] {
        let input = dividends.replacen(",USD,1.25,0.25", invalid, 1);
        assert!(
            PortfolioBook::parse_with_income(&universe, HOLDINGS, PRICES, DELISTING, &input)
                .is_err()
        );
    }
}
