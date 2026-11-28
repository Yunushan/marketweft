use crate::{
    history::{decimal, exact_utc},
    Instrument, MAX_TICKS,
};
use std::collections::BTreeMap;

const MAX_ROWS: usize = 1_000;
const MAX_SHARES: u32 = 1_000_000;
const MAX_POSITIONS: usize = 5_000;
const MAX_ENTITLEMENT_CHECKS: usize = 2_000_000;
const MAX_LEDGER_EVENTS: usize = 50_000;
const GROSS_HEADER: &str =
    "instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share";
const WITHHOLDING_HEADER: &str =
    "instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share,withholding_per_share";

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
    Entitlement = 3,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DividendMovement {
    pub currency: String,
    pub receivable_delta: i128,
    pub cash_delta: i128,
    pub receivable: i128,
    pub cash: i128,
    pub withholding_delta: i128,
    pub withholding: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DividendEvent {
    pub at: i64,
    pub kind: DividendKind,
    pub revision: Dividend,
    pub entitled_shares: Option<u32>,
    pub withholding_per_share: Option<i64>,
    pub movements: Vec<DividendMovement>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PositionObservation {
    pub effective_at: i64,
    pub observed_at: i64,
    pub shares: u32,
}

#[derive(Clone, Debug)]
pub struct DividendPositions {
    instrument: Instrument,
    rows: Vec<PositionObservation>,
}

impl DividendPositions {
    pub fn new(instrument: Instrument, mut rows: Vec<PositionObservation>) -> Result<Self, String> {
        if rows.len() > MAX_POSITIONS {
            return Err("Supply at most 5,000 position observations.".into());
        }
        if rows
            .iter()
            .any(|row| row.effective_at > row.observed_at || row.shares > MAX_SHARES)
        {
            return Err(
                "Use positions observed at or after effect and 0–1,000,000 whole shares.".into(),
            );
        }
        rows.sort_unstable_by_key(|row| (row.observed_at, row.effective_at));
        if rows
            .windows(2)
            .any(|w| w[0].observed_at == w[1].observed_at && w[0].effective_at == w[1].effective_at)
        {
            return Err(
                "Position revisions need distinct observation times for one effective time.".into(),
            );
        }
        Ok(Self { instrument, rows })
    }
}

#[derive(Clone, Debug)]
pub struct DividendBook {
    instrument: Option<Instrument>,
    rows: Vec<Dividend>,
    withholding: BTreeMap<String, BTreeMap<i64, i64>>,
}

pub(crate) struct DividendSchedule<'a> {
    pub(crate) at: i64,
    kind: DividendKind,
    pub(crate) row: &'a Dividend,
}

struct DividendState<'a> {
    row: &'a Dividend,
    withholding_per_share: Option<i64>,
    previous: Option<(&'a str, Amounts)>,
    shares: Option<u32>,
}

impl DividendBook {
    pub fn new(rows: Vec<Dividend>) -> Result<Self, String> {
        Self::validated(None, rows)
    }

    pub fn for_instrument(instrument: Instrument, rows: Vec<Dividend>) -> Result<Self, String> {
        Self::validated(Some(instrument), rows)
    }

    pub(crate) fn known_reports(&self, known_at: i64) -> impl Iterator<Item = &Dividend> {
        self.rows
            .chunk_by(|left, right| left.id == right.id)
            .filter_map(move |revisions| {
                let count = revisions.partition_point(|report| report.observed_at <= known_at);
                count.checked_sub(1).map(|index| &revisions[index])
            })
    }

    pub(crate) fn instrument(&self) -> Option<&Instrument> {
        self.instrument.as_ref()
    }

    fn validated(instrument: Option<Instrument>, mut rows: Vec<Dividend>) -> Result<Self, String> {
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
        Ok(Self {
            instrument,
            rows,
            withholding: BTreeMap::new(),
        })
    }

    /// Cash events for a supplied whole-share entitlement per distribution.
    /// Apply events through the inclusive cutoff to reconstruct a replay snapshot.
    pub fn ledger(&self, entitled_shares: u32) -> Result<Vec<DividendEvent>, String> {
        if entitled_shares > MAX_SHARES {
            return Err("Supply 0–1,000,000 whole entitled shares.".into());
        }

        self.ledger_with(&[], Some(entitled_shares))
    }

    /// Evaluate positions effective strictly before each ex-date using only observations known at each event.
    pub fn position_ledger(
        &self,
        positions: &DividendPositions,
    ) -> Result<Vec<DividendEvent>, String> {
        if self.instrument.as_ref() != Some(&positions.instrument) {
            return Err("Dividend and position reports must describe the same instrument.".into());
        }
        self.ledger_with(&positions.rows, None)
    }

    pub(crate) fn schedule(&self) -> Vec<DividendSchedule<'_>> {
        let mut schedule = Vec::new();
        for revisions in self.rows.chunk_by(|a, b| a.id == b.id) {
            for (i, row) in revisions.iter().enumerate() {
                let next = revisions.get(i + 1).map(|r| r.observed_at);
                let mut append = |at, kind| schedule.push(DividendSchedule { at, kind, row });
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
        schedule.sort_unstable_by(|a, b| (a.at, &a.row.id).cmp(&(b.at, &b.row.id)));
        schedule
    }

    fn ledger_with(
        &self,
        positions: &[PositionObservation],
        constant: Option<u32>,
    ) -> Result<Vec<DividendEvent>, String> {
        let mut events = Vec::new();
        let mut active = BTreeMap::<&str, DividendState<'_>>::new();
        let mut holdings = BTreeMap::new();
        let mut positions = positions.iter().peekable();
        let mut schedule = self.schedule().into_iter().peekable();
        let mut checks = 0;
        while let Some(at) = positions
            .peek()
            .map(|p| p.observed_at)
            .into_iter()
            .chain(schedule.peek().map(|row| row.at))
            .min()
        {
            let mut earliest_change: Option<i64> = None;
            while let Some(row) = positions.next_if(|p| p.observed_at == at) {
                if holdings.insert(row.effective_at, row.shares) != Some(row.shares) {
                    earliest_change = Some(
                        earliest_change
                            .map_or(row.effective_at, |prior| prior.min(row.effective_at)),
                    );
                }
            }
            let shares_for = |ex| {
                constant.or_else(|| {
                    (at >= ex)
                        .then(|| holdings.range(..ex).next_back().map(|(_, &shares)| shares))
                        .flatten()
                })
            };
            while let Some(DividendSchedule { kind, row, .. }) =
                schedule.next_if(|event| event.at == at)
            {
                let state = active.entry(&row.id).or_insert(DividendState {
                    row,
                    withholding_per_share: None,
                    previous: None,
                    shares: None,
                });
                state.row = row;
                state.withholding_per_share = self
                    .withholding
                    .get(&row.id)
                    .and_then(|revisions| revisions.get(&row.observed_at))
                    .copied();
                events.push(state.post(at, kind, shares_for(row.ex_at)));
            }
            if let Some(effective) = earliest_change {
                for state in active.values_mut().filter(|state| {
                    effective < state.row.ex_at
                        && state.row.ex_at <= at
                        && state.row.amount_per_share > 0
                }) {
                    checks += 1;
                    if checks > MAX_ENTITLEMENT_CHECKS {
                        return Err(
                            "Dividend entitlement replay exceeds two million position checks."
                                .into(),
                        );
                    }
                    let shares = shares_for(state.row.ex_at);
                    if state.shares != shares {
                        events.push(state.post(at, DividendKind::Entitlement, shares));
                    }
                }
            }
            if events.len() > MAX_LEDGER_EVENTS {
                return Err(
                    "Dividend position replay exceeds 50,000 ledger events. Narrow the history."
                        .into(),
                );
            }
        }
        events.sort_unstable_by(|a, b| (a.at, &a.revision.id).cmp(&(b.at, &b.revision.id)));
        let mut totals = BTreeMap::<String, Amounts>::new();
        for event in &mut events {
            for movement in &mut event.movements {
                let balance = totals.entry(movement.currency.clone()).or_default();
                balance.receivable += movement.receivable_delta;
                balance.cash += movement.cash_delta;
                balance.withholding += movement.withholding_delta;
                movement.receivable = balance.receivable;
                movement.cash = balance.cash;
                movement.withholding = balance.withholding;
            }
        }
        Ok(events)
    }
}

impl<'a> DividendState<'a> {
    fn post(&mut self, at: i64, kind: DividendKind, shares: Option<u32>) -> DividendEvent {
        let row = self.row;
        let quantity = i128::from(shares.unwrap_or_default());
        let gross = i128::from(row.amount_per_share) * quantity;
        let withholding = i128::from(self.withholding_per_share.unwrap_or_default()) * quantity;
        let target = if at >= row.pay_at {
            Amounts {
                receivable: 0,
                cash: gross - withholding,
                withholding,
            }
        } else if at >= row.ex_at {
            Amounts {
                receivable: gross,
                cash: 0,
                withholding: 0,
            }
        } else {
            Amounts::default()
        };
        let mut movements = Vec::new();
        match self.previous {
            Some((currency, old)) if currency == row.currency => {
                push_movement(&mut movements, currency, target.minus(old));
            }
            old => {
                if let Some((currency, amount)) = old {
                    push_movement(&mut movements, currency, Amounts::default().minus(amount));
                }
                push_movement(&mut movements, &row.currency, target);
            }
        }
        self.previous = Some((&row.currency, target));
        self.shares = shares;
        DividendEvent {
            at,
            kind,
            revision: row.clone(),
            entitled_shares: shares,
            withholding_per_share: self.withholding_per_share,
            movements,
        }
    }
}

#[derive(Clone, Copy, Default)]
struct Amounts {
    receivable: i128,
    cash: i128,
    withholding: i128,
}

impl Amounts {
    fn minus(self, other: Self) -> Self {
        Self {
            receivable: self.receivable - other.receivable,
            cash: self.cash - other.cash,
            withholding: self.withholding - other.withholding,
        }
    }
}

fn push_movement(movements: &mut Vec<DividendMovement>, currency: &str, delta: Amounts) {
    if delta.receivable != 0 || delta.cash != 0 || delta.withholding != 0 {
        movements.push(DividendMovement {
            currency: currency.to_owned(),
            receivable_delta: delta.receivable,
            cash_delta: delta.cash,
            receivable: 0,
            cash: 0,
            withholding_delta: delta.withholding,
            withholding: 0,
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

pub(crate) fn parse_report<'a>(
    fields: &mut impl Iterator<Item = &'a str>,
    extra_fields_error: &'static str,
) -> Result<Dividend, &'static str> {
    let id = fields.next().unwrap_or_default().to_owned();
    let mut time = || {
        fields
            .next()
            .and_then(exact_utc)
            .ok_or("Use UTC timestamps in YYYY-MM-DDTHH:MM:SSZ format.")
    };
    let announced_at = time()?;
    let ex_at = time()?;
    let pay_at = time()?;
    let observed_at = time()?;
    let currency = fields.next().unwrap_or_default().to_owned();
    let amount_per_share = fields
        .next()
        .and_then(decimal)
        .ok_or("Use a decimal amount with up to six fractional places.")?;
    if fields.next().is_some() {
        return Err(extra_fields_error);
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
    validate(&row)?;
    Ok(row)
}

pub(crate) fn write_ledger_rows(
    text: &mut String,
    events: &[DividendEvent],
    include_positions: bool,
) {
    use std::fmt::Write;
    for event in events {
        let row = &event.revision;
        write!(
            text,
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            event.at,
            event.kind as u8,
            row.id,
            row.announced_at,
            row.ex_at,
            row.pay_at,
            row.observed_at,
            row.currency,
            row.amount_per_share
        )
        .unwrap();
        if include_positions {
            text.push('\t');
            if let Some(shares) = event.entitled_shares {
                write!(text, "{shares}").unwrap();
            }
        }
        if let Some(withholding) = event.withholding_per_share {
            write!(text, "\tW={withholding}").unwrap();
        }
        for movement in &event.movements {
            write!(
                text,
                "\t{},{},{},{},{}",
                movement.currency,
                movement.receivable_delta,
                movement.cash_delta,
                movement.receivable,
                movement.cash
            )
            .unwrap();
            if event.withholding_per_share.is_some() {
                write!(
                    text,
                    ",{},{}",
                    movement.withholding_delta, movement.withholding
                )
                .unwrap();
            }
        }
        text.push('\n');
    }
}

pub(crate) const MAX_CASH_DIVIDEND_CSV_BYTES: usize = 1024 * 1024;

pub fn parse_dividends(csv: &str, instrument: &Instrument) -> Result<DividendBook, String> {
    parse_book(csv, instrument, false)
}

/// Read standalone historical replay reports, including the optional header
/// with an explicitly reported withholding amount per share.
pub fn parse_replay_dividends(csv: &str, instrument: &Instrument) -> Result<DividendBook, String> {
    parse_book(csv, instrument, true)
}

fn parse_book(
    csv: &str,
    instrument: &Instrument,
    allow_withholding: bool,
) -> Result<DividendBook, String> {
    if csv.len() > MAX_CASH_DIVIDEND_CSV_BYTES {
        return Err("Cash dividends CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    let with_withholding = match lines.next().map(|(_, line)| line.trim()) {
        Some(GROSS_HEADER) => false,
        Some(WITHHOLDING_HEADER) if allow_withholding => true,
        _ => return Err(format!("Expected cash dividends header {GROSS_HEADER}.")),
    };
    let expected = instrument.to_string();
    let mut rows = Vec::new();
    let mut withholding = BTreeMap::<String, BTreeMap<i64, i64>>::new();
    for (line, content) in lines {
        let error = |reason: &str| format!("Cash dividends line {}: {reason}", line + 1);
        if rows.len() == MAX_ROWS {
            return Err(error("Supply at most 1,000 dividend reports."));
        }
        let (report, withheld) = if with_withholding {
            let (report, value) = content
                .rsplit_once(',')
                .ok_or_else(|| error("Expected exactly nine fields."))?;
            let withheld = decimal(value.trim()).ok_or_else(|| {
                error("Use a decimal withholding amount with up to six fractional places.")
            })?;
            (report, Some(withheld))
        } else {
            (content, None)
        };
        let mut fields = report.split(',').map(str::trim);
        if fields.next() != Some(expected.as_str()) {
            return Err(error("Instrument must match the selected VENUE:SYMBOL."));
        }
        let extra_fields = if with_withholding {
            "Expected exactly nine fields."
        } else {
            "Expected exactly eight fields."
        };
        let row = parse_report(&mut fields, extra_fields).map_err(error)?;
        if let Some(amount) = withheld {
            if !(0..=row.amount_per_share).contains(&amount) {
                return Err(error(
                    "Withholding per share must be between zero and the gross dividend.",
                ));
            }
            withholding
                .entry(row.id.clone())
                .or_default()
                .insert(row.observed_at, amount);
        }
        rows.push(row);
    }
    let mut book = DividendBook::for_instrument(instrument.clone(), rows)?;
    book.withholding = withholding;
    Ok(book)
}

pub fn parse_dividend_positions(
    csv: &str,
    instrument: &Instrument,
) -> Result<DividendPositions, String> {
    if csv.len() > 1024 * 1024 {
        return Err("Dividend positions CSV exceeds 1 MiB.".into());
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    const HEADER: &str = "instrument,effective_at,observed_at,shares";
    if lines.next().map(|(_, line)| line.trim()) != Some(HEADER) {
        return Err(format!("Expected dividend positions header {HEADER}."));
    }
    let expected = instrument.to_string();
    let mut rows = Vec::new();
    for (line, row) in lines {
        let invalid = || {
            format!(
                "Invalid instrument, UTC time or whole share count on position line {}.",
                line + 1
            )
        };
        if rows.len() == MAX_POSITIONS {
            return Err("Supply at most 5,000 position observations.".into());
        }
        let mut fields = row.splitn(5, ',').map(str::trim);
        let [Some(identity), Some(effective), Some(observed), Some(shares), None] =
            std::array::from_fn(|_| fields.next())
        else {
            return Err(invalid());
        };
        if identity != expected || !shares.bytes().all(|digit| digit.is_ascii_digit()) {
            return Err(invalid());
        }
        rows.push(PositionObservation {
            effective_at: exact_utc(effective).ok_or_else(invalid)?,
            observed_at: exact_utc(observed).ok_or_else(invalid)?,
            shares: shares.parse().map_err(|_| invalid())?,
        });
    }
    DividendPositions::new(instrument.clone(), rows)
}
