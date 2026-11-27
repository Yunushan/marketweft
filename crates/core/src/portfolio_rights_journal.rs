use super::{
    rights::parse_rights, rights_exercise::parse_exercise_histories, RightsExerciseRow,
    RightsExerciseStage,
};
use crate::{history::valid_second, UniverseBook};
use std::cmp::Reverse;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RightsSettlementAsset {
    Shares,
    Cash(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RightsSettlementPosting {
    pub offering_id: String,
    pub exercise_id: String,
    pub effective_at: i64,
    pub observed_at: i64,
    pub stage: RightsExerciseStage,
    pub asset: RightsSettlementAsset,
    pub delta: i128,
    pub balance: i128,
}

fn push_delta(
    postings: &mut Vec<RightsSettlementPosting>,
    report: &RightsExerciseRow,
    asset: RightsSettlementAsset,
    before: i128,
    after: i128,
) {
    if before != after {
        postings.push(RightsSettlementPosting {
            offering_id: report.offering_id.clone(),
            exercise_id: report.exercise_id.clone(),
            effective_at: report.effective_at,
            observed_at: report.observed_at,
            stage: report.stage,
            asset,
            delta: after - before,
            balance: after,
        });
    }
}

fn settlement(row: &RightsExerciseRow) -> (i128, Option<(&str, i128)>) {
    row.settlement
        .zip(row.allocation.as_ref())
        .map_or((0, None), |(actual, allocation)| {
            (
                i128::from(actual.shares),
                Some((allocation.currency.as_str(), -actual.cash_paid)),
            )
        })
}

/// Journal changes to the reported settlement balance in the order they became known.
pub fn portfolio_rights_settlement_journal(
    universe: &UniverseBook,
    rights: &str,
    exercises: &str,
    effective_at: i64,
    known_at: i64,
) -> Result<Vec<RightsSettlementPosting>, String> {
    if !valid_second(effective_at) || !valid_second(known_at) {
        return Err("Supply valid UTC effective and knowledge cutoffs.".into());
    }
    let rights = parse_rights(universe, rights)?;
    let histories = parse_exercise_histories(universe, &rights, exercises)?;
    let mut postings = Vec::new();
    for history in histories.into_values() {
        let mut reports: Vec<_> = history
            .reports
            .range(..=(effective_at, i64::MAX))
            .map(|(_, report)| report)
            .filter(|report| report.observed_at <= known_at)
            .collect();
        // Only the most recent effective report can change a balance at a given observation.
        reports.sort_unstable_by_key(|row| (row.observed_at, Reverse(row.effective_at)));
        let mut previous: Option<&RightsExerciseRow> = None;
        let mut before_shares = 0;
        let mut before_cash: Option<(&str, i128)> = None;
        for report in reports {
            if previous.is_some_and(|prior| {
                prior.effective_at > report.effective_at || prior.observed_at == report.observed_at
            }) {
                continue;
            }
            let (after_shares, after_cash) = settlement(report);
            push_delta(
                &mut postings,
                report,
                RightsSettlementAsset::Shares,
                before_shares,
                after_shares,
            );
            match (before_cash, after_cash) {
                (Some((from, amount)), Some((to, next))) if from == to => {
                    push_delta(
                        &mut postings,
                        report,
                        RightsSettlementAsset::Cash(to.to_owned()),
                        amount,
                        next,
                    );
                }
                (before, after) => {
                    if let Some((currency, amount)) = before {
                        push_delta(
                            &mut postings,
                            report,
                            RightsSettlementAsset::Cash(currency.to_owned()),
                            amount,
                            0,
                        );
                    }
                    if let Some((currency, amount)) = after {
                        push_delta(
                            &mut postings,
                            report,
                            RightsSettlementAsset::Cash(currency.to_owned()),
                            0,
                            amount,
                        );
                    }
                }
            }
            previous = Some(report);
            (before_shares, before_cash) = (after_shares, after_cash);
        }
    }
    postings.sort_by(|left, right| {
        (left.observed_at, &left.exercise_id).cmp(&(right.observed_at, &right.exercise_id))
    });
    Ok(postings)
}
