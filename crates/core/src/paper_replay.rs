use crate::{
    history::{decimal, decimal_ticks, exact_utc},
    universe::valid_id,
    Instrument, PaperAccount, PaperAction, PaperConfig, PaperError, PaperEvent, PaperSide,
};
use std::collections::BTreeMap;

const MAX_ROWS: usize = 20_000;
const MAX_BYTES: usize = 2 * 1024 * 1024;

pub struct PaperReplay {
    events: Vec<PaperEvent>,
}

impl PaperReplay {
    pub fn parse(csv: &str) -> Result<Self, String> {
        if csv.len() > MAX_BYTES {
            return Err("Paper events CSV exceeds 2 MiB.".into());
        }
        let mut rows = csv
            .trim_start_matches('\u{feff}')
            .lines()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty());
        if rows.next().map(|(_, line)| line.trim()) != Some(
            "event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at"
        ) {
            return Err("Expected the paper events CSV header.".into());
        }
        let mut events = Vec::<PaperEvent>::new();
        let mut indices = BTreeMap::<&str, usize>::new();
        for (index, (line, row)) in rows.enumerate() {
            let error = |message: &str| format!("Paper line {}: {message}", line + 1);
            if index == MAX_ROWS {
                return Err(error("Supply at most 20,000 events."));
            }
            let fields: Vec<_> = row.split(',').map(str::trim).collect();
            let [id, observed, kind, order, instrument, side, shares, price, source, price_at] =
                fields.as_slice()
            else {
                return Err(error("Expected ten fields."));
            };
            if !valid_id(id) {
                return Err(error("Use a stable event ID."));
            }
            let observed_at =
                exact_utc(observed).ok_or_else(|| error("Use an exact UTC observation time."))?;
            let quantity = || {
                shares
                    .parse::<u64>()
                    .map_err(|_| error("Use whole shares."))
            };
            let ticks = || decimal(price).ok_or_else(|| error("Use a six-place price."));
            let order_id = || {
                valid_id(order)
                    .then(|| (*order).to_owned())
                    .ok_or_else(|| error("Use a stable order ID."))
            };
            let action = match *kind {
                "submit" if source.is_empty() && price_at.is_empty() => {
                    let symbol = instrument
                        .split_once(':')
                        .and_then(|(venue, symbol)| Instrument::new(venue, symbol).ok())
                        .filter(|symbol| symbol.to_string() == *instrument)
                        .ok_or_else(|| error("Use a canonical VENUE:SYMBOL."))?;
                    let side = match *side {
                        "buy" => PaperSide::Buy,
                        "sell" => PaperSide::Sell,
                        _ => return Err(error("Use buy or sell.")),
                    };
                    PaperAction::Submit {
                        order_id: order_id()?,
                        instrument: symbol,
                        side,
                        shares: quantity()?,
                        limit: ticks()?,
                    }
                }
                "fill" if instrument.is_empty() && side.is_empty() && valid_id(source) => {
                    let price_at = exact_utc(price_at)
                        .ok_or_else(|| error("Use an exact UTC source price time."))?;
                    PaperAction::Fill {
                        order_id: order_id()?,
                        source_id: (*source).into(),
                        price_at,
                        shares: quantity()?,
                        price: ticks()?,
                    }
                }
                "cancel" if fields[4..].iter().all(|field| field.is_empty()) => {
                    PaperAction::Cancel {
                        order_id: order_id()?,
                    }
                }
                "halt" if fields[3..].iter().all(|field| field.is_empty()) => PaperAction::Halt,
                _ => {
                    return Err(error(
                        "Use submit, fill, cancel or halt with the matching fields.",
                    ))
                }
            };
            let event = PaperEvent {
                id: (*id).into(),
                observed_at,
                action,
            };
            if let Some(previous) = indices.get(id) {
                if events[*previous] != event {
                    return Err(error("An event ID has conflicting fields."));
                }
                continue;
            }
            if events
                .last()
                .is_some_and(|previous| previous.observed_at > observed_at)
            {
                return Err(error("New paper events must be in observation order."));
            }
            indices.insert(id, events.len());
            events.push(event);
        }
        if events.is_empty() {
            return Err("Supply at least one paper event.".into());
        }
        Ok(Self { events })
    }

    pub fn cutoffs(&self) -> Vec<i64> {
        let mut times: Vec<_> = self.events.iter().map(|event| event.observed_at).collect();
        times.dedup();
        times
    }

    pub fn account_at(
        &self,
        config: PaperConfig,
        observed_until: i64,
    ) -> Result<PaperAccount, PaperError> {
        let mut ledger = PaperAccount::new(config)?;
        for event in self
            .events
            .iter()
            .take_while(|event| event.observed_at <= observed_until)
        {
            ledger.apply(event.clone())?;
        }
        Ok(ledger)
    }
}

pub fn parse_paper_config(values: &str) -> Result<PaperConfig, String> {
    let fields: Vec<_> = values.split(',').map(str::trim).collect();
    let [starting_cash, max_position_shares, max_committed_cost, fee_per_share, fee_per_order] =
        fields.as_slice()
    else {
        return Err("Supply starting cash, position limit, committed cost limit, per-share fee and per-order fee.".into());
    };
    let money = |value| decimal_ticks(value).ok_or("Use six-place money values.");
    Ok(PaperConfig {
        starting_cash: money(starting_cash)?,
        max_committed_cost: money(max_committed_cost)?,
        max_position_shares: max_position_shares
            .parse()
            .map_err(|_| "Use a whole-share position limit.")?,
        fee_per_share: decimal(fee_per_share).ok_or("Use a six-place per-share fee.")?,
        fee_per_order: decimal(fee_per_order).ok_or("Use a six-place per-order fee.")?,
    })
}
