use crate::{
    replay, Bar, Instrument, PaperAccount, PaperAction, PaperApply, PaperConfig, PaperEvent,
    PaperOrderStatus, PaperSide, Session, MAX_TICKS, SCALE,
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

struct Pending {
    order: String,
    started: usize,
    side: PaperSide,
}

#[derive(Clone, Copy)]
pub(crate) struct ObservedBar<'a> {
    pub index: usize,
    pub at: i64,
    bar: &'a Bar,
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
    if config.fast_window == 0
        || config.slow_window <= config.fast_window
        || config.slow_window > MAX_WINDOW
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
    let mut sums = vec![0_i128];
    let mut previous_relation = None;
    let mut signals = Vec::new();
    let mut marks = Vec::new();
    let instrument_key = instrument.to_string();
    let mut peak = config.paper.starting_cash;
    let mut largest_drawdown = 0;
    for (cursor, &ObservedBar { index, at, bar }) in observations.iter().enumerate() {
        let trading = cursor >= trade_from;
        let observed_bar = marks.len();
        if let Some(order) = &pending {
            if observed_bar - order.started > config.max_wait_bars {
                apply(
                    &mut ledger,
                    format!("EXPIRE-{index}"),
                    at,
                    PaperAction::Cancel {
                        order_id: order.order.clone(),
                    },
                )?;
                pending = None;
            } else {
                let remaining = ledger.orders()[&order.order].remaining;
                let liquidity = i128::from(bar.volume) * i128::from(config.participation_bps)
                    / (i128::from(SCALE) * BASIS);
                let shares = remaining.min(liquidity as u64);
                if shares > 0 {
                    let price = adjust(bar.close, config.slippage_bps, order.side, true);
                    apply(
                        &mut ledger,
                        format!("FILL-{index}"),
                        at,
                        PaperAction::Fill {
                            order_id: order.order.clone(),
                            source_id: format!("BAR-{index}"),
                            price_at: at,
                            shares,
                            price,
                        },
                    )?;
                    if ledger.orders()[&order.order].status == PaperOrderStatus::Filled {
                        pending = None;
                    }
                }
            }
        }

        sums.push(*sums.last().unwrap() + i128::from(bar.close));
        let len = sums.len() - 1;
        if len >= config.slow_window {
            let average = |window| sums[len] - sums[len - window];
            let relation = (average(config.fast_window) * config.slow_window as i128)
                .cmp(&(average(config.slow_window) * config.fast_window as i128));
            let side = match (previous_relation, relation) {
                (Some(Ordering::Equal | Ordering::Less), Ordering::Greater) => Some(PaperSide::Buy),
                (Some(Ordering::Equal | Ordering::Greater), Ordering::Less) => {
                    Some(PaperSide::Sell)
                }
                _ => None,
            };
            previous_relation = Some(relation);
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
        }
        if !trading {
            continue;
        }
        let shares = ledger
            .positions()
            .get(&instrument_key)
            .map_or(0, |position| position.shares);
        let equity = ledger.cash() + i128::from(shares) * i128::from(bar.close);
        peak = peak.max(equity);
        largest_drawdown = largest_drawdown.max(peak - equity);
        marks.push(BacktestMark {
            at,
            close: bar.close,
            cash: ledger.cash(),
            shares,
            equity,
        });
    }
    Ok(BacktestReport {
        ledger,
        signals,
        marks,
        largest_drawdown,
    })
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
