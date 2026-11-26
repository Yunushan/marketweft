use marketweft_core::MacroCalendar;

const CSV: &str = include_str!("fixtures/synthetic-macro-calendar.csv");
const BASE: i64 = 1_743_688_800; // 2025-04-03T14:00:00Z

#[test]
fn forecasts_are_visible_before_release_and_actuals_wait_for_both_cutoffs() {
    let book = MacroCalendar::parse(CSV).unwrap();
    let snapshots = |public, known| book.as_of(BASE + public, BASE + known);
    assert_eq!(book.first_observation(), BASE - 58 * 60);
    assert!(snapshots(-3600, -3600).is_empty());
    let upcoming = snapshots(8 * 60, 8 * 60);
    assert_eq!(upcoming.len(), 2);
    assert_eq!(
        upcoming[0].schedule.unwrap().scheduled_at,
        Some(BASE + 10 * 60)
    );
    assert_eq!(upcoming[0].forecast.unwrap().value, Some(2_400_000));
    assert_eq!(
        snapshots(9 * 60, 9 * 60)[0].schedule.unwrap().scheduled_at,
        Some(BASE + 30 * 60)
    );
    for (published, known) in [(30 * 60 - 1, 32 * 60), (30 * 60, 32 * 60 - 1)] {
        assert!(snapshots(published, known)[0].actual_history.is_empty());
    }
    let actual = snapshots(30 * 60, 32 * 60);
    assert_eq!(actual[0].forecast.unwrap().record_id, "CPI-F2");
    assert_eq!(actual[0].actual_history[0].value, Some(2_700_000));
    assert_eq!(snapshots(35 * 60, 35 * 60)[0], actual[0]);
    let revised = snapshots(50 * 60, 52 * 60);
    assert_eq!(
        revised[0]
            .actual_history
            .iter()
            .map(|row| (row.record_id.as_str(), row.value))
            .collect::<Vec<_>>(),
        [
            ("CPI-A0", Some(2_700_000)),
            ("CPI-A1", Some(2_600_000)),
            ("CPI-A2", Some(2_800_000))
        ]
    );
    assert_eq!(
        revised[0].actual_history[2].supersedes.as_deref(),
        Some("CPI-A1")
    );
    assert_eq!(snapshots(44 * 60, 51 * 60)[0].actual_history.len(), 2);
    assert_eq!(snapshots(30 * 60, 32 * 60), actual);
}

#[test]
fn revisions_wait_for_a_complete_lineage_even_if_received_out_of_order() {
    let late = CSV.replace("14:32:00Z,,2.7", "14:49:00Z,,2.7");
    let book = MacroCalendar::parse(&late).unwrap();
    assert!(book.as_of(BASE + 45 * 60, BASE + 48 * 60)[0]
        .actual_history
        .is_empty());
    assert_eq!(
        book.as_of(BASE + 49 * 60, BASE + 49 * 60)[0]
            .actual_history
            .len(),
        2
    );
}

#[test]
fn validates_reference_identity_publication_numbers_and_revision_chain() {
    let reversed = format!(
        "{}\n{}",
        CSV.lines().next().unwrap(),
        CSV.split_once('\n')
            .unwrap()
            .1
            .lines()
            .rev()
            .collect::<Vec<_>>()
            .join("\n")
    );
    let a = MacroCalendar::parse(CSV).unwrap();
    let b = MacroCalendar::parse(&reversed).unwrap();
    assert_eq!(
        a.as_of(BASE + 60 * 60, BASE + 60 * 60),
        b.as_of(BASE + 60 * 60, BASE + 60 * 60)
    );
    for broken in [
        CSV.replace("2.8,CPI-A1", "2.8,CPI-A0"),
        CSV.replace("CPI-A2,revision", "CPI-A1,revision"),
        CSV.replace("2.6,CPI-A0", "2.6000001,CPI-A0"),
        CSV.replacen("2025-03-01,percent", "2025-02-31,percent", 1),
        CSV.replacen("2025-03-01,percent", "2025-03-01,points", 1),
        CSV.replacen("13:02:00Z,2025-", "12:59:59Z,2025-", 1),
    ] {
        assert!(MacroCalendar::parse(&broken).is_err());
    }
}
