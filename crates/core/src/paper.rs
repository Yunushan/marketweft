use crate::{universe::valid_id, Instrument, MAX_TICKS};
use std::collections::{BTreeMap, BTreeSet};

const MAX_EVENTS: usize = 20_000;
pub(crate) const MAX_SHARES: u64 = 1_000_000_000;
const MAX_CASH_TICKS: i128 = 10_i128.pow(27);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PaperConfig {
    pub starting_cash: i128,
    pub max_position_shares: u64,
    /// Gross committed cost includes entry fees and open buy reserves.
    pub max_committed_cost: i128,
    pub fee_per_share: i64,
    /// Charged once on the first fill of each order.
    pub fee_per_order: i64,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Action {
    Submit {
        order_id: String,
        instrument: Instrument,
        side: Side,
        shares: u64,
        limit: i64,
    },
    Fill {
        order_id: String,
        source_id: String,
        price_at: i64,
        shares: u64,
        price: i64,
    },
    Cancel {
        order_id: String,
    },
    Halt,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaperEvent {
    pub id: String,
    pub observed_at: i64,
    pub action: Action,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Rejection {
    InvalidOrder,
    ExistingOrder,
    UnknownOrder,
    ClosedOrder,
    AccountHalted,
    CashLimit,
    PositionLimit,
    ExposureLimit,
    InsufficientShares,
    InvalidFill,
    IneligiblePriceTime,
    LimitPrice,
    RepeatedFillSource,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LedgerError {
    InvalidConfig,
    InvalidEventId,
    ConflictingEventId,
    OutOfOrder,
    EventLimit,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OrderStatus {
    Open,
    PartiallyFilled,
    Filled,
    Canceled,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Order {
    pub instrument: Instrument,
    pub side: Side,
    pub submitted_at: i64,
    pub limit: i64,
    pub shares: u64,
    pub remaining: u64,
    pub status: OrderStatus,
    used_sources: BTreeSet<String>,
}

impl Order {
    fn working(&self) -> bool {
        matches!(
            self.status,
            OrderStatus::Open | OrderStatus::PartiallyFilled
        )
    }

    fn reserve(&self, config: PaperConfig) -> i128 {
        if !self.working() || self.side != Side::Buy {
            return 0;
        }
        i128::from(self.remaining) * i128::from(self.limit)
            + fee(config, self.remaining, self.remaining == self.shares)
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Position {
    pub shares: u64,
    pub cost: i128,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PaperReceipt {
    pub rejection: Option<Rejection>,
    pub cash_delta: i128,
    pub fee: i128,
    pub realized_delta: i128,
}

impl PaperReceipt {
    fn accepted() -> Self {
        Self {
            rejection: None,
            cash_delta: 0,
            fee: 0,
            realized_delta: 0,
        }
    }

    fn rejected(reason: Rejection) -> Self {
        Self {
            rejection: Some(reason),
            ..Self::accepted()
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Apply {
    Applied(PaperReceipt),
    Duplicate(PaperReceipt),
}

pub struct PaperAccount {
    config: PaperConfig,
    cash: i128,
    realized: i128,
    halted: bool,
    reserved: i128,
    inventory_cost: i128,
    working: BTreeMap<(String, Side), u64>,
    orders: BTreeMap<String, Order>,
    positions: BTreeMap<String, Position>,
    history: Vec<(PaperEvent, PaperReceipt)>,
    indices: BTreeMap<String, usize>,
}

impl PaperAccount {
    pub fn new(config: PaperConfig) -> Result<Self, LedgerError> {
        if !(0..=MAX_CASH_TICKS).contains(&config.starting_cash)
            || !(1..=MAX_CASH_TICKS).contains(&config.max_committed_cost)
            || !(1..=MAX_SHARES).contains(&config.max_position_shares)
            || !(0..=MAX_TICKS).contains(&config.fee_per_share)
            || !(0..=MAX_TICKS).contains(&config.fee_per_order)
        {
            return Err(LedgerError::InvalidConfig);
        }
        Ok(Self {
            config,
            cash: config.starting_cash,
            realized: 0,
            halted: false,
            reserved: 0,
            inventory_cost: 0,
            working: BTreeMap::new(),
            orders: BTreeMap::new(),
            positions: BTreeMap::new(),
            history: Vec::new(),
            indices: BTreeMap::new(),
        })
    }

    pub fn cash(&self) -> i128 {
        self.cash
    }
    pub fn realized(&self) -> i128 {
        self.realized
    }
    pub fn halted(&self) -> bool {
        self.halted
    }
    pub fn orders(&self) -> &BTreeMap<String, Order> {
        &self.orders
    }
    pub fn positions(&self) -> &BTreeMap<String, Position> {
        &self.positions
    }
    pub fn history(&self) -> &[(PaperEvent, PaperReceipt)] {
        &self.history
    }
    pub fn reserved_cash(&self) -> i128 {
        self.reserved
    }
    pub fn available_cash(&self) -> i128 {
        self.cash - self.reserved_cash()
    }
    pub fn committed_cost(&self) -> i128 {
        self.reserved + self.inventory_cost
    }

    /// Returns the previous receipt for an identical repeated event without applying it again.
    pub fn apply(&mut self, event: PaperEvent) -> Result<Apply, LedgerError> {
        if !valid_id(&event.id) {
            return Err(LedgerError::InvalidEventId);
        }
        if let Some(index) = self.indices.get(&event.id) {
            let (prior, receipt) = &self.history[*index];
            return if prior == &event {
                Ok(Apply::Duplicate(*receipt))
            } else {
                Err(LedgerError::ConflictingEventId)
            };
        }
        if self
            .history
            .last()
            .is_some_and(|(prior, _)| prior.observed_at > event.observed_at)
        {
            return Err(LedgerError::OutOfOrder);
        }
        if self.history.len() == MAX_EVENTS {
            return Err(LedgerError::EventLimit);
        }

        let receipt = self.execute(&event).unwrap_or_else(PaperReceipt::rejected);
        self.indices.insert(event.id.clone(), self.history.len());
        self.history.push((event, receipt));
        Ok(Apply::Applied(receipt))
    }

    fn execute(&mut self, event: &PaperEvent) -> Result<PaperReceipt, Rejection> {
        match &event.action {
            Action::Submit {
                order_id,
                instrument,
                side,
                shares,
                limit,
            } => {
                let order = Order {
                    instrument: instrument.clone(),
                    side: *side,
                    submitted_at: event.observed_at,
                    limit: *limit,
                    shares: *shares,
                    remaining: *shares,
                    status: OrderStatus::Open,
                    used_sources: BTreeSet::new(),
                };
                self.submit(order_id, order)
            }
            Action::Fill {
                order_id,
                source_id,
                price_at,
                shares,
                price,
            } => self.fill(
                order_id,
                source_id,
                *price_at,
                event.observed_at,
                *shares,
                *price,
            ),
            Action::Cancel { order_id } => {
                let order = self
                    .orders
                    .get_mut(order_id)
                    .ok_or(Rejection::UnknownOrder)?;
                if !order.working() {
                    return Err(Rejection::ClosedOrder);
                }
                self.reserved -= order.reserve(self.config);
                release_shares(
                    &mut self.working,
                    (order.instrument.to_string(), order.side),
                    order.remaining,
                );
                order.status = OrderStatus::Canceled;
                Ok(PaperReceipt::accepted())
            }
            Action::Halt => {
                self.halted = true;
                self.reserved = 0;
                self.working.clear();
                for order in self.orders.values_mut().filter(|order| order.working()) {
                    order.status = OrderStatus::Canceled;
                }
                Ok(PaperReceipt::accepted())
            }
        }
    }

    fn submit(&mut self, id: &str, order: Order) -> Result<PaperReceipt, Rejection> {
        if self.halted {
            return Err(Rejection::AccountHalted);
        }
        if !valid_id(id)
            || !(1..=MAX_SHARES).contains(&order.shares)
            || !(1..=MAX_TICKS).contains(&order.limit)
            || Instrument::new(&order.instrument.venue, &order.instrument.symbol)
                .ok()
                .as_ref()
                != Some(&order.instrument)
        {
            return Err(Rejection::InvalidOrder);
        }
        if self.orders.contains_key(id) {
            return Err(Rejection::ExistingOrder);
        }
        let key = (order.instrument.to_string(), order.side);
        let position = self.positions.get(&key.0).copied().unwrap_or_default();
        let working = self.working.get(&key).copied().unwrap_or_default();
        match order.side {
            Side::Buy => {
                let reserve = order.reserve(self.config);
                if position.shares + working + order.shares > self.config.max_position_shares {
                    return Err(Rejection::PositionLimit);
                }
                if self.available_cash() < reserve {
                    return Err(Rejection::CashLimit);
                }
                if self.committed_cost() + reserve > self.config.max_committed_cost {
                    return Err(Rejection::ExposureLimit);
                }
            }
            Side::Sell => {
                if order.shares + working > position.shares {
                    return Err(Rejection::InsufficientShares);
                }
            }
        }
        self.reserved += order.reserve(self.config);
        *self.working.entry(key).or_default() += order.shares;
        self.orders.insert(id.into(), order);
        Ok(PaperReceipt::accepted())
    }

    fn fill(
        &mut self,
        id: &str,
        source: &str,
        price_at: i64,
        observed_at: i64,
        shares: u64,
        price: i64,
    ) -> Result<PaperReceipt, Rejection> {
        if self.halted {
            return Err(Rejection::AccountHalted);
        }
        let order = self.orders.get(id).ok_or(Rejection::UnknownOrder)?;
        if !order.working() {
            return Err(Rejection::ClosedOrder);
        }
        if !valid_id(source)
            || !(1..=order.remaining).contains(&shares)
            || !(1..=MAX_TICKS).contains(&price)
        {
            return Err(Rejection::InvalidFill);
        }
        if price_at <= order.submitted_at || price_at > observed_at {
            return Err(Rejection::IneligiblePriceTime);
        }
        if order.used_sources.contains(source) {
            return Err(Rejection::RepeatedFillSource);
        }
        if (order.side == Side::Buy && price > order.limit)
            || (order.side == Side::Sell && price < order.limit)
        {
            return Err(Rejection::LimitPrice);
        }
        let key = order.instrument.to_string();
        let position = self.positions.get(&key).copied().unwrap_or_default();
        let charge = fee(self.config, shares, order.remaining == order.shares);
        let principal = i128::from(price) * i128::from(shares);
        let (new_position, cash_delta, realized_delta) = match order.side {
            Side::Buy => {
                let cost = principal + charge;
                (
                    Position {
                        shares: position.shares + shares,
                        cost: position.cost + cost,
                    },
                    -cost,
                    0,
                )
            }
            Side::Sell => {
                // Round allocation down to a tick and retain the remainder in the open position.
                let retired = position.cost * i128::from(shares) / i128::from(position.shares);
                let cash_delta = principal - charge;
                if self.available_cash() + cash_delta < 0 {
                    return Err(Rejection::CashLimit);
                }
                (
                    Position {
                        shares: position.shares - shares,
                        cost: position.cost - retired,
                    },
                    cash_delta,
                    cash_delta - retired,
                )
            }
        };
        let order = self.orders.get_mut(id).unwrap();
        let prior_reserve = order.reserve(self.config);
        order.used_sources.insert(source.into());
        order.remaining -= shares;
        order.status = if order.remaining == 0 {
            OrderStatus::Filled
        } else {
            OrderStatus::PartiallyFilled
        };
        self.reserved += order.reserve(self.config) - prior_reserve;
        self.inventory_cost += new_position.cost - position.cost;
        release_shares(&mut self.working, (key.clone(), order.side), shares);
        if new_position.shares == 0 {
            self.positions.remove(&key);
        } else {
            self.positions.insert(key, new_position);
        }
        self.cash += cash_delta;
        self.realized += realized_delta;
        Ok(PaperReceipt {
            rejection: None,
            cash_delta,
            fee: charge,
            realized_delta,
        })
    }
}

fn fee(config: PaperConfig, shares: u64, first: bool) -> i128 {
    i128::from(shares) * i128::from(config.fee_per_share)
        + if first {
            i128::from(config.fee_per_order)
        } else {
            0
        }
}

fn release_shares(working: &mut BTreeMap<(String, Side), u64>, key: (String, Side), shares: u64) {
    let std::collections::btree_map::Entry::Occupied(mut reservation) = working.entry(key) else {
        unreachable!("working orders always have a share reservation")
    };
    *reservation.get_mut() -= shares;
    if *reservation.get() == 0 {
        reservation.remove();
    }
}
