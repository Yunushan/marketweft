use crate::{
    backtest::{evaluate, prepare_observations, ObservedBar},
    BacktestConfig, BacktestReport, Bar, Instrument, Session, MAX_TICKS,
};

const MAX_WORK: usize = 2_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScenarioConfig {
    pub seed: u64,
    pub paths: usize,
    /// Number of completed bars following the anchor bar in each path.
    pub horizon: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScenarioStats {
    pub ending_equity: i128,
    pub max_drawdown: i128,
    pub max_exposure: i128,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ThreeQuantiles {
    pub p05: i128,
    pub p50: i128,
    pub p95: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScenarioReport {
    pub through: i64,
    pub config: ScenarioConfig,
    pub first_observed: i64,
    pub last_observed: i64,
    pub eligible_moves: usize,
    pub anchor_observed: i64,
    pub starting_cash: i128,
    pub baseline: ScenarioStats,
    pub ending_equity: ThreeQuantiles,
    pub max_drawdown: ThreeQuantiles,
    pub max_exposure: ThreeQuantiles,
    pub loss_paths: usize,
    pub paths: Vec<ScenarioStats>,
}

pub fn run_scenarios(
    instrument: &Instrument,
    sessions: &[Session],
    bars: &[Bar],
    interval: u32,
    through: i64,
    execution: BacktestConfig,
    config: ScenarioConfig,
) -> Result<ScenarioReport, String> {
    if !(1..=10_000).contains(&config.paths)
        || !(1..=1_000).contains(&config.horizon)
        || config.paths + 1 > MAX_WORK / (config.horizon + 1)
    {
        return Err(
            "Supply 1–10,000 paths and 1–1,000 moves per path within two million bar evaluations."
                .into(),
        );
    }
    let observations = prepare_observations(instrument, sessions, bars, interval)?;
    let known = &observations[..observations.partition_point(|row| row.at <= through)];
    let length = config.horizon + 1;
    if known.len() < length {
        return Err("The cutoff must contain the anchor and every horizon bar.".into());
    }
    let template = &known[known.len() - length..];
    let baseline = stats(evaluate(instrument, template, 0, execution)?);
    let mut random = SplitMix64(config.seed);
    let mut bars = Vec::with_capacity(length);
    let mut paths = Vec::with_capacity(config.paths);
    for _ in 0..config.paths {
        bars.clear();
        bars.push(*template[0].bar);
        let mut close = template[0].bar.close;
        for slot in &template[1..] {
            let index = random.uniform_index(known.len() - 1);
            let previous = i128::from(known[index].bar.close);
            let sample = known[index + 1].bar;
            let open = close;
            let next = (i128::from(open) * i128::from(sample.close) + previous / 2) / previous;
            if !(1..=i128::from(MAX_TICKS)).contains(&next) {
                return Err("A simulated close is outside the supported price range.".into());
            }
            close = next as i64;
            bars.push(Bar {
                time: slot.bar.time,
                open,
                high: open.max(close),
                low: open.min(close),
                close,
                volume: sample.volume,
            });
        }
        let path: Vec<_> = template
            .iter()
            .zip(&bars)
            .map(|(slot, bar)| ObservedBar {
                index: slot.index,
                at: slot.at,
                bar,
            })
            .collect();
        paths.push(stats(evaluate(instrument, &path, 0, execution)?));
    }
    let starting_cash = execution.paper.starting_cash;
    Ok(ScenarioReport {
        through,
        config,
        first_observed: known[0].at,
        last_observed: known[known.len() - 1].at,
        eligible_moves: known.len() - 1,
        anchor_observed: template[0].at,
        starting_cash,
        baseline,
        ending_equity: quantiles(&paths, |path| path.ending_equity),
        max_drawdown: quantiles(&paths, |path| path.max_drawdown),
        max_exposure: quantiles(&paths, |path| path.max_exposure),
        loss_paths: paths
            .iter()
            .filter(|path| path.ending_equity < starting_cash)
            .count(),
        paths,
    })
}

fn stats(report: BacktestReport) -> ScenarioStats {
    ScenarioStats {
        ending_equity: report.marks.last().unwrap().equity,
        max_drawdown: report.largest_drawdown,
        max_exposure: report
            .marks
            .iter()
            .map(|mark| i128::from(mark.close) * i128::from(mark.shares))
            .max()
            .unwrap(),
    }
}

fn quantiles(paths: &[ScenarioStats], get: impl Fn(&ScenarioStats) -> i128) -> ThreeQuantiles {
    let mut ordered: Vec<_> = paths.iter().map(get).collect();
    ordered.sort_unstable();
    let rank = |percent: usize| ordered[(percent * paths.len()).div_ceil(100) - 1];
    ThreeQuantiles {
        p05: rank(5),
        p50: rank(50),
        p95: rank(95),
    }
}

struct SplitMix64(u64);

impl SplitMix64 {
    fn uniform_index(&mut self, length: usize) -> usize {
        let length = length as u64;
        let limit = u64::MAX - u64::MAX % length;
        loop {
            self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
            let mut word = self.0;
            word = (word ^ (word >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
            word = (word ^ (word >> 27)).wrapping_mul(0x94d049bb133111eb);
            let uniform = word ^ (word >> 31);
            if uniform < limit {
                return (uniform % length) as usize;
            }
        }
    }
}
