use marketweft_core::{
    parse_csv, parse_paper_config, parse_sessions, walk_forward, BacktestConfig, Instrument,
    SmaCandidate, WalkForwardConfig,
};

const CALENDAR: &str = include_str!("fixtures/synthetic-backtest-sessions.csv");
const BARS: &str = include_str!("fixtures/synthetic-backtest-bars.csv");
const BASE: i64 = 1_743_688_800;
const PAIRS: [SmaCandidate; 2] = [
    SmaCandidate { fast: 2, slow: 3 },
    SmaCandidate { fast: 1, slow: 2 },
];

fn policy(candidates: &[SmaCandidate]) -> WalkForwardConfig<'_> {
    WalkForwardConfig {
        training_bars: 6,
        test_bars: 2,
        candidates,
        execution: BacktestConfig {
            paper: parse_paper_config("1000,10,1200,0.1,2").unwrap(),
            fast_window: 1,
            slow_window: 2,
            target_shares: 6,
            participation_bps: 1000,
            slippage_bps: 0,
            limit_buffer_bps: 2000,
            max_wait_bars: 3,
        },
    }
}

#[test]
fn training_selects_by_equity_and_the_test_portfolio_starts_clean() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let bars = parse_csv(BARS).unwrap();
    let run = |minute: i64| {
        walk_forward(
            &instrument,
            &sessions,
            &bars,
            60,
            BASE + minute * 60,
            &policy(&PAIRS),
        )
        .unwrap()
    };
    assert!(run(8).is_empty());
    let at_nine = run(9);
    assert_eq!(at_nine.len(), 1);
    let fold = &at_nine[0];
    assert_eq!(
        (fold.training_start, fold.training_end),
        (BASE + 60, BASE + 7 * 60)
    );
    assert_eq!(
        (fold.test_start, fold.test_end),
        (BASE + 8 * 60, BASE + 9 * 60)
    );
    assert_eq!(fold.selected, PAIRS[1]);
    assert_eq!(fold.scores[0].equity, 1_003_400_000);
    assert_eq!(fold.scores[0].accepted_fills, 1);
    assert_eq!(fold.scores[1].equity, 997_800_000);
    assert_eq!(fold.out_of_sample.marks[0].cash, 1_000_000_000);
    assert_eq!(fold.out_of_sample.marks[0].shares, 0);
    assert_eq!(fold.out_of_sample.marks.len(), 2);
    assert!(fold
        .out_of_sample
        .ledger
        .history()
        .iter()
        .all(|(event, _)| event.observed_at >= fold.test_start));
    let final_run = run(11);
    assert_eq!(final_run.len(), 2);
    assert!(final_run[0].test_end < final_run[1].test_start);
    assert_eq!(final_run[0].scores, fold.scores);
    assert_eq!(final_run[0].out_of_sample.marks, fold.out_of_sample.marks);
}

#[test]
fn test_prices_do_not_change_training_and_ties_are_stable() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let mut bars = parse_csv(BARS).unwrap();
    let run = |bars: &[_], policy: &WalkForwardConfig<'_>| {
        walk_forward(&instrument, &sessions, bars, 60, BASE + 11 * 60, policy)
    };
    let original = run(&bars, &policy(&PAIRS)).unwrap();
    bars[6].close *= 2;
    bars[7].close /= 2;
    let changed = run(&bars, &policy(&PAIRS)).unwrap();
    assert_eq!(original[0].scores, changed[0].scores);
    assert_eq!(original[0].selected, changed[0].selected);
    assert_ne!(
        original[0].out_of_sample.marks,
        changed[0].out_of_sample.marks
    );
    let reversed = [PAIRS[1], PAIRS[0]];
    let tied = run(
        &bars,
        &WalkForwardConfig {
            training_bars: 4,
            test_bars: 3,
            ..policy(&reversed)
        },
    )
    .unwrap();
    assert_eq!(tied[0].scores[0].equity, tied[0].scores[1].equity);
    assert_eq!(tied[0].selected, PAIRS[1]);
    assert!(run(&bars, &policy(&[PAIRS[0], PAIRS[0]])).is_err());
}
