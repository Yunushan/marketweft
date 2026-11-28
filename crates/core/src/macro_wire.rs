use crate::{history::exact_utc, MacroCalendar, ReportKind};
use std::fmt::Write;

/// The row format is shared by the browser and native research command.
pub(crate) fn macro_snapshot_rows(
    csv: &str,
    published: &str,
    known: &str,
) -> Result<(usize, String), String> {
    let (published, known) = exact_utc(published)
        .zip(exact_utc(known))
        .ok_or("Calendar times require YYYY-MM-DDTHH:MM:SSZ UTC timestamps.")?;
    let calendar = MacroCalendar::parse(csv)?;
    let snapshots = calendar.as_of(published, known);
    let mut text = String::new();
    let count = snapshots.len();
    for snapshot in snapshots {
        writeln!(
            text,
            "H\t{}\t{}\t{}\t{}",
            snapshot.release_id, snapshot.series_id, snapshot.reference_date, snapshot.unit
        )
        .unwrap();
        for record in snapshot
            .schedule
            .into_iter()
            .chain(snapshot.forecast)
            .chain(snapshot.actual_history)
        {
            let kind = match record.kind {
                ReportKind::Schedule => "S",
                ReportKind::Forecast => "F",
                ReportKind::Actual => "A",
                ReportKind::Revision => "R",
            };
            writeln!(
                text,
                "{kind}\t{}\t{}\t{}\t{}\t{}\t{}",
                record.record_id,
                record.published_at,
                record.observed_at,
                record
                    .scheduled_at
                    .map_or_else(String::new, |time| time.to_string()),
                record
                    .value
                    .map_or_else(String::new, |value| value.to_string()),
                record.supersedes.as_deref().unwrap_or_default()
            )
            .unwrap();
        }
    }
    Ok((count, text))
}
