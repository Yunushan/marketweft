use super::{
    parse_holdings,
    rights::{parse_rights, RightsHistory},
    RightsOfferingPhase,
};
use crate::{
    delisting::valid_currency,
    history::{decimal, decimal_ticks, exact_utc, valid_second},
    universe::valid_id,
    UniverseBook,
};
use std::collections::BTreeMap;

const HEADER: &str = "universe,offering_id,exercise_id,effective_at,observed_at,status,requested_at,requested_shares,allocated_shares,currency,unit_price,settled_shares,cash_paid";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RightsExerciseStage {
    Requested,
    Allocated,
    Settled,
    Cancelled,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RightsRequestAssessment {
    Unavailable,
    OutsideWindow,
    WithinCapacity,
    AboveCapacity,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RightsExerciseAllocation {
    pub shares: u64,
    pub currency: String,
    pub unit_price: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RightsExerciseSettlement {
    pub shares: u64,
    pub cash_paid: i128,
    pub cash_variance: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RightsExerciseRow {
    pub offering_id: String,
    pub exercise_id: String,
    pub effective_at: i64,
    pub observed_at: i64,
    pub stage: RightsExerciseStage,
    pub requested_at: i64,
    pub requested_shares: u64,
    pub assessment: RightsRequestAssessment,
    pub basic_capacity: Option<u64>,
    pub allocation: Option<RightsExerciseAllocation>,
    pub settlement: Option<RightsExerciseSettlement>,
}

pub(super) struct ExerciseHistory {
    offering_id: String,
    pub(super) reports: BTreeMap<(i64, i64), RightsExerciseRow>,
}

fn parse_report(
    universe: &UniverseBook,
    line: usize,
    row: &str,
) -> Result<RightsExerciseRow, String> {
    let error = |message: &str| format!("Subscription exercise line {}: {message}", line + 1);
    let mut fields = row.split(',').map(str::trim);
    let [Some(scope), Some(offering_id), Some(exercise_id), Some(effective), Some(observed), Some(status), Some(requested), Some(quantity), Some(allocation), Some(currency), Some(price), Some(settled), Some(paid), None] =
        std::array::from_fn(|_| fields.next())
    else {
        return Err(error("Expected exactly thirteen fields."));
    };
    if scope != universe.name() || !valid_id(offering_id) || !valid_id(exercise_id) {
        return Err(error(
            "Supply this universe and valid offering and exercise IDs.",
        ));
    }
    let time = |value| exact_utc(value).ok_or_else(|| error("Use exact UTC times."));
    let (requested_at, effective_at, observed_at) =
        (time(requested)?, time(effective)?, time(observed)?);
    if requested_at > effective_at || effective_at > observed_at {
        return Err(error(
            "Use request, effective and observation times in that order.",
        ));
    }
    let shares = |value: &str| {
        value
            .parse::<u64>()
            .map_err(|_| error("Use nonnegative whole-share quantities."))
    };
    let requested_shares = shares(quantity)?;
    if requested_shares == 0 {
        return Err(error("Requested shares must be positive."));
    }
    let stage = match status {
        "requested" if requested_at == effective_at => RightsExerciseStage::Requested,
        "requested" => return Err(error("A request must take effect at its request time.")),
        "allocated" => RightsExerciseStage::Allocated,
        "settled" => RightsExerciseStage::Settled,
        "cancelled" => RightsExerciseStage::Cancelled,
        _ => return Err(error("Use requested, allocated, settled or cancelled.")),
    };
    let allocation = if matches!(
        stage,
        RightsExerciseStage::Allocated | RightsExerciseStage::Settled
    ) {
        let allocated_shares = shares(allocation)?;
        if allocated_shares > requested_shares || !valid_currency(currency) {
            return Err(error(
                "Allocation must be within the request and use a three-letter uppercase currency.",
            ));
        }
        let unit_price = decimal(price)
            .filter(|&value| value > 0)
            .ok_or_else(|| error("Use a positive unit price with up to six decimal places."))?;
        Some(RightsExerciseAllocation {
            shares: allocated_shares,
            currency: currency.to_owned(),
            unit_price,
        })
    } else {
        if [allocation, currency, price]
            .iter()
            .any(|value| !value.is_empty())
        {
            return Err(error("Leave allocation fields empty for this status."));
        }
        None
    };
    let settlement = if stage == RightsExerciseStage::Settled {
        let terms = allocation
            .as_ref()
            .expect("settled exercise includes allocation terms");
        let settled_shares = shares(settled)?;
        if settled_shares > terms.shares {
            return Err(error("Settled shares must be within the allocation."));
        }
        let cash_paid = decimal_ticks(paid)
            .filter(|&value| value >= 0)
            .ok_or_else(|| error("Use nonnegative cash paid with up to six decimal places."))?;
        let expected = i128::from(settled_shares) * i128::from(terms.unit_price);
        Some(RightsExerciseSettlement {
            shares: settled_shares,
            cash_paid,
            cash_variance: cash_paid - expected,
        })
    } else {
        if !settled.is_empty() || !paid.is_empty() {
            return Err(error("Leave settlement fields empty until settlement."));
        }
        None
    };
    Ok(RightsExerciseRow {
        offering_id: offering_id.to_owned(),
        exercise_id: exercise_id.to_owned(),
        effective_at,
        observed_at,
        stage,
        requested_at,
        requested_shares,
        assessment: RightsRequestAssessment::Unavailable,
        basic_capacity: None,
        allocation,
        settlement,
    })
}

pub(super) fn parse_exercise_histories(
    universe: &UniverseBook,
    rights: &BTreeMap<String, RightsHistory>,
    exercises: &str,
) -> Result<BTreeMap<String, ExerciseHistory>, String> {
    if exercises.len() > 1024 * 1024 {
        return Err("Subscription exercises CSV exceeds 1 MiB.".into());
    }
    let mut lines = exercises
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, line)| line.trim()) != Some(HEADER) {
        return Err(format!("Expected subscription exercises header {HEADER}."));
    }
    let mut histories = BTreeMap::new();
    for (index, (line, row)) in lines.enumerate() {
        if index == 2_000 {
            return Err("Supply at most 2,000 subscription exercise reports.".into());
        }
        let report = parse_report(universe, line, row)?;
        if !rights.contains_key(&report.offering_id) {
            return Err(format!(
                "Subscription exercise line {}: Use an offering ID from the rights reports.",
                line + 1
            ));
        }
        let history = histories
            .entry(report.exercise_id.clone())
            .or_insert_with(|| ExerciseHistory {
                offering_id: report.offering_id.clone(),
                reports: BTreeMap::new(),
            });
        if history.offering_id != report.offering_id {
            return Err(format!(
                "Subscription exercise line {}: An exercise must retain its offering ID.",
                line + 1
            ));
        }
        if history
            .reports
            .insert((report.effective_at, report.observed_at), report)
            .is_some()
        {
            return Err(format!("Subscription exercise line {}: Duplicate effective and observation times for this exercise.", line + 1));
        }
    }
    if histories.is_empty() {
        return Err("Subscription exercises CSV contains no reports.".into());
    }
    Ok(histories)
}

/// Reconstruct the latest effective exercise report visible at the knowledge cutoff.
pub fn portfolio_rights_exercises_as_of(
    universe: &UniverseBook,
    holdings: &str,
    rights: &str,
    exercises: &str,
    effective_at: i64,
    known_at: i64,
) -> Result<Vec<RightsExerciseRow>, String> {
    if !valid_second(effective_at) || !valid_second(known_at) {
        return Err("Supply valid UTC effective and knowledge cutoffs.".into());
    }
    let holdings = parse_holdings(universe, holdings)?;
    let rights = parse_rights(universe, rights)?;
    let histories = parse_exercise_histories(universe, &rights, exercises)?;
    let mut rows = Vec::new();
    for history in histories.into_values() {
        let Some((_, report)) = history
            .reports
            .range(..=(effective_at, i64::MAX))
            .rev()
            .find(|((_, observed_at), _)| *observed_at <= known_at)
        else {
            continue;
        };
        let mut row = report.clone();
        if let Some(offer) = rights[&row.offering_id].as_of(
            &row.offering_id,
            &holdings,
            row.requested_at,
            row.requested_at,
        ) {
            if offer.phase != RightsOfferingPhase::Open {
                row.assessment = RightsRequestAssessment::OutsideWindow;
            } else if let Some(entitlement) = offer.entitlement {
                let capacity = entitlement.subscribable_shares;
                row.basic_capacity = Some(capacity);
                row.assessment = if row.requested_shares <= capacity {
                    RightsRequestAssessment::WithinCapacity
                } else {
                    RightsRequestAssessment::AboveCapacity
                };
            }
        }
        rows.push(row);
    }
    Ok(rows)
}
