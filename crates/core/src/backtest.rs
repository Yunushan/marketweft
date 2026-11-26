use crate::{
    history::valid_second, replay, tick_bars::Trade, Bar, Formula, Instrument, PaperAccount,
    PaperAction, PaperApply, PaperConfig, PaperEvent, PaperOrderStatus, PaperSide, Session,
    TradeTape, MAX_TICKS, SCALE,
};
use std::cmp::Ordering;

const MAX_WINDOW: usize = 1_000;
const MAX_REPLAY_BARS: usize = 5_000;
const BASIS: i128 = 10_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BacktestConfig {
    pub paper: PaperConfig,
    pub fast_window: usize,
    pub slow_window: usize,
    pub target_shares: u64,
    pub participation_bps: u16,
    pub slippage_bps: u16,
    pub limit_buffer_bps: u16,
    /// Count only observed bars after the signal. Missing intervals cannot fill or expire an order.
    pub max_wait_bars: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BacktestSignal {
    pub at: i64,
    pub bar_index: usize,
    pub side: PaperSide,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BacktestMark {
    pub at: i64,
    pub close: i64,
    pub cash: i128,
    pub shares: u64,
    pub equity: i128,
}

pub struct BacktestReport {
    pub ledger: PaperAccount,
    pub signals: Vec<BacktestSignal>,
    pub marks: Vec<BacktestMark>,
    pub largest_drawdown: i128,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RecordedBacktestCutoffs {
    pub effective_at: i64,
    pub known_at: i64,
}

impl RecordedBacktestCutoffs {
    fn visible_bar(self) -> Result<i64, String> {
        if !valid_second(self.effective_at) || !valid_second(self.known_at) {
            return Err("Use supported effective and known UTC cutoffs.".into());
        }
        Ok(self.effective_at.min(self.known_at))
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FormulaBacktestSignal {
    pub at: i64,
    pub bar_index: usize,
    pub entry: Option<i64>,
    pub exit: Option<i64>,
    pub decision: Option<PaperSide>,
}

pub struct FormulaBacktestConfig<'a> {
    pub cutoffs: RecordedBacktestCutoffs,
    pub execution: BacktestConfig,
    pub entry: &'a Formula,
    pub exit: &'a Formula,
}

pub struct FormulaBacktestReport {
    pub backtest: BacktestReport,
    pub evaluations: Vec<FormulaBacktestSignal>,
}

struct Pending {
    order: String,
    started: usize,
    side: PaperSide,
}

#[derive(Clone, Copy)]
pub(crate) struct ObservedBar<'a> {
    pub index: usize,
    pub at: i64,
    pub bar: &'a Bar,
}

pub fn backtest(
    instrument: &Instrument,
    sessions: &[Session],
    bars: &[Bar],
    interval: u32,
    through: i64,
    config: BacktestConfig,
) -> Result<BacktestReport, String> {
    let mut observations = prepare_observations(instrument, sessions, bars, interval)?;
    observations.truncate(observations.partition_point(|row| row.at <= through));
    evaluate(instrument, &observations, 0, config)
}

pub fn backtest_with_trades(
    instrument: &Instrument,
    sessions: &[Session],
    bars: &[Bar],
    interval: u32,
    cutoffs: RecordedBacktestCutoffs,
    config: BacktestConfig,
    trades: &TradeTape,
) -> Result<BacktestReport, String> {
    let visible_bar = cutoffs.visible_bar()?;
    let playback = TradePlayback::new(instrument, sessions, cutoffs, trades)?;
    let mut observations = prepare_observations(instrument, sessions, bars, interval)?;
    observations.truncate(observations.partition_point(|row| row.at <= visible_bar));
    run_backtest(instrument, &observations, 0, config, Some(playback), None)
}

/// Evaluate one entry and exit condition at every observed close. A known
/// nonzero exit takes priority. Order admission and fills use the paper engine.
pub fn backtest_with_formulas(
    instrument: &Instrument,
    sessions: &[Session],
    bars: &[Bar],
    interval: u32,
    config: FormulaBacktestConfig<'_>,
    trades: Option<&TradeTape>,
) -> Result<FormulaBacktestReport, String> {
    let visible_bar = config.cutoffs.visible_bar()?;
    let playback = trades
        .map(|tape| TradePlayback::new(instrument, sessions, config.cutoffs, tape))
        .transpose()?;
    let mut observations = prepare_observations(instrument, sessions, bars, interval)?;
    observations.truncate(observations.partition_point(|row| row.at <= visible_bar));
    let visible: Vec<_> = observations.iter().map(|row| *row.bar).collect();
    let entry = config
        .entry
        .evaluate(&visible)
        .map_err(|cause| format!("Entry formula: {cause}"))?;
    let exit = config
        .exit
        .evaluate(&visible)
        .map_err(|cause| format!("Exit formula: {cause}"))?;
    let evaluations: Vec<_> = observations
        .iter()
        .zip(entry)
        .zip(exit)
        .map(|((bar, entry), exit)| {
            let decision = if exit.is_some_and(|value| value != 0) {
                Some(PaperSide::Sell)
            } else if entry.is_some_and(|value| value != 0) {
                Some(PaperSide::Buy)
            } else {
                None
            };
            FormulaBacktestSignal {
                at: bar.at,
                bar_index: bar.index,
                entry,
                exit,
                decision,
            }
        })
        .collect();
    let backtest = run_backtest(
        instrument,
        &observations,
        0,
        config.execution,
        playback,
        Some(&evaluations),
    )?;
    Ok(FormulaBacktestReport {
        backtest,
        evaluations,
    })
}

pub(crate) fn prepare_observations<'a>(
    instrument: &Instrument,
    sessions: &[Session],
    bars: &'a [Bar],
    interval: u32,
) -> Result<Vec<ObservedBar<'a>>, String> {
    if bars.len() > MAX_REPLAY_BARS
        || bars.iter().any(|bar| {
            !(1..=MAX_TICKS).contains(&bar.close) || !(0..=MAX_TICKS).contains(&bar.volume)
        })
    {
        return Err("Supply up to 5,000 bars with positive close and nonnegative volume.".into());
    }
    if Instrument::new(&instrument.venue, &instrument.symbol)? != *instrument {
        return Err("Use a canonical VENUE:SYMBOL for backtesting.".into());
    }
    let times: Vec<_> = bars.iter().map(|bar| bar.time).collect();
    Ok(replay(sessions, &times, interval)?
        .into_iter()
        .filter_map(|event| {
            let index = event.bar_index?;
            Some(ObservedBar {
                index,
                at: event.observed_at,
                bar: &bars[index],
            })
        })
        .collect())
}

pub(crate) fn evaluate(
    instrument: &Instrument,
    observations: &[ObservedBar<'_>],
    trade_from: usize,
    config: BacktestConfig,
) -> Result<BacktestReport, String> {
    run_backtest(instrument, observations, trade_from, config, None, None)
}

fn run_backtest(
    instrument: &Instrument,
    observations: &[ObservedBar<'_>],
    trade_from: usize,
    config: BacktestConfig,
    mut playback: Option<TradePlayback<'_>>,
    scripted: Option<&[FormulaBacktestSignal]>,
) -> Result<BacktestReport, String> {
    if (scripted.is_none()
        && (config.fast_window == 0
            || config.slow_window <= config.fast_window
            || config.slow_window > MAX_WINDOW))
        || !(1..=1_000_000_000).contains(&config.target_shares)
        || !(1..=10_000).contains(&config.participation_bps)
        || config.slippage_bps > 10_000
        || config.limit_buffer_bps > 10_000
        || !(1..=MAX_REPLAY_BARS).contains(&config.max_wait_bars)
    {
        return Err(
            "Invalid backtest windows, target, participation, slippage, buffer or wait.".into(),
        );
    }
    let mut ledger = PaperAccount::new(config.paper).map_err(|_| "Invalid paper configuration.")?;
    let mut pending: Option<Pending> = None;
    let mut crossover = SmaCrossover {
        sums: vec![0],
        previous: None,
    };
    let mut signals = Vec::new();
    let instrument_key = instrument.to_string();
    let mut equity = EquityTimeline::new(&instrument_key, config.paper.starting_cash);
    let mut observed_bar = 0;
    for (cursor, &ObservedBar { index, at, bar }) in observations.iter().enumerate() {
        let trading = cursor >= trade_from;
        if let Some(stream) = &mut playback {
            stream.advance(at - 1, &mut ledger, &mut pending, config, Some(&mut equity))?;
        }
        if pending
            .as_ref()
            .is_some_and(|order: &Pending| observed_bar - order.started > config.max_wait_bars)
        {
            let order = pending.take().unwrap();
            apply(
                &mut ledger,
                format!("EXPIRE-{index}"),
                at,
                PaperAction::Cancel {
                    order_id: order.order,
                },
            )?;
        }
        if let Some(stream) = &mut playback {
            stream.advance(at, &mut ledger, &mut pending, config, None)?;
        } else if pending.is_some() {
            attempt_fill(
                &mut ledger,
                &mut pending,
                config,
                FillOpportunity {
                    quote_at: at,
                    observed_at: at,
                    price: bar.close,
                    volume: bar.volume,
                    capture: Capture::Bar(index),
                },
            )?;
        }

        let side = match scripted {
            Some(rows) => rows[cursor].decision,
            None => crossover.observe(bar.close, config.fast_window, config.slow_window),
        };
        if let Some(side) = side.filter(|_| trading) {
            signals.push(BacktestSignal {
                at,
                bar_index: index,
                side,
            });
            if pending.as_ref().is_some_and(|order| order.side != side) {
                let order = pending.take().unwrap();
                apply(
                    &mut ledger,
                    format!("CANCEL-{index}"),
                    at,
                    PaperAction::Cancel {
                        order_id: order.order,
                    },
                )?;
            }
            let held = ledger
                .positions()
                .get(&instrument_key)
                .map_or(0, |position| position.shares);
            let shares = match side {
                PaperSide::Buy => config.target_shares.saturating_sub(held),
                PaperSide::Sell => held,
            };
            if pending.is_none() && shares > 0 {
                let order_id = format!("ORDER-{index}");
                let limit = adjust(bar.close, config.limit_buffer_bps, side, false);
                let accepted = apply(
                    &mut ledger,
                    format!("SUBMIT-{index}"),
                    at,
                    PaperAction::Submit {
                        order_id: order_id.clone(),
                        instrument: instrument.clone(),
                        side,
                        shares,
                        limit,
                    },
                )?;
                if accepted {
                    pending = Some(Pending {
                        order: order_id,
                        started: observed_bar,
                        side,
                    });
                }
            }
        }
        if !trading {
            continue;
        }
        equity.add(&ledger, at, bar.close);
        observed_bar += 1;
    }
    if let Some(stream) = &mut playback {
        stream.advance(
            i64::MAX,
            &mut ledger,
            &mut pending,
            config,
            Some(&mut equity),
        )?;
    }
    Ok(BacktestReport {
        ledger,
        signals,
        marks: equity.marks,
        largest_drawdown: equity.largest_drawdown,
    })
}

struct SmaCrossover {
    sums: Vec<i128>,
    previous: Option<Ordering>,
}

impl SmaCrossover {
    fn observe(&mut self, close: i64, fast: usize, slow: usize) -> Option<PaperSide> {
        let current = self.sums.last().unwrap() + i128::from(close);
        self.sums.push(current);
        let len = self.sums.len() - 1;
        if len < slow {
            return None;
        }
        let sum = |window| current - self.sums[len - window];
        let relation = (sum(fast) * slow as i128).cmp(&(sum(slow) * fast as i128));
        match (self.previous.replace(relation), relation) {
            (Some(Ordering::Equal | Ordering::Less), Ordering::Greater) => Some(PaperSide::Buy),
            (Some(Ordering::Equal | Ordering::Greater), Ordering::Less) => Some(PaperSide::Sell),
            _ => None,
        }
    }
}

struct EquityTimeline<'a> {
    instrument: &'a str,
    marks: Vec<BacktestMark>,
    peak: i128,
    largest_drawdown: i128,
}

impl<'a> EquityTimeline<'a> {
    fn new(instrument: &'a str, starting_cash: i128) -> Self {
        Self {
            instrument,
            marks: Vec::new(),
            peak: starting_cash,
            largest_drawdown: 0,
        }
    }

    fn add(&mut self, ledger: &PaperAccount, at: i64, close: i64) {
        let shares = ledger
            .positions()
            .get(self.instrument)
            .map_or(0, |position| position.shares);
        let cash = ledger.cash();
        let equity = cash + i128::from(shares) * i128::from(close);
        self.peak = self.peak.max(equity);
        self.largest_drawdown = self.largest_drawdown.max(self.peak - equity);
        self.marks.push(BacktestMark {
            at,
            close,
            cash,
            shares,
            equity,
        });
    }
}

enum Capture {
    Bar(usize),
    Trade(u64),
}

struct FillOpportunity {
    quote_at: i64,
    observed_at: i64,
    price: i64,
    volume: i64,
    capture: Capture,
}

fn attempt_fill(
    ledger: &mut PaperAccount,
    pending: &mut Option<Pending>,
    config: BacktestConfig,
    quote: FillOpportunity,
) -> Result<bool, String> {
    let Some(order) = pending.as_ref() else {
        return Ok(false);
    };
    let working = &ledger.orders()[&order.order];
    if quote.quote_at <= working.submitted_at {
        return Ok(false);
    }
    let capacity = i128::from(quote.volume) * i128::from(config.participation_bps)
        / (i128::from(SCALE) * BASIS);
    let shares = working.remaining.min(capacity as u64);
    if shares == 0 {
        return Ok(false);
    }
    let (event_id, source_id) = match quote.capture {
        Capture::Bar(index) => (format!("FILL-{index}"), format!("BAR-{index}")),
        Capture::Trade(sequence) => (
            format!("TRADE-FILL-{sequence}"),
            format!("TRADE-{sequence}"),
        ),
    };
    let price = adjust(quote.price, config.slippage_bps, order.side, true);
    let accepted = apply(
        ledger,
        event_id,
        quote.observed_at,
        PaperAction::Fill {
            order_id: order.order.clone(),
            source_id,
            price_at: quote.quote_at,
            shares,
            price,
        },
    )?;
    if ledger.orders()[&order.order].status == PaperOrderStatus::Filled {
        *pending = None;
    }
    Ok(accepted)
}

struct TradePlayback<'a> {
    trades: &'a [Trade],
    sessions: &'a [Session],
    effective_at: i64,
}

impl<'a> TradePlayback<'a> {
    fn new(
        instrument: &Instrument,
        sessions: &'a [Session],
        cutoffs: RecordedBacktestCutoffs,
        trades: &'a TradeTape,
    ) -> Result<Self, String> {
        if trades.instrument() != instrument {
            return Err("Recorded trades must match the backtest instrument.".into());
        }
        Ok(Self {
            trades: trades.observed_prefix(Some(cutoffs.known_at)),
            sessions,
            effective_at: cutoffs.effective_at,
        })
    }

    fn advance(
        &mut self,
        through: i64,
        ledger: &mut PaperAccount,
        pending: &mut Option<Pending>,
        config: BacktestConfig,
        mut equity: Option<&mut EquityTimeline<'_>>,
    ) -> Result<(), String> {
        let count = self
            .trades
            .partition_point(|trade| trade.observed_at <= through);
        let (prefix, remaining) = self.trades.split_at(count);
        self.trades = remaining;
        for group in prefix.chunk_by(|left, right| left.observed_at == right.observed_at) {
            let mut changed = false;
            for trade in group {
                let session = self
                    .sessions
                    .partition_point(|session| session.close <= trade.executed_at);
                if trade.executed_at > self.effective_at
                    || trade.price <= 0
                    || !self
                        .sessions
                        .get(session)
                        .is_some_and(|row| row.open <= trade.executed_at)
                {
                    continue;
                }
                changed |= attempt_fill(
                    ledger,
                    pending,
                    config,
                    FillOpportunity {
                        quote_at: trade.executed_at,
                        observed_at: trade.observed_at,
                        price: trade.price,
                        volume: trade.size,
                        capture: Capture::Trade(trade.sequence),
                    },
                )?;
            }
            if let Some(timeline) = equity.as_deref_mut().filter(|_| changed) {
                if let Some(close) = timeline.marks.last().map(|mark| mark.close) {
                    timeline.add(ledger, group[0].observed_at, close);
                }
            }
        }
        Ok(())
    }
}

fn adjust(price: i64, basis_points: u16, side: PaperSide, fill: bool) -> i64 {
    let shift = i128::from(basis_points);
    let factor = if side == PaperSide::Buy {
        BASIS + shift
    } else {
        BASIS - shift
    };
    let numerator = i128::from(price) * factor;
    let round_up = (side == PaperSide::Buy) == fill;
    // Adverse prices round away from the trader. Protective limits round in the opposite direction.
    let ticks = (numerator + if round_up { BASIS - 1 } else { 0 }) / BASIS;
    if fill {
        ticks as i64
    } else {
        ticks.clamp(1, i128::from(MAX_TICKS)) as i64
    }
}

fn apply(
    ledger: &mut PaperAccount,
    id: String,
    observed_at: i64,
    action: PaperAction,
) -> Result<bool, String> {
    match ledger.apply(PaperEvent {
        id,
        observed_at,
        action,
    }) {
        Ok(PaperApply::Applied(receipt)) => Ok(receipt.rejection.is_none()),
        _ => Err("Could not record a deterministic backtest event.".into()),
    }
}
