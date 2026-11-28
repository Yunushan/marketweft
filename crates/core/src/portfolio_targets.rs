use super::{
    last_observed_report, portfolio_source_input, EquityConcentrationPosition, PortfolioBook,
    PortfolioSnapshot,
};
use crate::{
    delisting::valid_currency,
    history::{decimal, exact_utc},
    UniverseBook, SCALE,
};
use std::{collections::BTreeMap, fmt::Write, ops::Bound::Included};

const HEADER: &str =
    "universe,listing_id,quote_currency,effective_at,observed_at,target_weight_pct";
const MAX_REPORTS: usize = 10_000;
pub(crate) const MAX_EQUITY_TARGET_CSV_BYTES: usize = 2 * 1024 * 1024;
const FULL_WEIGHT: i64 = 100 * SCALE;

type TargetHistory = BTreeMap<i64, BTreeMap<i64, Option<i64>>>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EquityTargetReport {
    pub effective_at: i64,
    pub observed_at: i64,
    /// Millionths of a percentage point, or a withdrawal of the target.
    pub weight_micros: Option<i64>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EquityTargetDrift<'a> {
    pub currency: Option<&'a str>,
    pub listing_id: &'a str,
    pub actual: Option<EquityConcentrationPosition<'a>>,
    pub target: Option<EquityTargetReport>,
    pub drift_micros: Option<i64>,
}

#[derive(Default)]
struct AllocationEvidence<'a> {
    actual: Option<EquityConcentrationPosition<'a>>,
    target: Option<EquityTargetReport>,
}

pub struct EquityTargetBook<'a> {
    histories: BTreeMap<(&'a str, &'a str), TargetHistory>,
}

impl<'csv> EquityTargetBook<'csv> {
    pub fn parse(universe: &UniverseBook, csv: &'csv str) -> Result<Self, String> {
        if csv.len() > MAX_EQUITY_TARGET_CSV_BYTES {
            return Err("Equity target CSV exceeds 2 MiB.".into());
        }
        let mut lines = csv
            .trim_start_matches('\u{feff}')
            .lines()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty());
        if lines.next().map(|(_, line)| line.trim()) != Some(HEADER) {
            return Err(format!("Expected equity target header {HEADER}."));
        }
        let listings = universe.listing_ids();
        let mut histories = BTreeMap::<_, TargetHistory>::new();
        for (index, (line, row)) in lines.enumerate() {
            let error = |reason| format!("Equity target line {}: {reason}", line + 1);
            if index == MAX_REPORTS {
                return Err(error("Supply at most 10,000 equity target reports."));
            }
            let mut fields = row.splitn(7, ',').map(str::trim);
            let [Some(scope), Some(listing), Some(currency), Some(effective), Some(observed), Some(weight), None] =
                std::array::from_fn(|_| fields.next())
            else {
                return Err(error("Expected exactly six fields."));
            };
            if scope != universe.name() || !listings.contains(listing) {
                return Err(error("Use a listing ID from the supplied universe."));
            }
            if !valid_currency(currency) {
                return Err(error("Use a three-letter uppercase quote currency."));
            }
            let effective = exact_utc(effective)
                .ok_or_else(|| error("Use an exact UTC effective timestamp."))?;
            let observed = exact_utc(observed)
                .ok_or_else(|| error("Use an exact UTC observation timestamp."))?;
            let weight = if weight.is_empty() {
                None
            } else {
                Some(
                    decimal(weight)
                        .filter(|ticks| (0..=FULL_WEIGHT).contains(ticks))
                        .ok_or_else(|| {
                            error("Use a 0–100 target weight with up to six decimal places.")
                        })?,
                )
            };
            if histories
                .entry((currency, listing))
                .or_default()
                .entry(effective)
                .or_default()
                .insert(observed, weight)
                .is_some()
            {
                return Err(error("Duplicate observation for one effective target."));
            }
        }
        Ok(Self { histories })
    }

    /// Reconcile targets and actual concentration at the snapshot's two
    /// cutoffs. An absent mark, absent target, and explicit zero are distinct.
    pub fn drift_as_of<'a>(
        &'a self,
        snapshot: &PortfolioSnapshot<'a>,
    ) -> Result<Vec<EquityTargetDrift<'a>>, String> {
        let mut rows = BTreeMap::<_, AllocationEvidence<'a>>::new();
        for group in snapshot.equity_concentration() {
            for position in group.positions {
                rows.entry((group.currency, position.listing_id))
                    .or_default()
                    .actual = Some(position);
            }
        }
        let mut totals = BTreeMap::<_, i64>::new();
        for (&(currency, listing), history) in &self.histories {
            let Some(report) = visible_report(history, snapshot.effective_at, snapshot.known_at)
            else {
                continue;
            };
            if let Some(weight) = report.weight_micros {
                let total = totals.entry(currency).or_default();
                *total += weight;
                if *total > FULL_WEIGHT {
                    return Err(format!("Known {currency} equity targets exceed 100%."));
                }
            }
            rows.entry((Some(currency), listing)).or_default().target = Some(report);
        }
        Ok(rows
            .into_iter()
            .map(
                |((currency, listing_id), AllocationEvidence { actual, target })| {
                    let drift_micros = actual
                        .and_then(|actual| actual.weight_micros)
                        .zip(target.and_then(|target| target.weight_micros))
                        .map(|(actual, target)| actual - target);
                    EquityTargetDrift {
                        currency,
                        listing_id,
                        actual,
                        target,
                        drift_micros,
                    }
                },
            )
            .collect())
    }
}

pub(crate) struct EquityTargetWire {
    pub effective_at: i64,
    pub known_at: i64,
    pub count: usize,
    pub rows: String,
}

pub(crate) fn equity_target_report(
    input: &str,
    lengths: [usize; 4],
) -> Result<EquityTargetWire, String> {
    let (effective_at, known_at, reports) = portfolio_source_input(input)?;
    let [membership_bytes, holding_bytes, price_bytes, terms_bytes] = lengths;
    let (membership, reports) = reports
        .split_at_checked(membership_bytes)
        .ok_or("Supply the membership CSV.")?;
    let (holdings, reports) = reports
        .split_at_checked(holding_bytes)
        .ok_or("Supply the holdings CSV.")?;
    let (prices, reports) = reports
        .split_at_checked(price_bytes)
        .ok_or("Supply the closes CSV.")?;
    let (terms, targets) = reports
        .split_at_checked(terms_bytes)
        .ok_or("Supply delisting terms and equity targets.")?;
    let universe = crate::parse_universe(membership)?;
    let book = PortfolioBook::parse(&universe, holdings, prices, terms)?;
    let targets = EquityTargetBook::parse(&universe, targets)?;
    let snapshot = book.as_of(effective_at, known_at);
    let rows = targets.drift_as_of(&snapshot)?;
    let count = rows.len();
    let field = |value: Option<i64>| value.map(|number| number.to_string()).unwrap_or_default();
    let mut text = String::new();
    for row in rows {
        writeln!(
            text,
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            row.currency.unwrap_or_default(),
            row.listing_id,
            u8::from(row.actual.is_some()),
            field(row.actual.and_then(|actual| actual.weight_micros)),
            field(row.target.map(|target| target.effective_at)),
            field(row.target.map(|target| target.observed_at)),
            field(row.target.and_then(|target| target.weight_micros)),
            field(row.drift_micros),
        )
        .unwrap();
    }
    Ok(EquityTargetWire {
        effective_at,
        known_at,
        count,
        rows: text,
    })
}

fn visible_report(
    history: &TargetHistory,
    effective_at: i64,
    known_at: i64,
) -> Option<EquityTargetReport> {
    let (effective_at, observed_at, weight) =
        last_observed_report(history, Included(effective_at), known_at)?;
    Some(EquityTargetReport {
        effective_at,
        observed_at,
        weight_micros: *weight,
    })
}
