use marketweft_core::{
    parse_csv, parse_paper_config, parse_sessions, walk_forward_formulas, BacktestConfig, Formula,
    FormulaWalkCandidate, FormulaWalkConfig, Instrument, RecordedBacktestCutoffs, TradeTape,
};

const CALENDAR: &str = include_str!("fixtures/synthetic-backtest-sessions.csv");
const BARS: &str = include_str!("fixtures/synthetic-backtest-bars.csv");
const TRADES: &str = include_str!("fixtures/synthetic-backtest-trades.csv");
const BASE: i64 = 1_743_688_800;

fn execution() -> BacktestConfig {
    BacktestConfig {
        paper: parse_paper_config("1000,10,1200,0.1,2").unwrap(),
        fast_window: 1,
        slow_window: 2,
        target_shares: 6,
        participation_bps: 1000,
        slippage_bps: 0,
        limit_buffer_bps: 2000,
        max_wait_bars: 3,
    }
}

#[test]
fn formula_walk_freezes_training_and_warms_formulas_without_forwarding_the_portfolio() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let mut bars = parse_csv(BARS).unwrap();
    let entry = Formula::compile("close > lag(close, 1)").unwrap();
    let late = Formula::compile("close >= 13").unwrap();
    let exit = Formula::compile("close <= 10").unwrap();
    let candidates = [
        FormulaWalkCandidate {
            id: "Late",
            entry: &late,
            exit: &exit,
        },
        FormulaWalkCandidate {
            id: "Rising",
            entry: &entry,
            exit: &exit,
        },
    ];
    let run = |bars: &[_], effective: i64, known: i64| {
        walk_forward_formulas(
            &instrument,
            &sessions,
            bars,
            60,
            &FormulaWalkConfig {
                cutoffs: RecordedBacktestCutoffs {
                    effective_at: BASE + effective * 60,
                    known_at: BASE + known * 60,
                },
                training_bars: 6,
                test_bars: 2,
                execution: execution(),
                candidates: &candidates,
                trades: None,
            },
        )
        .unwrap()
    };
    assert!(run(&bars, 11, 8).is_empty());
    assert!(run(&bars, 8, 11).is_empty());
    let first = run(&bars, 11, 9);
    let all = run(&bars, 11, 11);
    assert_eq!(first.len(), 1);
    assert_eq!(all.len(), 2);
    assert!(all[0].test_end < all[1].test_start);
    let fold = &first[0];
    assert_eq!(fold.training_end, BASE + 7 * 60);
    assert_eq!(fold.test_start, BASE + 8 * 60);
    assert_eq!(fold.scores, all[0].scores);
    assert_eq!(fold.scores[0].id, "Rising");
    assert_eq!(fold.scores[0].equity, 1_003_400_000);
    assert_eq!(fold.scores[1].equity, 997_800_000);
    assert_eq!(fold.scores[0].unavailable_conditions, 1);
    assert_eq!(fold.test_score.equity, 997_400_000);
    assert_eq!(fold.test_score.accepted_fills, 1);
    assert_eq!(fold.test_score.turnover, 60_000_000);
    assert_eq!(fold.test_score.fees, 2_600_000);
    assert_eq!(fold.out_of_sample.evaluations[0].entry, Some(1_000_000));
    assert_eq!(fold.out_of_sample.backtest.marks[0].cash, 1_000_000_000);
    assert_eq!(fold.out_of_sample.backtest.marks[0].shares, 0);
    assert!(fold
        .out_of_sample
        .backtest
        .ledger
        .history()
        .iter()
        .all(|(event, _)| event.observed_at >= fold.test_start));
    assert_eq!(
        fold.out_of_sample.backtest.marks,
        all[0].out_of_sample.backtest.marks
    );

    bars[6].close = 13_000_000;
    let changed = run(&bars, 11, 11);
    assert_eq!(changed[0].scores, fold.scores);
    assert_eq!(changed[0].test_score.equity, 1_000_000_000);
}

#[test]
fn tape_folds_exclude_pre_test_orders_and_validate_candidate_identity() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let bars = parse_csv(BARS).unwrap();
    let trades = TradeTape::parse_execution(TRADES, &instrument).unwrap();
    let entry = Formula::compile("close >= 13").unwrap();
    let exit = Formula::compile("close <= 10").unwrap();
    let candidates = [
        FormulaWalkCandidate {
            id: "Beta",
            entry: &entry,
            exit: &exit,
        },
        FormulaWalkCandidate {
            id: "Alpha",
            entry: &entry,
            exit: &exit,
        },
    ];
    let input = FormulaWalkConfig {
        cutoffs: RecordedBacktestCutoffs {
            effective_at: BASE + 660,
            known_at: BASE + 670,
        },
        training_bars: 6,
        test_bars: 2,
        execution: execution(),
        candidates: &candidates,
        trades: Some(&trades),
    };
    let result = walk_forward_formulas(&instrument, &sessions, &bars, 60, &input).unwrap();
    assert_eq!(result[0].scores[0].equity, result[0].scores[1].equity);
    assert_eq!(result[0].test_score.id, "Alpha");
    assert_eq!(result[0].test_score.accepted_fills, 0);
    assert_eq!(result[0].test_score.equity, 1_000_000_000);
    let bad = [FormulaWalkCandidate {
        id: "bad name",
        entry: &entry,
        exit: &exit,
    }];
    assert!(walk_forward_formulas(
        &instrument,
        &sessions,
        &bars,
        60,
        &FormulaWalkConfig {
            candidates: &bad,
            ..input
        }
    )
    .is_err());
}
