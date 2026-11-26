use crate::{
    history::{decimal_ticks, exact_date, exact_utc},
    universe::valid_id,
};
use std::collections::{BTreeMap, BTreeSet};

const MAX_ROWS: usize = 10_000;
const MAX_BYTES: usize = 1024 * 1024;
const MAX_VALUE_TICKS: i128 = 10_i128.pow(27);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReportKind {
    Schedule,
    Forecast,
    Actual,
    Revision,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleaseRecord {
    pub record_id: String,
    pub kind: ReportKind,
    pub published_at: i64,
    pub observed_at: i64,
    pub scheduled_at: Option<i64>,
    pub value: Option<i128>,
    pub supersedes: Option<String>,
}

#[derive(Clone, Debug)]
struct Release {
    series_id: String,
    reference_date: i64,
    unit: String,
    records: Vec<ReleaseRecord>,
}

pub struct MacroCalendar {
    releases: BTreeMap<String, Release>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleaseSnapshot<'a> {
    pub release_id: &'a str,
    pub series_id: &'a str,
    pub reference_date: i64,
    pub unit: &'a str,
    pub schedule: Option<&'a ReleaseRecord>,
    pub forecast: Option<&'a ReleaseRecord>,
    pub actual_history: Vec<&'a ReleaseRecord>,
}

impl MacroCalendar {
    pub fn parse(csv: &str) -> Result<Self, String> {
        if csv.len() > MAX_BYTES {
            return Err("Macro calendar CSV exceeds 1 MiB.".into());
        }
        let mut lines = csv
            .trim_start_matches('\u{feff}')
            .lines()
            .enumerate()
            .filter(|(_, row)| !row.trim().is_empty());
        if lines.next().map(|(_, row)| row.trim()) != Some(
            "release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes",
        ) {
            return Err("Expected the macro calendar CSV header.".into());
        }
        let mut releases = BTreeMap::<String, Release>::new();
        for (index, (line, content)) in lines.enumerate() {
            let error = |message: &str| format!("Calendar line {}: {message}", line + 1);
            if index == MAX_ROWS {
                return Err(error("Supply at most 10,000 macro reports."));
            }
            let fields: Vec<_> = content.split(',').map(str::trim).collect();
            let [id, series, date, unit, record, kind, published, observed, scheduled, value, supersedes] =
                fields.as_slice()
            else {
                return Err(error("Expected exactly eleven fields."));
            };
            if ![id, series, unit, record]
                .into_iter()
                .all(|field| valid_id(field))
            {
                return Err(error("Use stable release, series, unit and record IDs."));
            }
            let reference_date =
                exact_date(date).ok_or_else(|| error("Use a YYYY-MM-DD reference date."))?;
            let published_at =
                exact_utc(published).ok_or_else(|| error("Use an exact UTC publication time."))?;
            let observed_at =
                exact_utc(observed).ok_or_else(|| error("Use an exact UTC observation time."))?;
            if observed_at < published_at {
                return Err(error("Observe a record at or after publication."));
            }
            let (kind, scheduled_at, value, supersedes) = match *kind {
                "schedule" if value.is_empty() && supersedes.is_empty() => {
                    let time = exact_utc(scheduled)
                        .filter(|time| *time >= published_at)
                        .ok_or_else(|| {
                            error("A schedule requires a UTC time at or after publication.")
                        })?;
                    (ReportKind::Schedule, Some(time), None, None)
                }
                "forecast" | "actual" | "revision" if scheduled.is_empty() => {
                    let amount = decimal_ticks(value)
                        .filter(|ticks| ticks.abs() <= MAX_VALUE_TICKS)
                        .ok_or_else(|| {
                            error("Use a signed six-place value with absolute value up to 10^21.")
                        })?;
                    let (kind, prior) = match (*kind, *supersedes) {
                        ("forecast", "") => (ReportKind::Forecast, None),
                        ("actual", "") => (ReportKind::Actual, None),
                        ("revision", prior) if valid_id(prior) => {
                            (ReportKind::Revision, Some(prior.to_owned()))
                        }
                        _ => return Err(error("Only a revision requires a prior record ID.")),
                    };
                    (kind, None, Some(amount), prior)
                }
                _ => {
                    return Err(error(
                        "Use schedule, forecast, actual or revision with matching fields.",
                    ))
                }
            };
            let release = releases.entry((*id).into()).or_insert_with(|| Release {
                series_id: (*series).into(),
                reference_date,
                unit: (*unit).into(),
                records: Vec::new(),
            });
            if release.series_id != *series
                || release.reference_date != reference_date
                || release.unit != *unit
            {
                return Err(error(
                    "A release ID must keep its series, reference date and unit.",
                ));
            }
            release.records.push(ReleaseRecord {
                record_id: (*record).into(),
                kind,
                published_at,
                observed_at,
                scheduled_at,
                value,
                supersedes,
            });
        }
        if releases.is_empty() {
            return Err("Supply at least one macro report.".into());
        }
        for (id, release) in &mut releases {
            release.records.sort_unstable_by(|a, b| {
                (a.published_at, a.observed_at, a.record_id.as_str()).cmp(&(
                    b.published_at,
                    b.observed_at,
                    b.record_id.as_str(),
                ))
            });
            let mut ids = BTreeSet::new();
            let mut predecessor: Option<&ReleaseRecord> = None;
            for row in &release.records {
                if !ids.insert(row.record_id.as_str()) {
                    return Err(format!("Release {id} repeats record {}.", row.record_id));
                }
                match row.kind {
                    ReportKind::Actual if predecessor.is_none() => predecessor = Some(row),
                    ReportKind::Revision
                        if predecessor.is_some_and(|prior| {
                            row.supersedes.as_deref() == Some(prior.record_id.as_str())
                                && row.published_at > prior.published_at
                        }) =>
                    {
                        predecessor = Some(row)
                    }
                    ReportKind::Actual | ReportKind::Revision => {
                        return Err(format!(
                        "Release {id} must have one initial actual and a linear revision chain."
                    ))
                    }
                    _ => {}
                }
            }
        }
        Ok(Self { releases })
    }

    pub fn first_observation(&self) -> i64 {
        self.releases
            .values()
            .flat_map(|release| &release.records)
            .map(|row| row.observed_at)
            .min()
            .unwrap()
    }

    pub fn as_of(&self, published_through: i64, known_at: i64) -> Vec<ReleaseSnapshot<'_>> {
        let mut results = Vec::new();
        for (release_id, release) in &self.releases {
            let count = release
                .records
                .partition_point(|row| row.published_at <= published_through);
            let public = &release.records[..count];
            let latest = |kind, before: Option<i64>| {
                public.iter().rev().find(|row| {
                    row.kind == kind
                        && row.observed_at <= known_at
                        && before.is_none_or(|freeze| row.observed_at < freeze)
                })
            };
            let actual_history: Vec<_> = public
                .iter()
                .filter(|row| matches!(row.kind, ReportKind::Actual | ReportKind::Revision))
                .take_while(|row| row.observed_at <= known_at)
                .collect();
            let schedule = latest(ReportKind::Schedule, None);
            let forecast = latest(
                ReportKind::Forecast,
                actual_history.first().map(|row| row.published_at),
            );
            if schedule.is_some() || forecast.is_some() || !actual_history.is_empty() {
                results.push(ReleaseSnapshot {
                    release_id,
                    series_id: &release.series_id,
                    reference_date: release.reference_date,
                    unit: &release.unit,
                    schedule,
                    forecast,
                    actual_history,
                });
            }
        }
        results.sort_unstable_by_key(|row| {
            let at = row
                .schedule
                .and_then(|record| record.scheduled_at)
                .or_else(|| row.actual_history.first().map(|record| record.published_at));
            (at.is_none(), at.unwrap_or_default(), row.release_id)
        });
        results
    }
}
