use super::{DepthBook, DepthLevel, DepthStamp, DepthStatus, DepthTape, Frame, Side};
use crate::{
    history::valid_second, Instrument, PaperAccount, PaperAction, PaperApply, PaperConfig,
    PaperError, PaperEvent, PaperReplay, PaperSide, SCALE,
};
use std::collections::BTreeMap;

const FILL_PREFIX: &str = "DEPTH-F-";
const MAX_MATCH_CHECKS: usize = 2_000_000;

pub struct PaperDepthReplay {
    controls: PaperReplay,
    depth: DepthTape,
}

pub struct PaperDepthReport {
    pub ledger: PaperAccount,
    pub status: DepthStatus,
    pub received: Option<DepthStamp>,
}

impl PaperDepthReplay {
    pub fn parse(controls: &str, depth: &str, instrument: &Instrument) -> Result<Self, String> {
        let controls = PaperReplay::parse(controls)?;
        for event in controls.events() {
            if event.id.starts_with(FILL_PREFIX) {
                return Err("Depth-generated receipt IDs use the reserved DEPTH-F- prefix.".into());
            }
            match &event.action {
                PaperAction::Submit {
                    instrument: listed, ..
                } if listed == instrument => {}
                PaperAction::Submit { .. } => {
                    return Err("Paper orders and depth must describe the same instrument.".into())
                }
                PaperAction::Cancel { .. } | PaperAction::Halt => {}
                _ => return Err(
                    "Paper depth controls may submit, cancel and halt. Depth supplies the fills."
                        .into(),
                ),
            }
        }
        let depth = DepthTape::parse(depth, instrument)?;
        Ok(Self { controls, depth })
    }

    pub fn cutoffs(&self) -> Vec<i64> {
        let mut times = self.controls.cutoffs();
        times.extend(self.depth.checkpoints());
        times.sort_unstable();
        times.dedup();
        times
    }

    /// Replay observed controls and eligible liquidity in capture order.
    /// Each frame supplies only its quoted levels, once across all working orders.
    pub fn account_at(&self, config: PaperConfig, cutoff: i64) -> Result<PaperDepthReport, String> {
        if !valid_second(cutoff) {
            return Err("Use a supported UTC paper cutoff.".into());
        }
        let mut ledger = PaperAccount::new(config).map_err(paper_error)?;
        let mut controls = self.controls.events().iter().enumerate().peekable();
        let mut matcher = Matcher {
            book: DepthBook::new(),
            consumed: BTreeMap::new(),
            submission_order: BTreeMap::new(),
            match_checks: 0,
        };
        for frame in self
            .depth
            .frames
            .iter()
            .take_while(|frame| frame.stamp.observed_at <= cutoff)
        {
            while let Some((index, event)) =
                controls.next_if(|(_, event)| event.observed_at <= frame.stamp.observed_at)
            {
                let receipt = ledger.apply(event.clone()).map_err(paper_error)?;
                if let PaperAction::Submit { order_id, .. } = &event.action {
                    if matches!(receipt, PaperApply::Applied(receipt) if receipt.rejection.is_none())
                    {
                        matcher.submission_order.insert(order_id.as_str(), index);
                    }
                }
            }
            matcher.apply(frame, &mut ledger)?;
        }
        for (_, event) in controls.take_while(|(_, event)| event.observed_at <= cutoff) {
            ledger.apply(event.clone()).map_err(paper_error)?;
        }
        Ok(PaperDepthReport {
            ledger,
            status: matcher.book.status,
            received: matcher.book.received,
        })
    }
}

struct Matcher<'a> {
    book: DepthBook,
    consumed: BTreeMap<(Side, i64), i64>,
    submission_order: BTreeMap<&'a str, usize>,
    match_checks: usize,
}

impl Matcher<'_> {
    fn apply(&mut self, frame: &Frame, ledger: &mut PaperAccount) -> Result<(), String> {
        self.book.apply(frame);
        if frame.snapshot {
            self.consumed.clear();
        }
        if self.book.status != DepthStatus::Synchronized || ledger.halted() {
            return Ok(());
        }
        self.count_checks(ledger.orders().len())?;
        let mut buy_orders = Vec::new();
        let mut sell_orders = Vec::new();
        for (id, order) in ledger
            .orders()
            .iter()
            .filter(|(_, order)| order.working() && order.submitted_at < frame.stamp.event_at)
        {
            let index = self.submission_order[id.as_str()];
            match order.side {
                PaperSide::Buy => buy_orders.push((-order.limit, index, id.clone())),
                PaperSide::Sell => sell_orders.push((order.limit, index, id.clone())),
            }
        }
        buy_orders.sort_unstable();
        sell_orders.sort_unstable();
        let mut levels = frame.levels.clone();
        levels.sort_unstable_by_key(|(side, level)| {
            (
                *side,
                match side {
                    Side::Bid => -level.price,
                    Side::Ask => level.price,
                },
            )
        });
        let mut next_fill = 0;
        for (level_index, (side, DepthLevel { price, size })) in levels.into_iter().enumerate() {
            let key = (side, price);
            let previously_consumed = self.consumed.get(&key).copied().unwrap_or(0).min(size);
            let mut taken = previously_consumed;
            if size - taken >= SCALE && price > 0 {
                let orders = match side {
                    Side::Bid => &sell_orders,
                    Side::Ask => &buy_orders,
                };
                for (priority, _, id) in orders {
                    self.count_checks(1)?;
                    let available = (size - taken) / SCALE;
                    let crosses = match side {
                        Side::Bid => price >= *priority,
                        Side::Ask => price <= -*priority,
                    };
                    if available == 0 || !crosses {
                        break;
                    }
                    let order = &ledger.orders()[id];
                    if !order.working() {
                        continue;
                    }
                    let shares = order.remaining.min(available as u64);
                    next_fill += 1;
                    let fill = PaperEvent {
                        id: format!("{FILL_PREFIX}{}-{next_fill}", frame.stamp.sequence),
                        observed_at: frame.stamp.observed_at,
                        action: PaperAction::Fill {
                            order_id: id.clone(),
                            source_id: format!(
                                "DEPTH-{}-{}",
                                frame.stamp.sequence,
                                level_index + 1
                            ),
                            price_at: frame.stamp.event_at,
                            shares,
                            price,
                        },
                    };
                    if matches!(ledger.apply(fill).map_err(paper_error)?, PaperApply::Applied(receipt) if receipt.rejection.is_none())
                    {
                        taken += (shares as i64) * SCALE;
                    }
                }
            }
            if taken == 0 {
                self.consumed.remove(&key);
            } else {
                self.consumed.insert(key, taken);
            }
        }
        Ok(())
    }

    fn count_checks(&mut self, more: usize) -> Result<(), String> {
        self.match_checks += more;
        if self.match_checks > MAX_MATCH_CHECKS {
            return Err(
                "Paper depth replay exceeds two million order checks. Use a shorter report window."
                    .into(),
            );
        }
        Ok(())
    }
}

fn paper_error(error: PaperError) -> String {
    match error {
        PaperError::InvalidConfig => {
            "Invalid paper account cash, position, exposure or fee configuration."
        }
        PaperError::EventLimit => {
            "Paper depth replay exceeds 20,000 ledger events. Use shorter reports."
        }
        _ => "Could not replay the paper depth account history.",
    }
    .into()
}
