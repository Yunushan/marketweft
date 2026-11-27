use marketweft_core::{
    parse_universe, CrossSectionActionSources, CrossSectionCandidate, CrossSectionConfig,
    CrossSectionWalkConfig, DelistingState, LiquidityTape, PaperAction, PaperConfig, PriceBook,
    SuccessorShareState, SCALE,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-listing-risk-membership.csv");
const PRICES: &str = include_str!("fixtures/synthetic-listing-risk-prices.csv");
const LIQUIDITY: &str = include_str!("fixtures/synthetic-cross-section-liquidity.csv");
const DIVIDENDS: &str = include_str!("fixtures/synthetic-cross-section-dividends.csv");
const ACTION_MEMBERSHIP: &str = include_str!("fixtures/synthetic-cross-section-membership.csv");
const DELISTING: &str = include_str!("fixtures/synthetic-cross-section-delisting.csv");
const WALK_LIQUIDITY: &str = include_str!("fixtures/synthetic-cross-section-walk-liquidity.csv");
const SUCCESSORS: &str = include_str!("fixtures/synthetic-paper-successor-shares.csv");

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
