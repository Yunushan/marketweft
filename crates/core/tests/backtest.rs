use marketweft_core::{
    backtest, parse_csv, parse_paper_config, parse_sessions, BacktestConfig, Instrument,
    PaperAction, PaperOrderStatus, PaperRejection, PaperSide, SCALE,
};

const CALENDAR: &str = include_str!("fixtures/synthetic-backtest-sessions.csv");
const BARS: &str = include_str!("fixtures/synthetic-backtest-bars.csv");
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
