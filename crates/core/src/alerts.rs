use crate::{
    history::{decimal, exact_utc},
    universe::valid_id,
};
use std::{cmp::Ordering, collections::BTreeMap};

const MAX_ROWS: usize = 10_000;
const MAX_BYTES: usize = 1024 * 1024;
const MAX_WINDOW: usize = 1_000;
const MAX_EVALUATIONS: usize = 2_000_000;
const MAX_NOTIFICATIONS: usize = 20_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AlertDirection {
    Above,
    Below,
    Either,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Comparator {
    Threshold(i64),
    MovingAverage(usize),
    Off,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AlertRule {
    pub id: String,
    pub revision_id: String,
    pub series: String,
    pub effective_at: i64,
    pub observed_at: i64,
    pub comparator: Comparator,
    pub direction: AlertDirection,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Observation {
    pub id: String,
    pub series: String,
    pub measured_at: i64,
    pub observed_at: i64,
    pub value: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AlertNotification<'a> {
    pub id: String,
    pub rule: &'a AlertRule,
    pub direction: AlertDirection,
    pub previous: &'a Observation,
    pub current: &'a Observation,
    /// Comparator values as exact ratios in fixed-point ticks.
    pub previous_comparison: (i128, usize),
    pub current_comparison: (i128, usize),
}

pub struct AlertBook {
    by_series: BTreeMap<String, Vec<Vec<AlertRule>>>,
    reports: Vec<Observation>,
}

#[derive(Default)]
struct Samples<'a> {
    items: Vec<&'a Observation>,
    sums: Vec<i128>,
}

impl Samples<'_> {
    fn compared_to(&self, comparator: Comparator) -> Option<(Ordering, (i128, usize))> {
        let ticks = i128::from(self.items.last()?.value);
        let (numerator, denominator) = match comparator {
            Comparator::Threshold(value) => (i128::from(value), 1),
            Comparator::MovingAverage(window) if window <= self.items.len() => {
                let before = self.items.len() - window;
                let prefix = before.checked_sub(1).map_or(0, |index| self.sums[index]);
                (self.sums.last()? - prefix, window)
            }
            _ => return None,
        };
        Some((
            (ticks * denominator as i128).cmp(&numerator),
            (numerator, denominator),
        ))
    }
}

impl<'a> Samples<'a> {
    fn apply(&mut self, report: &'a Observation) {
        if self
            .items
            .last()
            .is_some_and(|last| last.measured_at == report.measured_at)
        {
            self.items.pop();
            self.sums.pop();
        }
        let sum = self.sums.last().copied().unwrap_or(0) + i128::from(report.value);
        self.items.push(report);
        self.sums.push(sum);
    }
}

impl AlertBook {
    pub fn parse(rules_csv: &str, observations_csv: &str) -> Result<Self, String> {
        let mut rule_ids = BTreeMap::<String, Vec<AlertRule>>::new();
        for row in rows(
            rules_csv,
            "rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand",
            "Rule",
        )? {
            let (line, fields) = row?;
            let error = |message: &str| format!("Rule line {line}: {message}");
            let [id, revision_id, series, effective, observed, kind, direction, operand] =
                fields.as_slice()
            else {
                return Err(error("Expected eight fields."));
            };
            if ![id, revision_id, series]
                .into_iter()
                .all(|value| valid_id(value))
            {
                return Err(error("Use stable IDs for each rule, revision and series."));
            }
            let effective_at =
                exact_utc(effective).ok_or_else(|| error("Use an exact UTC effective time."))?;
            let observed_at =
                exact_utc(observed).ok_or_else(|| error("Use an exact UTC observation time."))?;
            let (comparator, direction) = match (*kind, *direction, *operand) {
                ("off", "", "") => (Comparator::Off, AlertDirection::Either),
                (kind, direction, operand) => {
                    let comparator = match kind {
                        "threshold" => Comparator::Threshold(
                            decimal(operand)
                                .ok_or_else(|| error("Threshold requires a six-place number."))?,
                        ),
                        "sma" => Comparator::MovingAverage(
                            operand
                                .parse::<usize>()
                                .ok()
                                .filter(|window| (2..=MAX_WINDOW).contains(window))
                                .ok_or_else(|| {
                                    error("SMA requires a whole window between 2 and 1,000.")
                                })?,
                        ),
                        _ => {
                            return Err(error("Use threshold, sma or off with matching operands."))
                        }
                    };
                    let direction = match direction {
                        "above" => AlertDirection::Above,
                        "below" => AlertDirection::Below,
                        "either" => AlertDirection::Either,
                        _ => return Err(error("Choose above, below or either.")),
                    };
                    (comparator, direction)
                }
            };
            let rule = AlertRule {
                id: (*id).into(),
                revision_id: (*revision_id).into(),
                series: (*series).into(),
                effective_at,
                observed_at,
                comparator,
                direction,
            };
            let revisions = rule_ids.entry((*id).into()).or_default();
            if let Some(original) = revisions.iter().find(|row| row.revision_id == *revision_id) {
                if original != &rule {
                    return Err(error("A revision ID has conflicting fields."));
                }
                continue;
            }
            revisions.push(rule);
        }
        if rule_ids.is_empty() {
            return Err("Supply at least one alert rule.".into());
        }

        let mut by_series = BTreeMap::<String, Vec<Vec<AlertRule>>>::new();
        for (id, mut revisions) in rule_ids {
            revisions.sort_unstable_by_key(|rule| (rule.effective_at, rule.observed_at));
            let series = revisions[0].series.as_str();
            if revisions.iter().any(|rule| rule.series != series) {
                return Err(format!("Rule {id} changed its series."));
            }
            if revisions.windows(2).any(|pair| {
                pair[0].effective_at == pair[1].effective_at
                    && pair[0].observed_at == pair[1].observed_at
            }) {
                return Err(format!(
                    "Rule {id} has duplicate effective and observed times."
                ));
            }
            by_series.entry(series.into()).or_default().push(revisions);
        }

        let mut reports = BTreeMap::<&str, Observation>::new();
        for row in rows(
            observations_csv,
            "observation_id,series_id,measured_at,observed_at,value",
            "Observation",
        )? {
            let (line, fields) = row?;
            let error = |message: &str| format!("Observation line {line}: {message}");
            let [id, series, measured, observed, value] = fields.as_slice() else {
                return Err(error("Expected five fields."));
            };
            if !valid_id(id) || !valid_id(series) {
                return Err(error("Use stable IDs for each observation and series."));
            }
            let measured_at =
                exact_utc(measured).ok_or_else(|| error("Use an exact UTC measurement time."))?;
            let observed_at = exact_utc(observed)
                .filter(|time| *time >= measured_at)
                .ok_or_else(|| error("Observe at or after the exact UTC measurement time."))?;
            let value = decimal(value).ok_or_else(|| error("Use a six-place value."))?;
            let report = Observation {
                id: (*id).into(),
                series: (*series).into(),
                measured_at,
                observed_at,
                value,
            };
            if let Some(original) = reports.insert(id, report.clone()) {
                if original != report {
                    return Err(error("An observation ID has conflicting fields."));
                }
            }
        }
        let mut reports: Vec<_> = reports.into_values().collect();
        reports.sort_unstable_by(|a, b| {
            (a.observed_at, a.series.as_str(), a.measured_at).cmp(&(
                b.observed_at,
                b.series.as_str(),
                b.measured_at,
            ))
        });
        if reports.windows(2).any(|pair| {
            pair[0].observed_at == pair[1].observed_at
                && pair[0].series == pair[1].series
                && pair[0].measured_at == pair[1].measured_at
        }) {
            return Err(
                "One series has conflicting events at the same measurement and observation time."
                    .into(),
            );
        }
        Ok(Self { by_series, reports })
    }

    pub fn last_observation(&self) -> Option<i64> {
        self.reports.last().map(|report| report.observed_at)
    }

    pub fn notifications(
        &self,
        effective_cutoff: i64,
        known_cutoff: i64,
    ) -> Result<Vec<AlertNotification<'_>>, String> {
        let mut series = BTreeMap::<&str, Samples>::new();
        let mut notifications = Vec::new();
        let mut evaluations = 0;
        for current in self
            .reports
            .iter()
            .take_while(|row| row.observed_at <= known_cutoff)
            .filter(|row| row.measured_at <= effective_cutoff)
        {
            let Some(rules) = self.by_series.get(&current.series) else {
                continue;
            };
            let samples = series.entry(&current.series).or_default();
            let previous = samples.items.last().copied();
            if previous.is_some_and(|row| row.measured_at > current.measured_at) {
                continue;
            }
            evaluations += rules.len();
            if evaluations > MAX_EVALUATIONS {
                return Err("Alert replay exceeds two million rule evaluations. Narrow the cutoff or separate the series.".into());
            }
            let comparisons: Vec<_> = rules
                .iter()
                .filter_map(|timeline| {
                    let eligible =
                        timeline.partition_point(|rule| rule.effective_at <= current.measured_at);
                    let rule = timeline[..eligible]
                        .iter()
                        .rev()
                        .find(|rule| rule.observed_at <= current.observed_at)?;
                    Some((rule, samples.compared_to(rule.comparator)?))
                })
                .collect();
            samples.apply(current);
            let Some(previous) = previous else { continue };
            for (rule, (old, previous_comparison)) in comparisons {
                let Some((new, current_comparison)) = samples.compared_to(rule.comparator) else {
                    continue;
                };
                let direction = match (old, new) {
                    (Ordering::Less | Ordering::Equal, Ordering::Greater) => AlertDirection::Above,
                    (Ordering::Greater | Ordering::Equal, Ordering::Less) => AlertDirection::Below,
                    _ => continue,
                };
                if rule.direction != AlertDirection::Either && rule.direction != direction {
                    continue;
                }
                if notifications.len() == MAX_NOTIFICATIONS {
                    return Err("Alert replay exceeds 20,000 notifications. Narrow the cutoff or separate the series.".into());
                }
                notifications.push(AlertNotification {
                    id: format!("{}/{}/{}", rule.id, rule.revision_id, current.id),
                    rule,
                    direction,
                    previous,
                    current,
                    previous_comparison,
                    current_comparison,
                });
            }
        }
        Ok(notifications)
    }
}

fn rows<'a>(
    csv: &'a str,
    header: &str,
    name: &'a str,
) -> Result<impl Iterator<Item = Result<(usize, Vec<&'a str>), String>> + 'a, String> {
    if csv.len() > MAX_BYTES {
        return Err(format!("{name} CSV exceeds 1 MiB."));
    }
    let mut lines = csv
        .trim_start_matches('\u{feff}')
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());
    if lines.next().map(|(_, line)| line.trim()) != Some(header) {
        return Err(format!("Expected {name} header {header}."));
    }
    Ok(lines.enumerate().map(move |(index, (line, content))| {
        if index == MAX_ROWS {
            return Err(format!("Supply at most {MAX_ROWS} {name} rows."));
        }
        Ok((line + 1, content.split(',').map(str::trim).collect()))
    }))
}
