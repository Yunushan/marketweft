use marketweft_core::{parse_exact_utc, FinancialBook, Multiple, TrailingFourQuarters};

const FILINGS: &str = include_str!("fixtures/synthetic-financial-filings.csv");
const MARKET_CAPS: &str = include_str!("fixtures/synthetic-financial-market-caps.csv");
const PERIODS: &str = include_str!("fixtures/synthetic-financial-periods.csv");
const AT: i64 = 1_743_688_800; // 2025-04-03T14:00:00Z

#[test]
fn trailing_flows_require_four_available_quarters_and_replay_restatements() {
    let book = FinancialBook::parse(PERIODS, MARKET_CAPS).unwrap();
    let query = |offset| book.quarterly_as_of("DEMO-ALFA", AT, AT + offset).unwrap();
    let early = query(299);
    assert_eq!(early.trailing, TrailingFourQuarters::InsufficientQuarters);
    assert_eq!(early.quarters.len(), 3);
    let complete = query(300);
    assert_eq!(
        complete
            .quarters
            .iter()
            .map(|f| f.source_id.as_str())
            .collect::<Vec<_>>(),
        ["ALFA-Q1", "ALFA-Q2", "ALFA-Q3", "ALFA-Q4"]
    );
    assert_eq!(
        complete.trailing,
        TrailingFourQuarters::Available {
            currency: "USD",
            revenue: Some(6_000_000_000_000_010),
            common_net_income: Some(1_200_000_000_000_010),
            operating_cash_flow: Some(700_000_000_000_003),
        }
    );
    assert_eq!(query(22 * 60 - 1), complete);
    let revised = query(22 * 60);
    assert_eq!(revised.quarters[3].source_id, "ALFA-Q4-A1");
    assert_eq!(
        revised.trailing,
        TrailingFourQuarters::Available {
            currency: "USD",
            revenue: Some(8_000_000_000_000_010),
            common_net_income: None,
            operating_cash_flow: Some(-250_000_000_000_005),
        }
    );
    assert_eq!(query(300), complete);
    assert_eq!(
        book.as_of("DEMO-ALFA", AT, AT + 22 * 60)
            .unwrap()
            .filing
            .unwrap()
            .source_id,
        "ALFA-FY24-A1"
    );
    let earlier_at = parse_exact_utc("2024-12-31T23:59:59Z").unwrap();
    assert_eq!(
        book.quarterly_as_of("DEMO-ALFA", earlier_at, AT + 22 * 60)
            .unwrap()
            .quarters
            .len(),
        3
    );
}

#[test]
fn trailing_flows_reject_period_gaps_and_currency_mixes_without_losing_vintages() {
    for (changed, reason) in [
        (
            PERIODS.replace("2024-04-01,2024-06-30", "2024-04-02,2024-06-30"),
            TrailingFourQuarters::Noncontiguous,
        ),
        (
            PERIODS.replace("14:05:00Z,USD", "14:05:00Z,EUR"),
            TrailingFourQuarters::CurrencyMismatch,
        ),
    ] {
        let book = FinancialBook::parse(&changed, MARKET_CAPS).unwrap();
        let view = book.quarterly_as_of("DEMO-ALFA", AT, AT + 300).unwrap();
        assert_eq!(view.quarters.len(), 4);
        assert_eq!(view.trailing, reason);
    }
    assert!(FinancialBook::parse(&PERIODS.replace(",quarter,", ",monthly,"), MARKET_CAPS).is_err());
    let legacy = FinancialBook::parse(FILINGS, MARKET_CAPS).unwrap();
    assert!(legacy
        .quarterly_as_of("DEMO-ALFA", AT, AT)
        .unwrap()
        .quarters
        .is_empty());
}

#[test]
fn original_restatement_and_late_old_filing_are_distinct_vintages() {
    let book = FinancialBook::parse(FILINGS, MARKET_CAPS).unwrap();
    assert_eq!(
        book.issuers().collect::<Vec<_>>(),
        ["DEMO-ALFA", "DEMO-BETA"]
    );
    let query = |known| book.as_of("DEMO-ALFA", AT, AT + known).unwrap();
    let missing_cap = query(59);
    assert_eq!(missing_cap.filing.unwrap().source_id, "ALFA-FY24");
    assert_eq!(missing_cap.price_earnings, Multiple::MissingMarketCap);
    let original = query(60);
    assert_eq!(original.price_earnings, Multiple::Value(10_000_000));
    assert_eq!(original.price_sales, Multiple::Value(2_000_000));
    assert_eq!(original.price_book, Multiple::Value(4_000_000));
    assert_eq!(query(15 * 60), original);
    assert_eq!(query(20 * 60 - 1), original);
    let revised = query(20 * 60);
    assert_eq!(revised.filing.unwrap().source_id, "ALFA-FY24-A1");
    assert_eq!(
        revised.filing.unwrap().operating_cash_flow,
        Some(-250_000_000_000_000)
    );
    assert_eq!(revised.price_earnings, Multiple::Value(15_000_000));
    assert_eq!(revised.price_sales, Multiple::Value(1_500_000));
    assert_eq!(revised.price_book, Multiple::MissingDenominator);
    assert_eq!(query(25 * 60), revised);
    assert_eq!(query(35 * 60).price_earnings, Multiple::Value(20_000_000));
    assert_eq!(query(35 * 60).market_cap.unwrap().source_id, "ALFA-CAP-R1");
    assert_eq!(query(60), original);
}

#[test]
fn fiscal_cutoff_issuer_and_currency_bound_the_report() {
    let book = FinancialBook::parse(FILINGS, MARKET_CAPS).unwrap();
    let older = book.as_of("DEMO-ALFA", 1_735_689_599, AT).unwrap();
    assert_eq!(older.filing.unwrap().source_id, "ALFA-FY23");
    assert_eq!(older.market_cap, None);
    let before_all = book.as_of("DEMO-ALFA", 10, AT).unwrap();
    assert_eq!(before_all.price_book, Multiple::MissingFiling);
    let mismatch = book.as_of("DEMO-ALFA", AT + 30 * 60, AT + 30 * 60).unwrap();
    assert_eq!(mismatch.price_book, Multiple::CurrencyMismatch);
    assert_eq!(mismatch.market_cap.unwrap().currency, "EUR");
    let beta = book.as_of("DEMO-BETA", AT, AT).unwrap();
    assert_eq!(beta.price_earnings, Multiple::NonPositiveDenominator);
    assert_eq!(beta.price_sales, Multiple::MissingDenominator);
    assert_eq!(beta.price_book, Multiple::Value(4_000_000));
    assert!(book.as_of("UNKNOWN", AT, AT).is_err());
}

#[test]
fn input_validation_rejects_ambiguous_or_out_of_range_records() {
    let reversed = format!(
        "{}\n{}",
        FILINGS.lines().next().unwrap(),
        FILINGS
            .split_once('\n')
            .unwrap()
            .1
            .lines()
            .rev()
            .collect::<Vec<_>>()
            .join("\n")
    );
    let original = FinancialBook::parse(FILINGS, MARKET_CAPS).unwrap();
    let reordered = FinancialBook::parse(&reversed, MARKET_CAPS).unwrap();
    assert_eq!(
        original.as_of("DEMO-ALFA", AT, AT + 1500),
        reordered.as_of("DEMO-ALFA", AT, AT + 1500)
    );
    let duplicate = format!("{FILINGS}{}\n", FILINGS.lines().nth(1).unwrap());
    for broken in [
        duplicate,
        FILINGS.replacen("2024-02-20T14:00:00Z,USD", "2024-02-20T13:59:59Z,USD", 1),
        FILINGS.replacen("2025-02-20T14:01:00Z,USD", "2025-02-20T14:01:00Z,usd", 1),
        FILINGS.replacen(
            "2024-01-01,2024-12-31,2025-01",
            "2024-01-02,2024-12-31,2025-01",
            1,
        ),
        FILINGS.replacen(",5000000000,", ",1000000000000000000001,", 1),
    ] {
        assert!(FinancialBook::parse(&broken, MARKET_CAPS).is_err());
    }
    for broken in [
        MARKET_CAPS.replacen("DEMO-ALFA", "DEMO-UNKNOWN", 1),
        MARKET_CAPS.replacen(",12000000000", ",0", 1),
        MARKET_CAPS.replacen("14:01:00Z,USD", "13:59:59Z,USD", 1),
    ] {
        assert!(FinancialBook::parse(FILINGS, &broken).is_err());
    }
}
