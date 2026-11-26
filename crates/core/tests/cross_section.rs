use marketweft_core::{
    parse_universe, CrossSectionConfig, DelistingState, LiquidityTape, PaperAction, PaperConfig,
    PriceBook, SCALE,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-listing-risk-membership.csv");
const PRICES: &str = include_str!("fixtures/synthetic-listing-risk-prices.csv");
const LIQUIDITY: &str = include_str!("fixtures/synthetic-cross-section-liquidity.csv");
const DIVIDENDS: &str = include_str!("fixtures/synthetic-cross-section-dividends.csv");
const ACTION_MEMBERSHIP: &str = include_str!("fixtures/synthetic-cross-section-membership.csv");
const DELISTING: &str = include_str!("fixtures/synthetic-cross-section-delisting.csv");

fn settings(start: i64, known: i64) -> CrossSectionConfig {
    CrossSectionConfig {
        from_at: start + 60,
        through_at: start + 360,
        known_at: start + known * 60,
        decision_seconds: 60,
        lookback_seconds: 60,
        top_listings: 1,
        target_shares: 4,
        limit_buffer_bps: 1000,
        participation_bps: 10000,
        paper: PaperConfig {
            starting_cash: i128::from(SCALE) * 1000,
            max_committed_cost: i128::from(SCALE) * 1000,
            max_position_shares: 10,
            fee_per_share: SCALE / 10,
            fee_per_order: SCALE / 2,
        },
    }
}

#[test]
fn delisting_settlement_is_causal_and_cancellation_restores_exact_basis() {
    let universe = parse_universe(ACTION_MEMBERSHIP).unwrap();
    let book = PriceBook::parse(&universe, PRICES).unwrap();
    let liquidity = LiquidityTape::parse(&universe, LIQUIDITY).unwrap();
    let start = universe.checkpoints()[0];
    let replay = |effective: i64, known: i64, terms: &str| {
        let mut config = settings(start, known);
        config.through_at = start + effective * 60;
        book.cross_section_with_actions(&liquidity, config, DIVIDENDS, terms, "USD")
            .unwrap()
    };

    let before = replay(6, 4, DELISTING);
    assert_eq!(before.positions[0].shares, 4);
    assert!(before.delisting_claims.is_empty());
    let missing = replay(6, 5, "");
    assert_eq!(
        missing.delisting_claims[0].state,
        DelistingState::MissingProceeds
    );
    assert_eq!(missing.equity, None);
    let receivable = replay(6, 5, DELISTING);
    assert!(receivable.positions.is_empty());
    assert_eq!(
        receivable.delisting_claims[0].state,
        DelistingState::Receivable
    );
    assert_eq!(receivable.delisting_claims[0].amount, Some(500_000_000));
    assert_eq!(receivable.cash, 540_600_000);
    assert_eq!(receivable.equity, Some(1_040_600_000));
    assert!(receivable.delisting_postings.is_empty());
    assert!(replay(4, 7, DELISTING).delisting_postings.is_empty());

    let paid = replay(6, 6, DELISTING);
    assert_eq!(paid.delisting_claims[0].state, DelistingState::Paid);
    assert_eq!(paid.delisting_postings[0].cash_delta, 500_000_000);
    assert_eq!(paid.cash, 1_040_600_000);
    let revised = replay(6, 7, DELISTING);
    assert_eq!(revised.delisting_postings[1].cash_delta, 20_000_000);
    assert_eq!(revised.cash, 1_056_600_000);
    let restored = replay(6, 8, DELISTING);
    assert!(restored.delisting_claims.is_empty());
    assert_eq!(restored.delisting_postings[2].cash_delta, -520_000_000);
    assert_eq!(restored.cash, 536_600_000);
    assert_eq!(restored.positions[0].shares, before.positions[0].shares);
    assert_eq!(restored.positions[0].cost, before.positions[0].cost);
    assert_eq!(restored.equity, Some(1_069_000_000));
    assert_eq!(restored.turnover, 462_000_000);
    assert_eq!(restored.fees, 1_400_000);
    assert_eq!(
        restored.events.last().unwrap().receipt.cash_delta,
        -520_000_000
    );
    assert_eq!(replay(6, 5, DELISTING), receivable);
}

#[test]
fn pays_dividends_only_on_pre_ex_shares_and_tracks_late_currency_corrections() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let book = PriceBook::parse(&universe, PRICES).unwrap();
    let liquidity = LiquidityTape::parse(&universe, LIQUIDITY).unwrap();
    let start = universe.checkpoints()[0];
    let replay = |effective: i64, known: i64| {
        let mut config = settings(start, known);
        config.through_at = start + effective * 60;
        book.cross_section_with_dividends(&liquidity, config, DIVIDENDS, "USD")
            .unwrap()
    };

    assert!(replay(6, 4).dividend_postings.is_empty());
    assert!(replay(4, 7).dividend_postings.is_empty());
    let paid = replay(6, 6);
    let payment = &paid.dividend_postings[0];
    assert_eq!(paid.dividend_postings.len(), 1);
    assert_eq!(payment.entitled_shares, 2);
    assert_eq!(payment.posted_at, start + 300);
    assert_eq!(payment.cash_delta, 4_000_000);
    assert_eq!(paid.cash, 540_600_000);
    assert_eq!(paid.equity, Some(1_073_000_000));
    assert_eq!(
        paid.events
            .iter()
            .find(|row| Some(&row.event.id) == payment.receipt_id.as_ref())
            .unwrap()
            .receipt
            .cash_delta,
        4_000_000
    );

    let revised = replay(6, 7);
    assert_eq!(revised.decisions, paid.decisions);
    assert_eq!(&revised.events[..paid.events.len()], paid.events.as_slice());
    assert_eq!(revised.dividend_postings.len(), 3);
    assert_eq!(revised.dividend_postings[1].cash_delta, -4_000_000);
    assert_eq!(revised.dividend_postings[1].currency, "USD");
    assert_eq!(revised.dividend_postings[2].cash_delta, 6_000_000);
    assert_eq!(revised.dividend_postings[2].currency, "EUR");
    assert!(revised.dividend_postings[2].receipt_id.is_none());
    assert_eq!(revised.cash, 536_600_000);
    assert_eq!(paid, replay(6, 6));
}

#[test]
fn ranking_orders_fill_only_against_later_prices_and_reconcile_fees() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let book = PriceBook::parse(&universe, PRICES).unwrap();
    let liquidity = LiquidityTape::parse(&universe, LIQUIDITY).unwrap();
    let start = universe.checkpoints()[0];
    let report = book
        .cross_section_replay(&liquidity, settings(start, 6))
        .unwrap();
    let fills: Vec<_> = report
        .events
        .iter()
        .filter_map(|entry| match &entry.event.action {
            PaperAction::Fill {
                source_id,
                price_at,
                shares,
                ..
            } => Some((source_id.as_str(), *price_at, *shares)),
            _ => None,
        })
        .collect();
    assert_eq!(
        fills,
        [
            ("Q-9007199254740995", start + 120, 2),
            ("Q-9007199254740996", start + 180, 2)
        ]
    );
    assert_eq!(report.decisions.len(), 6);
    assert_eq!(report.decisions[1].missing_count, 1);
    assert_eq!(report.positions.len(), 1);
    assert_eq!(report.positions[0].shares, 4);
    assert_eq!(report.positions[0].listing_id, "A");
    assert_eq!(report.cash, 536_600_000);
    assert_eq!(report.fees, 1_400_000);
    assert_eq!(report.equity, Some(1_069_000_000));
    let later = book
        .cross_section_replay(&liquidity, settings(start, 7))
        .unwrap();
    assert_eq!(later.decisions, report.decisions);
    assert_eq!(later.events, report.events);
    let before = book
        .cross_section_replay(&liquidity, settings(start, 1))
        .unwrap();
    assert_eq!(before.decisions.len(), 1);
    assert!(before.positions.is_empty());
    assert_eq!(before.cash, 1_000_000_000);
}

#[test]
fn unobserved_membership_never_enters_ranking_and_missing_marks_remain_explicit() {
    let reports = MEMBERSHIP.replace(
        "B-ADD,B,DEMO:BETA,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z",
        "B-ADD,B,DEMO:BETA,2025-06-02T14:03:00Z,2025-06-02T14:04:00Z",
    );
    let universe = parse_universe(&reports).unwrap();
    let revised = PRICES.replace(
        "RISK,B,2025-06-02T14:04:00Z,2025-06-02T14:04:00Z,81",
        "RISK,B,2025-06-02T14:04:00Z,2025-06-02T14:04:00Z,100",
    );
    let book = PriceBook::parse(&universe, &revised).unwrap();
    let liquidity = LiquidityTape::parse(&universe, LIQUIDITY).unwrap();
    let start = universe.checkpoints()[0];
    let report = book
        .cross_section_replay(&liquidity, settings(start, 6))
        .unwrap();
    assert_eq!(report.decisions[2].eligible_count, 1);
    assert_eq!(report.decisions[2].selected, ["A"]);
    assert_eq!(report.decisions[3].eligible_count, 2);
    assert_eq!(report.decisions[3].selected, ["B"]);
    assert!(report
        .events
        .iter()
        .any(|row| row.listing_id == "B" && row.event.observed_at == start + 240));
    let no_mark = revised
        .lines()
        .filter(|line| !line.starts_with("RISK,A,2025-06-02T14:06:00Z"))
        .collect::<Vec<_>>()
        .join("\n");
    let incomplete = PriceBook::parse(&universe, &no_mark)
        .unwrap()
        .cross_section_replay(&liquidity, settings(start, 6))
        .unwrap();
    assert!(incomplete.positions[0].mark.is_none());
    assert!(incomplete.equity.is_none());
}
