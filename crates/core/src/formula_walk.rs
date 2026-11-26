use crate::{
    backtest::{evaluate_formula_window, prepare_observations},
    universe::valid_id,
    BacktestConfig, Bar, Formula, FormulaBacktestConfig, FormulaBacktestReport, Instrument,
    PaperAction, RecordedBacktestCutoffs, Session, TradeTape,
};
use std::collections::BTreeSet;

const MAX_CANDIDATES: usize = 16;
const MAX_FOLDS: usize = 64;
const MAX_WORK: usize = 4_000_000;

pub struct FormulaWalkCandidate<'a> {
    pub id: &'a str,
    pub entry: &'a Formula,
    pub exit: &'a Formula,
}

pub struct FormulaWalkConfig<'a> {
    pub cutoffs: RecordedBacktestCutoffs,
    pub training_bars: usize,
    pub test_bars: usize,
    pub execution: BacktestConfig,
    pub candidates: &'a [FormulaWalkCandidate<'a>],
    pub trades: Option<&'a TradeTape>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FormulaWalkScore {
    pub id: String,
    pub equity: i128,
    pub drawdown: i128,
    pub turnover: i128,
    pub fees: i128,
    pub accepted_fills: usize,
    pub unavailable_conditions: usize,
}

impl FormulaWalkScore {
    fn calculate(id: &str, report: &FormulaBacktestReport, starting_cash: i128) -> Self {
        let mut turnover = 0;
        let mut fees = 0;
        let mut accepted_fills = 0;
        for (event, receipt) in report.backtest.ledger.history() {
            if let PaperAction::Fill { shares, price, .. } = event.action {
                if receipt.rejection.is_none() {
                    turnover += i128::from(shares) * i128::from(price);
                    fees += receipt.fee;
                    accepted_fills += 1;
                }
            }
        }
        Self {
            id: id.to_owned(),
            equity: report
                .backtest
                .marks
                .last()
                .map_or(starting_cash, |row| row.equity),
            drawdown: report.backtest.largest_drawdown,
            turnover,
            fees,
            accepted_fills,
            unavailable_conditions: report
                .evaluations
                .iter()
                .map(|row| usize::from(row.entry.is_none()) + usize::from(row.exit.is_none()))
                .sum(),
        }
    }
}

pub struct FormulaWalkFold {
    pub training_start: i64,
    pub training_end: i64,
    pub test_start: i64,
    pub test_end: i64,
    pub scores: Vec<FormulaWalkScore>,
    pub test_score: FormulaWalkScore,
    pub out_of_sample: FormulaBacktestReport,
}

/// Select candidates solely from each completed training window. The winner
/// uses the training bars as formula warm-up and starts the test with fresh cash.
pub fn walk_forward_formulas(
    instrument: &Instrument,
    sessions: &[Session],
    bars: &[Bar],
    interval: u32,
    config: &FormulaWalkConfig<'_>,
) -> Result<Vec<FormulaWalkFold>, String> {
    let through = config.cutoffs.visible_bar()?;
    config.execution.account(false)?;
    if config
        .trades
        .is_some_and(|tape| tape.instrument() != instrument)
    {
        return Err("Recorded trades must match the backtest instrument.".into());
    }
    let train = config.training_bars;
    let test = config.test_bars;
    if !(2..=5_000).contains(&train) || !(2..=5_000).contains(&test) {
        return Err("Formula training and test windows need 2–5,000 observed bars.".into());
    }
    let candidates = config.candidates;
    let unique: BTreeSet<_> = candidates.iter().map(|row| row.id).collect();
    if !(2..=MAX_CANDIDATES).contains(&candidates.len())
        || unique.len() != candidates.len()
        || unique.iter().any(|id| !valid_id(id))
    {
        return Err("Supply 2–16 candidates with unique ASCII strategy IDs.".into());
    }

    let observed = prepare_observations(instrument, sessions, bars, interval)?;
    let known = &observed[..observed.partition_point(|row| row.at <= through)];
    let folds = known.len().saturating_sub(train) / test;
    if folds > MAX_FOLDS {
        return Err("Formula walk-forward supports at most 64 completed folds.".into());
    }
    let work = |candidate: &FormulaWalkCandidate<'_>| {
        candidate.entry.node_count() + candidate.exit.node_count()
    };
    let total = candidates.iter().map(work).sum::<usize>();
    let max = candidates.iter().map(work).max().unwrap();
    let mut budget = folds * (train * total + (train + test) * max);
    let mut results = Vec::with_capacity(folds);
    for fold in 0..folds {
        let start = fold * test;
        let train_end = start + train;
        let end = train_end + test;
        let training_start = known[start].at;
        let training_end = known[train_end - 1].at;
        let test_start = known[train_end].at;
        let test_end = known[end - 1].at;
        if let Some(tape) = config.trades {
            let prints = |start, end| {
                let items = tape.observed_prefix(Some(end));
                items.len() - items.partition_point(|row| row.observed_at < start)
            };
            budget += candidates.len() * prints(training_start, training_end)
                + prints(test_start, test_end);
        }
        if budget > MAX_WORK {
            return Err("Formula walk-forward exceeds the four million evaluation limit. Use fewer candidates or observations.".into());
        }

        let run =
            |candidate: &FormulaWalkCandidate<'_>, end: usize, trade_from: usize, cutoff: i64| {
                evaluate_formula_window(
                    instrument,
                    sessions,
                    &known[start..end],
                    trade_from,
                    FormulaBacktestConfig {
                        cutoffs: RecordedBacktestCutoffs {
                            effective_at: cutoff,
                            known_at: cutoff,
                        },
                        execution: config.execution,
                        entry: candidate.entry,
                        exit: candidate.exit,
                    },
                    config.trades,
                )
            };
        let starting_cash = config.execution.paper.starting_cash;
        let mut scores = candidates
            .iter()
            .enumerate()
            .map(|(index, candidate)| {
                run(candidate, train_end, 0, training_end)
                    .map(|report| {
                        (
                            index,
                            FormulaWalkScore::calculate(candidate.id, &report, starting_cash),
                        )
                    })
                    .map_err(|cause| format!("Strategy {}: {cause}", candidate.id))
            })
            .collect::<Result<Vec<_>, String>>()?;
        scores.sort_unstable_by(|(_, left), (_, right)| {
            right
                .equity
                .cmp(&left.equity)
                .then_with(|| left.id.cmp(&right.id))
        });
        let winner = &candidates[scores[0].0];
        let out_of_sample = run(winner, end, train, test_end)?;
        let test_score = FormulaWalkScore::calculate(winner.id, &out_of_sample, starting_cash);
        results.push(FormulaWalkFold {
            training_start,
            training_end,
            test_start,
            test_end,
            scores: scores.into_iter().map(|(_, score)| score).collect(),
            test_score,
            out_of_sample,
        });
    }
    Ok(results)
}
