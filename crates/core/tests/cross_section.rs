use marketweft_core::{
    parse_universe, CrossSectionActionSources, CrossSectionCandidate, CrossSectionConfig,
    CrossSectionWalkConfig, DelistingState, LiquidityTape, PaperAction, PaperConfig,
    PortfolioDividendState, PriceBook, SuccessorShareState, SCALE,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-listing-risk-membership.csv");
const PRICES: &str = include_str!("fixtures/synthetic-listing-risk-prices.csv");
const LIQUIDITY: &str = include_str!("fixtures/synthetic-cross-section-liquidity.csv");
const DIVIDENDS: &str = include_str!("fixtures/synthetic-cross-section-dividends.csv");
const ACTION_MEMBERSHIP: &str = include_str!("fixtures/synthetic-cross-section-membership.csv");
const DELISTING: &str = include_str!("fixtures/synthetic-cross-section-delisting.csv");
const WALK_LIQUIDITY: &str = include_str!("fixtures/synthetic-cross-section-walk-liquidity.csv");
const SUCCESSORS: &str = include_str!("fixtures/synthetic-paper-successor-shares.csv");
const CAPITAL_RETURNS: &str = include_str!("fixtures/synthetic-paper-capital-returns.csv");

const CANDIDATES: [CrossSectionCandidate; 2] = [
    CrossSectionCandidate {
        top_listings: 2,
        lookback_seconds: 60,
    },
    CrossSectionCandidate {
        top_listings: 1,
        lookback_seconds: 60,
    },
];

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
fn cross_section_folds_freeze_training_and_test_disjoint_windows_on_new_accounts() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let liquidity = LiquidityTape::parse(&universe, WALK_LIQUIDITY).unwrap();
    let start = universe.checkpoints()[0];
    let run = |prices: &str, known| {
        PriceBook::parse(&universe, prices)
            .unwrap()
            .cross_section_walk_forward(
                &liquidity,
                CrossSectionWalkConfig {
                    replay: settings(start, known),
                    training_decisions: 2,
                    test_decisions: 2,
                    candidates: &CANDIDATES,
                    corporate: None,
                },
            )
            .unwrap()
    };
    assert!(run(PRICES, 3).is_empty());
    let first = run(PRICES, 4);
    let all = run(PRICES, 6);
    assert_eq!(first, all[..1]);
    assert_eq!(all, run(PRICES, 7));
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].training_through, start + 120);
    assert_eq!(all[0].test_from, start + 180);
    assert_eq!(all[0].test_through, start + 240);
    assert_eq!(all[1].test_from, start + 300);
    let winners = &all[0].training_scores;
    assert_eq!(winners[0].candidate, CANDIDATES[1]);
    assert_eq!(winners[0].equity, Some(999_300_000));
    assert_eq!(winners[1].equity, None);
    assert_eq!(winners[1].missing_observations, 1);
    let test = all[0].test_score.as_ref().unwrap();
    assert_eq!(test.candidate, winners[0].candidate);
    assert_eq!(test.accepted_fills, 1);
    assert_eq!(test.turnover, 484_000_000);
    assert_eq!(test.fees, 900_000);
    assert_eq!(test.equity, Some(999_100_000));
    let revised_prices = PRICES.replace(
        "RISK,A,2025-06-02T14:04:00Z,2025-06-02T14:04:00Z,121",
        "RISK,A,2025-06-02T14:04:00Z,2025-06-02T14:04:00Z,127",
    );
    let revised = run(&revised_prices, 6);
    assert_eq!(revised[0].training_scores, all[0].training_scores);
    assert_eq!(
        revised[0].test_score.as_ref().unwrap().equity,
        Some(1_023_100_000)
    );
}

#[test]
fn cross_section_folds_reuse_observed_corporate_cash_in_test_accounts() {
    let universe = parse_universe(ACTION_MEMBERSHIP).unwrap();
    let prices = PriceBook::parse(&universe, PRICES).unwrap();
    let liquidity = LiquidityTape::parse(&universe, WALK_LIQUIDITY).unwrap();
    let request = CrossSectionWalkConfig {
        replay: settings(universe.checkpoints()[0], 8),
        training_decisions: 3,
        test_decisions: 3,
        candidates: &CANDIDATES,
        corporate: Some(CrossSectionActionSources {
            dividends: DIVIDENDS,
            delistings: DELISTING,
            account_currency: "USD",
        }),
    };
    let folded = prices
        .cross_section_walk_forward(&liquidity, request)
        .unwrap();
    assert_eq!(folded.len(), 1);
    assert_eq!(folded[0].training_scores[0].candidate, CANDIDATES[1]);
    let test = folded[0].test_score.as_ref().unwrap();
    assert_eq!(test.accepted_fills, 1);
    assert_eq!(test.cash, 1_015_100_000);
    assert_eq!(test.equity, Some(1_015_100_000));
    let capital_returns = CAPITAL_RETURNS
        .replace("14:05:00Z", "14:06:00Z")
        .replace("14:03:00Z", "14:05:00Z");
    let with_return = prices
        .cross_section_walk_with_distributions(&liquidity, request, "", &capital_returns)
        .unwrap();
    assert_eq!(with_return[0].training_scores, folded[0].training_scores);
    let test_with_return = with_return[0].test_score.as_ref().unwrap();
    assert_eq!(test_with_return.cash, test.cash + 10_000_000);
    assert_eq!(test_with_return.equity, Some(1_025_100_000));
    let no_actions = prices
        .cross_section_walk_forward(
            &liquidity,
            CrossSectionWalkConfig {
                corporate: None,
                ..request
            },
        )
        .unwrap();
    assert_eq!(no_actions[0].test_score.as_ref().unwrap().equity, None);
    let candidates = [CANDIDATES[0], CANDIDATES[0]];
    assert!(prices
        .cross_section_walk_forward(
            &liquidity,
            CrossSectionWalkConfig {
                candidates: &candidates,
                ..request
            }
        )
        .is_err());
}

#[test]
fn cross_section_capital_returns_use_pre_ex_fills_and_causal_cash_movements() {
    let universe = parse_universe(ACTION_MEMBERSHIP).unwrap();
    let book = PriceBook::parse(&universe, PRICES).unwrap();
    let liquidity = LiquidityTape::parse(&universe, LIQUIDITY).unwrap();
    let start = universe.checkpoints()[0];
    let replay = |effective: i64, known, capital_returns| {
        let mut config = settings(start, known);
        config.through_at = start + effective * 60;
        book.cross_section_with_distributions(
            &liquidity,
            config,
            CrossSectionActionSources {
                account_currency: "USD",
                dividends: DIVIDENDS,
                delistings: DELISTING,
            },
            "",
            capital_returns,
        )
        .unwrap()
    };
    let before_ex = replay(6, 2, CAPITAL_RETURNS);
    assert!(before_ex.capital_return_claims.is_empty());
    assert!(before_ex.capital_return_postings.is_empty());
    assert!(replay(2, 8, CAPITAL_RETURNS)
        .capital_return_claims
        .is_empty());
    let before_payment = replay(4, 4, CAPITAL_RETURNS);
    let baseline = replay(4, 4, "");
    let claim = &before_payment.capital_return_claims[0];
    assert_eq!(claim.entitled_shares, 2);
    assert_eq!(claim.amount, 5_000_000);
    assert_eq!(claim.state, PortfolioDividendState::Receivable);
    assert_eq!(before_payment.positions[0].shares, 4);
    assert_eq!(before_payment.cash, baseline.cash);
    assert_eq!(
        before_payment.equity,
        baseline.equity.map(|value| value + 5_000_000)
    );
    assert!(before_payment.capital_return_postings.is_empty());
    let entitlement = before_payment
        .events
        .iter()
        .find(|row| Some(&row.event.id) == claim.position_receipt_id.as_ref())
        .unwrap();
    assert!(matches!(
        entitlement.event.action,
        PaperAction::Fill { shares: 2, .. }
    ));
    assert_eq!(entitlement.event.observed_at, start + 120);
    let payment = replay(6, 6, CAPITAL_RETURNS);
    assert_eq!(
        payment.capital_return_claims[0].state,
        PortfolioDividendState::Paid
    );
    assert_eq!(payment.cash, 1_045_600_000);
    assert_eq!(payment.capital_return_postings[0].cash_delta, 5_000_000);
    assert_eq!(payment.capital_return_postings[0].posted_at, start + 300);
    let receipt = payment.capital_return_postings[0]
        .receipt_id
        .as_deref()
        .unwrap();
    assert!(payment.events.iter().any(|row| row.event.id == receipt
        && matches!(row.event.action, PaperAction::CorporateCash { .. })));
    assert_eq!(replay(4, 6, CAPITAL_RETURNS).cash, baseline.cash);
    let revision = replay(6, 7, CAPITAL_RETURNS);
    let currencies = revision
        .capital_return_postings
        .iter()
        .map(|row| {
            (
                row.currency.as_str(),
                row.cash_delta,
                row.receipt_id.is_some(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(
        currencies,
        [
            ("USD", 5_000_000, true),
            ("USD", -5_000_000, true),
            ("EUR", 6_000_002, false)
        ]
    );
    assert_eq!(revision.cash, 1_056_600_000);
    assert_eq!(revision.capital_return_claims[0].amount, 6_000_002);
    let canceled = replay(6, 8, CAPITAL_RETURNS);
    assert_eq!(
        canceled.capital_return_claims[0].state,
        PortfolioDividendState::NoPayment
    );
    assert_eq!(canceled.capital_return_postings[3].cash_delta, -6_000_002);
    assert_eq!(canceled.cash, 536_600_000);
    let reordered = CAPITAL_RETURNS.lines().collect::<Vec<_>>();
    let reordered = [reordered[0], reordered[3], reordered[2], reordered[1]].join("\n");
    assert_eq!(
        replay(4, 4, &reordered).capital_return_postings,
        before_payment.capital_return_postings
    );
    assert_eq!(
        replay(6, 7, &reordered).capital_return_postings,
        revision.capital_return_postings
    );
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
fn paper_successor_shares_observe_terms_holdings_deliveries_and_marks_independently() {
    let universe = parse_universe(ACTION_MEMBERSHIP).unwrap();
    let book = PriceBook::parse(&universe, PRICES).unwrap();
    let liquidity = LiquidityTape::parse(&universe, LIQUIDITY).unwrap();
    let start = universe.checkpoints()[0];
    let sources = CrossSectionActionSources {
        dividends: DIVIDENDS,
        delistings: DELISTING,
        account_currency: "USD",
    };
    let replay = |effective: i64, known: i64, liquidity: &LiquidityTape| {
        let query = CrossSectionConfig {
            through_at: start + effective,
            known_at: start + known,
            ..settings(start, 6)
        };
        book.cross_section_with_successor_shares(liquidity, query, sources, SUCCESSORS)
            .unwrap()
    };

    assert!(replay(360, 329, &liquidity).successor_claims.is_empty());
    let unpaid = replay(300, 330, &liquidity);
    let claim = &unpaid.successor_claims[0];
    assert_eq!(claim.state, SuccessorShareState::Receivable);
    assert_eq!(claim.position_at, start + 180);
    assert_eq!(claim.entitled_shares, 4);
    assert_eq!(claim.terms.successor_listing, "B");
    assert_eq!((claim.shares.numerator, claim.shares.denominator), (4, 3));
    assert_eq!(claim.mark.unwrap().observed_at, start + 300);
    assert_eq!(claim.value, Some(97_200_000));
    assert_eq!(unpaid.cash, 540_600_000);
    assert_eq!(unpaid.equity, Some(1_137_800_000));
    let missing_mark = replay(360, 330, &liquidity);
    assert_eq!(
        missing_mark.successor_claims[0].state,
        SuccessorShareState::Delivered
    );
    assert_eq!(missing_mark.successor_claims[0].value, None);
    assert_eq!(missing_mark.equity, None);

    let paid = replay(360, 360, &liquidity);
    assert_eq!(
        paid.successor_claims[0].state,
        SuccessorShareState::Delivered
    );
    assert_eq!(paid.cash, 1_040_600_000);
    assert_eq!(paid.equity, Some(1_137_800_000));
    assert!(paid.positions.is_empty());
    let revised = replay(360, 420, &liquidity);
    assert_eq!(
        revised.successor_claims[0].state,
        SuccessorShareState::Receivable
    );
    assert_eq!(revised.successor_claims[0].shares.numerator, 2);
    assert_eq!(revised.equity, Some(1_202_400_000));
    let zeroed = replay(360, 450, &liquidity);
    assert_eq!(
        zeroed.successor_claims[0].state,
        SuccessorShareState::NoDistribution
    );
    assert_eq!(zeroed.successor_claims[0].value, Some(0));
    assert_eq!(zeroed.equity, Some(1_056_600_000));
    let canceled = replay(360, 480, &liquidity);
    assert!(canceled.successor_claims.is_empty());
    assert_eq!(canceled.positions[0].shares, 4);
    assert_eq!(paid, replay(360, 360, &liquidity));

    let late = LIQUIDITY.replace(
        "14:03:00Z,2025-06-02T14:03:00Z",
        "14:03:30Z,2025-06-02T14:04:00Z",
    );
    let late = LiquidityTape::parse(&universe, &late).unwrap();
    let boundary = replay(360, 360, &late);
    assert_eq!(boundary.delisting_claims[0].shares, 4);
    assert_eq!(boundary.successor_claims[0].entitled_shares, 2);
    assert_eq!(boundary.successor_claims[0].position_at, start + 120);
}

#[test]
fn walk_forward_includes_only_successors_visible_in_its_own_test_account() {
    let universe = parse_universe(ACTION_MEMBERSHIP).unwrap();
    let prices = PriceBook::parse(&universe, PRICES).unwrap();
    let liquidity = LiquidityTape::parse(&universe, WALK_LIQUIDITY).unwrap();
    let request = CrossSectionWalkConfig {
        replay: settings(universe.checkpoints()[0], 8),
        training_decisions: 2,
        test_decisions: 4,
        candidates: &CANDIDATES,
        corporate: Some(CrossSectionActionSources {
            dividends: DIVIDENDS,
            delistings: DELISTING,
            account_currency: "USD",
        }),
    };
    let baseline = prices
        .cross_section_walk_forward(&liquidity, request)
        .unwrap();
    let shares = prices
        .cross_section_walk_with_successor_shares(&liquidity, request, SUCCESSORS)
        .unwrap();
    assert_eq!(shares[0].training_scores, baseline[0].training_scores);
    let previous = baseline[0].test_score.as_ref().unwrap();
    let current = shares[0].test_score.as_ref().unwrap();
    assert_eq!(current.cash, previous.cash);
    assert_eq!(current.equity, Some(previous.equity.unwrap() + 97_200_000));
}

#[test]
fn paper_successor_deliveries_reference_accepted_observed_fills_and_reverse_exactly() {
    let universe = parse_universe(ACTION_MEMBERSHIP).unwrap();
    let book = PriceBook::parse(&universe, PRICES).unwrap();
    let liquidity = LiquidityTape::parse(&universe, LIQUIDITY).unwrap();
    let start = universe.checkpoints()[0];
    let sources = CrossSectionActionSources {
        dividends: DIVIDENDS,
        delistings: DELISTING,
        account_currency: "USD",
    };
    let query = |known| CrossSectionConfig {
        known_at: start + known,
        ..settings(start, 6)
    };
    let journal = |known, tape: &LiquidityTape, terms| {
        book.cross_section_successor_delivery_journal(tape, query(known), sources, terms)
            .unwrap()
    };
    assert!(journal(330, &liquidity, SUCCESSORS).is_empty());
    let first = journal(360, &liquidity, SUCCESSORS);
    assert_eq!(first.len(), 1);
    let row = &first[0];
    assert_eq!(row.delivery.entitled_shares, 4);
    assert_eq!(row.delivery.position_observed_at, start + 180);
    assert_eq!(row.delivery.position_effective_at, start + 180);
    assert_eq!(row.delivery.posted_at, start + 360);
    assert_eq!(
        (row.delivery.delta.numerator, row.delivery.delta.denominator),
        (4, 3)
    );
    let replay = book
        .cross_section_with_successor_shares(&liquidity, query(360), sources, SUCCESSORS)
        .unwrap();
    let cause = replay
        .events
        .iter()
        .find(|item| item.event.id == row.position_receipt_id)
        .unwrap();
    assert!(
        matches!(&cause.event.action, PaperAction::Fill { source_id, .. } if source_id == "Q-9007199254740996")
    );
    assert_eq!(cause.receipt.rejection, None);
    assert_eq!(row.delivery.balance, replay.successor_claims[0].shares);

    let final_rows = journal(480, &liquidity, SUCCESSORS);
    assert_eq!(final_rows.len(), 2);
    assert_eq!(final_rows[0], *row);
    assert_eq!(final_rows[1].position_receipt_id, row.position_receipt_id);
    assert_eq!(final_rows[1].delivery.posted_at, start + 420);
    assert_eq!(
        (
            final_rows[1].delivery.delta.numerator,
            final_rows[1].delivery.delta.denominator
        ),
        (-4, 3)
    );
    assert_eq!(final_rows[1].delivery.balance.numerator, 0);
    assert_eq!(first, journal(360, &liquidity, SUCCESSORS));

    let immediate = SUCCESSORS.replace("14:09:00Z", "14:06:00Z");
    let correction = journal(420, &liquidity, &immediate);
    assert_eq!(
        (
            correction[1].delivery.delta.numerator,
            correction[1].delivery.delta.denominator
        ),
        (2, 3)
    );
    assert_eq!(correction[1].delivery.balance.numerator, 2);

    let late = LIQUIDITY.replace(
        "14:03:00Z,2025-06-02T14:03:00Z",
        "14:03:30Z,2025-06-02T14:04:00Z",
    );
    let late_tape = LiquidityTape::parse(&universe, &late).unwrap();
    let boundary = journal(360, &late_tape, SUCCESSORS);
    assert_eq!(boundary[0].delivery.entitled_shares, 2);
    assert_eq!(boundary[0].delivery.position_observed_at, start + 120);
    assert_ne!(boundary[0].position_receipt_id, row.position_receipt_id);
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
