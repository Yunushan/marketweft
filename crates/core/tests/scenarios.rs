use marketweft_core::{
    backtest, parse_csv, parse_paper_config, parse_sessions, run_scenarios, BacktestConfig,
    Instrument, ScenarioConfig, ScenarioStats, ThreeQuantiles,
};

const CALENDAR: &str = include_str!("fixtures/synthetic-backtest-sessions.csv");
const BARS: &str = include_str!("fixtures/synthetic-backtest-bars.csv");
const BASE: i64 = 1_743_688_800;
const SEED: u64 = 0x9a2cb4f5678d243e;

fn execution() -> BacktestConfig {
    BacktestConfig {
        paper: parse_paper_config("1000,10,1200,0.1,2").unwrap(),
        fast_window: 1,
        slow_window: 2,
        target_shares: 6,
        participation_bps: 1000,
        slippage_bps: 10,
        limit_buffer_bps: 2000,
        max_wait_bars: 3,
    }
}

#[test]
fn scenarios_replay_the_observed_baseline_and_preserve_the_cutoff() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let mut bars = parse_csv(BARS).unwrap();
    let cutoff = BASE + 10 * 60;
    let config = ScenarioConfig {
        seed: SEED,
        paths: 64,
        horizon: 5,
    };
    let run = |bars: &[_], config| {
        run_scenarios(
            &instrument,
            &sessions,
            bars,
            60,
            cutoff,
            execution(),
            config,
        )
        .unwrap()
    };
    let first = run(&bars, config);
    assert_eq!(first, run(&bars, config));
    assert_eq!((first.through, first.last_observed), (cutoff, cutoff));
    assert_eq!(first.first_observed, BASE + 60);
    assert_eq!(first.eligible_moves, 8);
    assert_eq!(first.anchor_observed, BASE + 4 * 60);
    let baseline = backtest(&instrument, &sessions, &bars[3..9], 60, cutoff, execution()).unwrap();
    assert_eq!(first.baseline.ending_equity, baseline.marks[5].equity);
    assert_eq!(first.baseline.max_drawdown, baseline.largest_drawdown);

    bars[9].close *= 2;
    bars[9].volume = 0;
    assert_eq!(run(&bars, config), first);
    let other = run(
        &bars,
        ScenarioConfig {
            seed: SEED + 1,
            ..config
        },
    );
    assert_eq!(other.baseline, first.baseline);
    assert_ne!(other.paths, first.paths);
    assert!(first.ending_equity.p05 < first.ending_equity.p95);
    assert!(first.max_exposure.p95 > 0);
    assert_eq!(
        first.loss_paths,
        first
            .paths
            .iter()
            .filter(|path| path.ending_equity < 1_000_000_000)
            .count()
    );
    let mut ending: Vec<_> = first.paths.iter().map(|path| path.ending_equity).collect();
    ending.sort_unstable();
    assert_eq!(
        first.ending_equity,
        ThreeQuantiles {
            p05: ending[3],
            p50: ending[31],
            p95: ending[60]
        }
    );
    assert!(run_scenarios(
        &instrument,
        &sessions,
        &bars,
        60,
        BASE + 60,
        execution(),
        config
    )
    .is_err());
}

#[test]
fn flat_scenario_quantiles_and_risk_are_exact() {
    let instrument = Instrument::new("DEMO", "SMA").unwrap();
    let sessions = parse_sessions(CALENDAR).unwrap();
    let mut bars = parse_csv(BARS).unwrap();
    for bar in &mut bars {
        bar.close = 10_000_000;
        bar.open = bar.close;
        bar.high = bar.close;
        bar.low = bar.close;
    }
    let config = ScenarioConfig {
        seed: 0,
        paths: 20,
        horizon: 9,
    };
    let result = run_scenarios(
        &instrument,
        &sessions,
        &bars,
        60,
        BASE + 11 * 60,
        execution(),
        config,
    )
    .unwrap();
    let flat = ScenarioStats {
        ending_equity: 1_000_000_000,
        max_drawdown: 0,
        max_exposure: 0,
    };
    assert_eq!(result.baseline, flat);
    assert_eq!(result.paths, [flat; 20]);
    assert_eq!(result.loss_paths, 0);
    assert_eq!(
        result.ending_equity,
        ThreeQuantiles {
            p05: flat.ending_equity,
            p50: flat.ending_equity,
            p95: flat.ending_equity
        }
    );
    assert_eq!(
        result.max_drawdown,
        ThreeQuantiles {
            p05: 0,
            p50: 0,
            p95: 0
        }
    );
    assert_eq!(result.max_exposure, result.max_drawdown);
}
