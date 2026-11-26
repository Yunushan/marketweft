use marketweft_core::{
    backtest, backtest_with_formulas, backtest_with_trades, parse_csv, parse_paper_config,
    parse_sessions, BacktestConfig, Formula, FormulaBacktestConfig, Instrument, PaperAction,
    PaperOrderStatus, PaperRejection, PaperSide, RecordedBacktestCutoffs, TradeTape, SCALE,
};

const CALENDAR: &str = include_str!("fixtures/synthetic-backtest-sessions.csv");
const BARS: &str = include_str!("fixtures/synthetic-backtest-bars.csv");
const TRADES: &str = include_str!("fixtures/synthetic-backtest-trades.csv");
const BASE: i64 = 1_743_688_800;

fn config() -> BacktestConfig {
    BacktestConfig {
        paper: parse_paper_config("1000,10,1200,0.1,2").unwrap(),
        fast_window: 2,
        slow_window: 3,
        target_shares: 6,
        participation_bps: 1000,
        slippage_bps: 0,
        limit_buffer_bps: 2000,
        max_wait_bars: 3,
    }
}

#[test]
fn formula_signals_are_observed_at_close_and_share_the_delayed_paper_engine() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let bars = parse_csv(BARS).unwrap();
    let tape = TradeTape::parse_execution(TRADES, &instrument).unwrap();
    let entry = Formula::compile("if(close >= 13, 1, 0 / 0)").unwrap();
    let exit = Formula::compile("close <= 10").unwrap();
    let run = |source: &[_], known: i64, tape: Option<&TradeTape>| {
        backtest_with_formulas(
            &instrument,
            &sessions,
            source,
            60,
            FormulaBacktestConfig {
                cutoffs: RecordedBacktestCutoffs {
                    effective_at: BASE + 660,
                    known_at: BASE + known,
                },
                execution: config(),
                entry: &entry,
                exit: &exit,
            },
            tape,
        )
        .unwrap()
    };
    let warm = run(&bars, 299, None);
    assert!(warm.evaluations.iter().all(|row| row.entry.is_none()));
    assert!(warm.backtest.ledger.history().is_empty());
    let submit = run(&bars, 300, None);
    assert_eq!(
        submit.evaluations.last().unwrap().decision,
        Some(PaperSide::Buy)
    );
    assert_eq!(submit.backtest.ledger.history().len(), 1);
    assert!(submit.backtest.ledger.positions().is_empty());
    assert_eq!(
        run(&bars, 360, None).backtest.ledger.history(),
        submit.backtest.ledger.history()
    );
    let later = run(&bars, 420, None);
    assert_eq!(later.backtest.ledger.positions()["DEMO:SMA"].shares, 2);
    assert_eq!(later.backtest.ledger.cash(), 969_800_000);
    let terminal = run(&bars, 660, None);
    assert_eq!(terminal.backtest.ledger.cash(), 957_800_000);
    let recorded = run(&bars, 670, Some(&tape));
    assert_eq!(recorded.backtest.ledger.cash(), 957_800_000);
    assert!(recorded.backtest.ledger.history().iter().any(|(event, receipt)| {
        matches!(&event.action, PaperAction::Fill { source_id, .. } if source_id == "TRADE-9007199254741000")
            && receipt.rejection.is_none()
    }));

    let mut revised = bars.clone();
    revised.last_mut().unwrap().close = 123 * SCALE;
    let revised = run(&revised, 420, None);
    assert_eq!(later.evaluations, revised.evaluations);
    assert_eq!(
        later.backtest.ledger.history(),
        revised.backtest.ledger.history()
    );
    for known in [0, 299, 300, 360, 420, 659, 660] {
        let prefix = run(&bars, known, None);
        assert_eq!(
            prefix.evaluations,
            terminal.evaluations[..prefix.evaluations.len()]
        );
        let events = prefix.backtest.ledger.history();
        assert_eq!(events, &terminal.backtest.ledger.history()[..events.len()]);
    }
}

#[test]
fn exit_wins_if_both_formulas_trigger_and_both_missing_keep_the_ledger_idle() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let bars = parse_csv(BARS).unwrap();
    let entry = Formula::compile("1 / 0").unwrap();
    let active = Formula::compile("close > 0").unwrap();
    let expired = Formula::compile("lag(close, 4096)").unwrap();
    let cutoffs = RecordedBacktestCutoffs {
        effective_at: BASE + 660,
        known_at: BASE + 660,
    };
    let run = |entry, exit| {
        backtest_with_formulas(
            &instrument,
            &sessions,
            &bars,
            60,
            FormulaBacktestConfig {
                cutoffs,
                execution: config(),
                entry,
                exit,
            },
            None,
        )
        .unwrap()
    };
    let missing = run(&entry, &expired);
    assert!(missing
        .evaluations
        .iter()
        .all(|row| row.entry.is_none() && row.exit.is_none() && row.decision.is_none()));
    assert!(missing.backtest.ledger.history().is_empty());
    let conflicting = run(&active, &active);
    assert!(conflicting
        .evaluations
        .iter()
        .all(|row| row.decision == Some(PaperSide::Sell)));
    assert!(conflicting.backtest.ledger.history().is_empty());
}

#[test]
fn recorded_prints_apply_observed_whole_share_capacity_with_two_cutoffs() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let bars = parse_csv(BARS).unwrap();
    let trades = TradeTape::parse_execution(TRADES, &instrument).unwrap();
    let replay = |effective: i64, known: i64, config| {
        backtest_with_trades(
            &instrument,
            &sessions,
            &bars,
            60,
            RecordedBacktestCutoffs {
                effective_at: BASE + effective,
                known_at: BASE + known,
            },
            config,
            &trades,
        )
        .unwrap()
    };
    let before = replay(660, 329, config());
    assert!(before.ledger.positions().is_empty());
    assert!(replay(319, 330, config()).ledger.positions().is_empty());
    let partial = replay(660, 330, config());
    assert_eq!(partial.ledger.positions()["DEMO:SMA"].shares, 2);
    assert_eq!(partial.ledger.cash(), 969_800_000);
    assert_eq!(partial.marks.last().unwrap().at, BASE + 330);
    assert_eq!(partial.marks.last().unwrap().equity, 995_800_000);
    assert_eq!(replay(660, 429, config()).ledger.history().len(), 2);
    let late = replay(660, 430, config());
    assert_eq!(late.ledger.positions()["DEMO:SMA"].shares, 5);
    assert_eq!(late.ledger.cash(), 924_500_000);
    let open = replay(660, 660, config());
    assert_eq!(open.ledger.positions()["DEMO:SMA"].shares, 3);
    let terminal = replay(660, 670, config());
    assert!(terminal.ledger.positions().is_empty());
    assert_eq!(terminal.ledger.cash(), 957_800_000);
    assert_eq!(terminal.marks.last().unwrap().at, BASE + 670);
    let history = terminal.ledger.history();
    let fills: Vec<_> = history
        .iter()
        .filter_map(|(event, receipt)| match &event.action {
            PaperAction::Fill {
                source_id, shares, ..
            } if receipt.rejection.is_none() => Some((source_id.as_str(), *shares, receipt.fee)),
            _ => None,
        })
        .collect();
    assert_eq!(
        fills,
        [
            ("TRADE-9007199254740995", 2, 2_200_000),
            ("TRADE-9007199254740996", 3, 300_000),
            ("TRADE-9007199254740997", 1, 100_000),
            ("TRADE-9007199254740998", 3, 2_300_000),
            ("TRADE-9007199254741000", 3, 300_000),
        ]
    );
    for known in [0, 300, 329, 330, 429, 430, 659, 660, 670] {
        let prefix = replay(660, known, config());
        assert_eq!(
            prefix.ledger.history(),
            &history[..prefix.ledger.history().len()]
        );
        assert_eq!(prefix.marks, terminal.marks[..prefix.marks.len()]);
        assert_eq!(prefix.signals, terminal.signals[..prefix.signals.len()]);
    }
    let expiry = replay(
        660,
        430,
        BacktestConfig {
            max_wait_bars: 1,
            ..config()
        },
    );
    assert_eq!(expiry.ledger.positions()["DEMO:SMA"].shares, 5);
    assert_eq!(
        replay(
            660,
            490,
            BacktestConfig {
                max_wait_bars: 1,
                ..config()
            }
        )
        .ledger
        .orders()["ORDER-4"]
            .status,
        PaperOrderStatus::Filled
    );
    let expiry = replay(
        660,
        490,
        BacktestConfig {
            target_shares: 7,
            max_wait_bars: 1,
            ..config()
        },
    );
    assert_eq!(
        expiry.ledger.orders()["ORDER-4"].status,
        PaperOrderStatus::Canceled
    );
    assert!(expiry
        .ledger
        .history()
        .iter()
        .any(|(event, _)| event.id == "EXPIRE-6"));
}

#[test]
fn signs_at_close_then_fills_only_on_later_observed_volume() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let bars = parse_csv(BARS).unwrap();
    let run = |minutes: i64| {
        backtest(
            &instrument,
            &sessions,
            &bars,
            60,
            BASE + minutes * 60,
            config(),
        )
        .unwrap()
    };
    let warm = run(4);
    assert!(warm.signals.is_empty());
    assert!(warm.ledger.orders().is_empty());
    let signal = run(5);
    assert_eq!(
        signal
            .signals
            .iter()
            .map(|item| item.side)
            .collect::<Vec<_>>(),
        [PaperSide::Buy]
    );
    assert_eq!(
        signal.ledger.orders()["ORDER-4"].status,
        PaperOrderStatus::Open
    );
    assert!(signal.ledger.positions().is_empty());
    assert_eq!(run(6).ledger.history(), signal.ledger.history());
    let first = run(7);
    assert_eq!(first.ledger.positions()["DEMO:SMA"].shares, 2);
    assert_eq!(first.ledger.cash(), 969_800_000);
    let end = run(11);
    assert!(end.ledger.positions().is_empty());
    assert_eq!(end.ledger.cash(), 957_800_000);
    assert_eq!(end.ledger.realized(), -42_200_000);
    assert_eq!(end.marks.len(), 10);
    assert_eq!(end.marks.last().unwrap().equity, end.ledger.cash());
    assert!(end.largest_drawdown >= 42_200_000);
    let recorded = end.ledger.history();
    let fills: Vec<_> = recorded
        .iter()
        .filter_map(|(event, receipt)| match event.action {
            PaperAction::Fill {
                price_at,
                shares,
                price,
                ..
            } if receipt.rejection.is_none() => Some((price_at, shares, price)),
            _ => None,
        })
        .collect();
    assert_eq!(
        fills,
        [
            (BASE + 7 * 60, 2, 14 * SCALE),
            (BASE + 8 * 60, 4, 15 * SCALE),
            (BASE + 10 * 60, 3, 9 * SCALE),
            (BASE + 11 * 60, 3, 8 * SCALE)
        ]
    );
    for minutes in 0..=11 {
        let prefix = run(minutes);
        assert_eq!(
            prefix.ledger.history(),
            &recorded[..prefix.ledger.history().len()]
        );
        assert_eq!(prefix.marks, end.marks[..prefix.marks.len()]);
        assert_eq!(prefix.signals, end.signals[..prefix.signals.len()]);
    }
}

#[test]
fn applies_adverse_slippage_limits_and_expiry_without_lookahead() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let bars = parse_csv(BARS).unwrap();
    let run = |bars: &[_], config| {
        backtest(&instrument, &sessions, bars, 60, BASE + 11 * 60, config).unwrap()
    };
    let slipped = run(
        &bars,
        BacktestConfig {
            slippage_bps: 100,
            ..config()
        },
    );
    let history = slipped.ledger.history();
    let buy = history
        .iter()
        .find(|(event, _)| event.id == "FILL-5")
        .unwrap();
    assert_eq!(buy.1.cash_delta, -30_480_000);
    let rejected = history
        .iter()
        .find(|(event, _)| event.id == "FILL-9")
        .unwrap();
    assert_eq!(rejected.1.rejection, Some(PaperRejection::LimitPrice));
    let expired = run(
        &bars,
        BacktestConfig {
            max_wait_bars: 1,
            ..config()
        },
    );
    assert!(expired
        .ledger
        .history()
        .iter()
        .any(|(event, _)| event.id == "EXPIRE-6"));
    assert_eq!(
        expired.ledger.orders()["ORDER-4"].status,
        PaperOrderStatus::Canceled
    );
    let cutoff = BASE + 7 * 60;
    let mut changed = bars.clone();
    changed[6].close = 100 * SCALE;
    changed[6].volume = 0;
    let current = backtest(&instrument, &sessions, &bars, 60, cutoff, config()).unwrap();
    let speculative = backtest(&instrument, &sessions, &changed, 60, cutoff, config()).unwrap();
    assert_eq!(speculative.marks, current.marks);
    assert_eq!(speculative.ledger.history(), current.ledger.history());
}
