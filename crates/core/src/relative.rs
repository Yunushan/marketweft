use super::{rounded_div, PriceBook, PriceObservation};
use crate::{history::valid_second, UniverseAction, UniverseChange};
use std::collections::BTreeSet;

const RETURN_SCALE: i128 = 1_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RelativeLegPoint {
    pub membership: Option<UniverseAction>,
    pub close: Option<PriceObservation>,
    /// Return in 0.0001 percentage-point units.
    pub return_units: Option<i128>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RelativePoint {
    pub effective_at: i64,
    pub left: RelativeLegPoint,
    pub right: RelativeLegPoint,
    /// Left return minus right return, rounded once in 0.0001 percentage-point units.
    pub spread_units: Option<i128>,
}

struct MembershipCursor<'a> {
    events: Vec<&'a UniverseChange>,
    next: usize,
    state: Option<UniverseAction>,
}

impl<'a> MembershipCursor<'a> {
    fn new() -> Self {
        Self {
            events: Vec::new(),
            next: 0,
            state: None,
        }
    }

    fn through(&mut self, time: i64) -> Option<UniverseAction> {
        while self.state != Some(UniverseAction::Delist)
            && self
                .events
                .get(self.next)
                .is_some_and(|event| event.effective_at <= time)
        {
            self.state = Some(self.events[self.next].action);
            self.next += 1;
        }
        self.state
    }
}

impl PriceBook<'_> {
    /// Align exact closes by stable listing ID over a fixed UTC window. Apart
    /// from the requested boundaries, only known closes of members create rows.
    pub fn relative_series(
        &self,
        left_id: &str,
        right_id: &str,
        baseline_at: i64,
        through_at: i64,
        known_at: i64,
    ) -> Result<Vec<RelativePoint>, String> {
        if ![baseline_at, through_at, known_at]
            .into_iter()
            .all(valid_second)
            || baseline_at > through_at
        {
            return Err("Use valid UTC cutoffs with the baseline at or before the end.".into());
        }
        let ids = self.universe.listing_ids();
        if left_id == right_id || !ids.contains(left_id) || !ids.contains(right_id) {
            return Err("Choose two distinct listing IDs from the supplied universe.".into());
        }
        let mut left = MembershipCursor::new();
        let mut right = MembershipCursor::new();
        for row in self.universe.visible_changes(through_at, known_at) {
            match row.listing_id.as_str() {
                id if id == left_id => left.events.push(row),
                id if id == right_id => right.events.push(row),
                _ => {}
            }
        }
        let mut times = BTreeSet::from([baseline_at, through_at]);
        for id in [left_id, right_id] {
            if let Some(history) = self.prices.get(id) {
                times.extend(history.range(baseline_at..=through_at).filter_map(
                    |(&time, revisions)| revisions.range(..=known_at).next().map(|_| time),
                ));
            }
        }
        let close = |id, time, state| {
            (state == Some(UniverseAction::Add))
                .then(|| self.exact_close(id, time, known_at))
                .flatten()
        };
        let left_base = close(left_id, baseline_at, left.through(baseline_at));
        let right_base = close(right_id, baseline_at, right.through(baseline_at));
        Ok(times
            .into_iter()
            .filter_map(|effective_at| {
                let left_member = left.through(effective_at);
                let right_member = right.through(effective_at);
                let left_close = close(left_id, effective_at, left_member);
                let right_close = close(right_id, effective_at, right_member);
                if effective_at != baseline_at
                    && effective_at != through_at
                    && left_close.is_none()
                    && right_close.is_none()
                {
                    return None;
                }
                let left_return = reading(left_member, left_close, left_base);
                let right_return = reading(right_member, right_close, right_base);
                Some(RelativePoint {
                    effective_at,
                    left: left_return,
                    right: right_return,
                    spread_units: spread(left_base, left_close, right_base, right_close),
                })
            })
            .collect())
    }
}

fn reading(
    membership: Option<UniverseAction>,
    close: Option<PriceObservation>,
    baseline: Option<PriceObservation>,
) -> RelativeLegPoint {
    let return_units = baseline.zip(close).map(|(base, close)| {
        let baseline = i128::from(base.ticks);
        rounded_div(
            (i128::from(close.ticks) - baseline) * RETURN_SCALE,
            baseline,
        )
    });
    RelativeLegPoint {
        membership,
        close,
        return_units,
    }
}

fn spread(
    left_base: Option<PriceObservation>,
    left_close: Option<PriceObservation>,
    right_base: Option<PriceObservation>,
    right_close: Option<PriceObservation>,
) -> Option<i128> {
    let left_base = i128::from(left_base?.ticks);
    let right_base = i128::from(right_base?.ticks);
    let left = i128::from(left_close?.ticks);
    let right = i128::from(right_close?.ticks);
    Some(rounded_div(
        (left * right_base - right * left_base) * RETURN_SCALE,
        left_base * right_base,
    ))
}
