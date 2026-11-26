use crate::{
    backtest::{evaluate, prepare_observations},
    BacktestConfig, BacktestReport, Bar, Instrument, Session,
};

const MAX_CANDIDATES: usize = 64;
const MAX_WORK: usize = 2_000_000;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct SmaCandidate {
    pub fast: usize,
    pub slow: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CandidateScore {
    pub window: SmaCandidate,
    pub equity: i128,
    pub drawdown: i128,
    pub accepted_fills: usize,
}

pub struct WalkForwardFold {
    pub training_start: i64,
    pub training_end: i64,
    pub test_start: i64,
    pub test_end: i64,
    pub scores: Vec<CandidateScore>,
    pub selected: SmaCandidate,
    pub out_of_sample: BacktestReport,
}

pub struct WalkForwardConfig<'a> {
    pub training_bars: usize,
    pub test_bars: usize,
    pub candidates: &'a [SmaCandidate],
    /// All positions, fees and execution policy are shared. The two SMA windows come from candidates.
    pub execution: BacktestConfig,
}

pub fn walk_forward(
    instrument: &Instrument,
    sessions: &[Session],
    bars: &[Bar],
    interval: u32,
    through: i64,
    config: &WalkForwardConfig<'_>,
) -> Result<Vec<WalkForwardFold>, String> {
    if !(1..=5_000).contains(&config.training_bars) || !(1..=5_000).contains(&config.test_bars) {
        return Err("Training and test folds must each contain 1–5,000 observed bars.".into());
    }
    let mut candidates = config.candidates.to_vec();
    candidates.sort_unstable();
    if candidates.is_empty()
        || candidates.len() > MAX_CANDIDATES
        || candidates.windows(2).any(|pair| pair[0] == pair[1])
        || candidates.iter().any(|window| {
            window.fast == 0
                || window.fast >= window.slow
                || window.slow > 1_000
                || window.slow >= config.training_bars
        })
    {
        return Err(
            "Supply 1–64 unique SMA pairs with fast < slow < training bars and slow at most 1,000."
                .into(),
        );
    }
    let observe = prepare_observations(instrument, sessions, bars, interval)?;
    let known = &observe[..observe.partition_point(|row| row.at <= through)];
    let train = config.training_bars;
    let test = config.test_bars;
    let folds = known.len().saturating_sub(train) / test;
    let per_fold = train * (candidates.len() + 1) + test;
    if folds > MAX_WORK / per_fold {
        return Err("Walk-forward search exceeds two million bar evaluations. Narrow the candidates or observations.".into());
    }
    let policy = |window: SmaCandidate| BacktestConfig {
        fast_window: window.fast,
        slow_window: window.slow,
        ..config.execution
    };
    // Validate the shared execution policy even before a full fold is observable.
    evaluate(instrument, &[], 0, policy(candidates[0]))?;
    let mut results = Vec::with_capacity(folds);
    for fold in 0..folds {
        let start = fold * test;
        let train_end = start + train;
        let end = train_end + test;
        let mut scores = Vec::with_capacity(candidates.len());
        for &window in &candidates {
            let training = evaluate(instrument, &known[start..train_end], 0, policy(window))?;
            let equity = training.marks.last().unwrap().equity;
            let accepted_fills = training
                .ledger
                .history()
                .iter()
                .filter(|(event, receipt)| {
                    matches!(event.action, crate::PaperAction::Fill { .. })
                        && receipt.rejection.is_none()
                })
                .count();
            scores.push(CandidateScore {
                window,
                equity,
                drawdown: training.largest_drawdown,
                accepted_fills,
            });
        }
        scores.sort_unstable_by(|a, b| {
            b.equity
                .cmp(&a.equity)
                .then_with(|| a.window.cmp(&b.window))
        });
        let selected = scores[0].window;
        let out_of_sample = evaluate(instrument, &known[start..end], train, policy(selected))?;
        results.push(WalkForwardFold {
            training_start: known[start].at,
            training_end: known[train_end - 1].at,
            test_start: known[train_end].at,
            test_end: known[end - 1].at,
            scores,
            selected,
            out_of_sample,
        });
    }
    Ok(results)
}
