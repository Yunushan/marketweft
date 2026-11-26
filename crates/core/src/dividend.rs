use crate::{
    history::{decimal, timestamp},
    Instrument, MAX_TICKS,
};
use std::collections::BTreeMap;

const MAX_ROWS: usize = 1_000;
const MAX_SHARES: u32 = 1_000_000;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dividend {
    pub id: String,
    pub announced_at: i64,
    pub ex_at: i64,
    pub pay_at: i64,
    pub observed_at: i64,
    pub currency: String,
    pub amount_per_share: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum DividendKind {
    Report = 0,
    Ex = 1,
    Pay = 2,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DividendMovement {
    pub currency: String,
    pub receivable_delta: i128,
    pub cash_delta: i128,
    pub receivable: i128,
    pub cash: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DividendEvent {
    pub at: i64,
    pub kind: DividendKind,
    pub revision: Dividend,
    pub movements: Vec<DividendMovement>,
}

#[derive(Clone, Debug)]
pub struct DividendBook(Vec<Dividend>);

impl DividendBook {
    pub fn new(mut rows: Vec<Dividend>) -> Result<Self, String> {
        if rows.is_empty() || rows.len() > MAX_ROWS {
            return Err("Supply 1–1,000 dividend reports.".into());
        }
        for row in &rows {
            validate(row).map_err(|error| format!("Dividend {}: {error}", row.id))?;
        }
        rows.sort_unstable_by(|a, b| (&a.id, a.observed_at).cmp(&(&b.id, b.observed_at)));
        if rows
            .windows(2)
            .any(|w| w[0].id == w[1].id && w[0].observed_at == w[1].observed_at)
        {
            return Err("Dividend revisions need distinct observation times for one ID.".into());
        }
        Ok(Self(rows))
    }

    /// Gross cash events for a supplied whole-share entitlement per distribution.
    /// Apply events through the inclusive cutoff to reconstruct a replay snapshot.
    pub fn ledger(&self, entitled_shares: u32) -> Result<Vec<DividendEvent>, String> {
        if entitled_shares > MAX_SHARES {
            return Err("Supply 0–1,000,000 whole entitled shares.".into());
        }

        let mut events = Vec::new();
        for revisions in self.0.chunk_by(|a, b| a.id == b.id) {
            let mut previous: Option<(&str, Amounts)> = None;
            for (i, row) in revisions.iter().enumerate() {
                let next = revisions.get(i + 1).map(|r| r.observed_at);
                let gross = i128::from(row.amount_per_share) * i128::from(entitled_shares);
                let mut append = |at: i64, kind| {
                    let target = if at >= row.pay_at {
                        Amounts {
                            receivable: 0,
                            cash: gross,
                        }
                    } else if at >= row.ex_at {
                        Amounts {
                            receivable: gross,
                            cash: 0,
                        }
                    } else {
                        Amounts::default()
                    };

                    let mut deltas = Vec::new();
                    match previous {
                        Some((currency, old)) if currency == row.currency => {
                            push_movement(&mut deltas, currency, target.minus(old));
                        }
                        old => {
                            if let Some((currency, amount)) = old {
                                push_movement(
                                    &mut deltas,
                                    currency,
                                    Amounts::default().minus(amount),
                                );
                            }
                            push_movement(&mut deltas, &row.currency, target);
                        }
                    }
                    previous = Some((&row.currency, target));
                    events.push(DividendEvent {
                        at,
                        kind,
                        revision: row.clone(),
                        movements: deltas,
                    });
                };
                append(row.observed_at, DividendKind::Report);
                // A scheduled transition belongs only to the revision visible at that time.
                // At a tie the new report replaces the earlier schedule.
                let in_window = |at| {
                    row.amount_per_share > 0
                        && at > row.observed_at
                        && next.is_none_or(|end| at < end)
                };
                if row.ex_at < row.pay_at && in_window(row.ex_at) {
                    append(row.ex_at, DividendKind::Ex);
                }
                if in_window(row.pay_at) {
                    append(row.pay_at, DividendKind::Pay);
                }
            }
        }

        events.sort_unstable_by(|a, b| (a.at, &a.revision.id).cmp(&(b.at, &b.revision.id)));
        let mut totals = BTreeMap::<String, Amounts>::new();
        for event in &mut events {
            for movement in &mut event.movements {
                let balance = totals.entry(movement.currency.clone()).or_default();
                balance.receivable += movement.receivable_delta;
                balance.cash += movement.cash_delta;
                movement.receivable = balance.receivable;
                movement.cash = balance.cash;
            }
        }
        Ok(events)
    }
}

#[derive(Clone, Copy, Default)]
struct Amounts {
    receivable: i128,
    cash: i128,
}

impl Amounts {
    fn minus(self, other: Self) -> Self {
        Self {
            receivable: self.receivable - other.receivable,
            cash: self.cash - other.cash,
        }
    }
}

fn push_movement(movements: &mut Vec<DividendMovement>, currency: &str, delta: Amounts) {
    if delta.receivable != 0 || delta.cash != 0 {
        movements.push(DividendMovement {
            currency: currency.to_owned(),
            receivable_delta: delta.receivable,
            cash_delta: delta.cash,
            receivable: 0,
            cash: 0,
        });
    }
}

fn validate(row: &Dividend) -> Result<(), &'static str> {
    if !(1..=40).contains(&row.id.len())
        || !row
            .id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        return Err(
            "Use 1–40 ASCII letters, digits, dots, underscores or hyphens for the dividend ID.",
        );
    }
    if row.currency.len() != 3 || !row.currency.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err("Use a three-letter uppercase cash currency code.");
    }
    if row.announced_at > row.observed_at || row.pay_at < row.ex_at {
        return Err("Observation must follow or equal announcement, and pay time must follow or equal ex time.");
    }
    if !(0..=MAX_TICKS).contains(&row.amount_per_share) {
        return Err("Dividend amount must be nonnegative and within the fixed-point range.");
    }
    Ok(())
}

pub fn parse_dividends(csv: &str, instrument: &Instrument) -> Result<DividendBook, String> {
    if csv.len() > 1024 * 1024 {
        return Err("Cash dividends CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, line)| line.trim()) !=
        Some("instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share")
    {
        return Err("Expected cash dividends header instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share.".into());
    }
    let expected = instrument.to_string();
    let mut rows = Vec::new();
    for (line, content) in lines {
        let error = |reason: &str| format!("Cash dividends line {}: {reason}", line + 1);
        if rows.len() == MAX_ROWS {
            return Err(error("Supply at most 1,000 dividend reports."));
        }
        let mut fields = content.split(',').map(str::trim);
        if fields.next() != Some(expected.as_str()) {
            return Err(error("Instrument must match the selected VENUE:SYMBOL."));
        }
        let id = fields.next().unwrap_or_default().to_owned();
        let mut time = || {
            fields
                .next()
                .filter(|value| value.len() == 20 && value.ends_with('Z'))
                .and_then(timestamp)
                .ok_or_else(|| error("Use UTC timestamps in YYYY-MM-DDTHH:MM:SSZ format."))
        };
        let announced_at = time()?;
        let ex_at = time()?;
        let pay_at = time()?;
        let observed_at = time()?;
        let currency = fields.next().unwrap_or_default().to_owned();
        let amount_per_share = fields
            .next()
            .and_then(decimal)
            .ok_or_else(|| error("Use a decimal amount with up to six fractional places."))?;
        if fields.next().is_some() {
            return Err(error("Expected exactly eight fields."));
        }
        let row = Dividend {
            id,
            announced_at,
            ex_at,
            pay_at,
            observed_at,
            currency,
            amount_per_share,
        };
        validate(&row).map_err(error)?;
        rows.push(row);
    }
    DividendBook::new(rows)
}
