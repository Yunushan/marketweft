use marketweft_core::{parse_exact_utc, ProviderHistory};

const FIXTURE: &str = include_str!("fixtures/synthetic-provider-revisions.csv");

fn utc(time: &str) -> i64 {
    parse_exact_utc(&format!("2025-06-02T{time}Z")).unwrap()
}

#[test]
fn provider_replay_preserves_earlier_bars_and_independent_cutoffs() {
    let book = ProviderHistory::parse(FIXTURE).unwrap();
    assert_eq!(book.provider(), "synthetic-sample");
    assert_eq!(book.instrument().to_string(), "DEMO:ALFA");
    let replay = |effective, known| {
        book.as_of(utc(effective), utc(known))
            .unwrap()
            .into_iter()
            .map(|row| (row.bar.time, row.observed_at, row.bar.close, row.bar.volume))
            .collect::<Vec<_>>()
    };
    assert!(replay("14:02:00", "13:59:59").is_empty());
    let early = replay("14:02:00", "14:03:59");
    assert_eq!(
        early,
        [
            (utc("14:00:00"), utc("14:00:00"), 10_000_001, 100_000_001),
            (utc("14:02:00"), utc("14:02:00"), 12_500_001, 110_000_000),
        ]
    );
    assert_eq!(
        replay("14:00:00", "14:04:00"),
        [(utc("14:00:00"), utc("14:04:00"), 10_250_001, 100_000_002),]
    );
    assert_eq!(
        replay("14:02:00", "14:05:00"),
        [
            (utc("14:00:00"), utc("14:04:00"), 10_250_001, 100_000_002),
            (utc("14:01:00"), utc("14:05:00"), 11_750_001, 95_000_001),
            early[1],
        ]
    );
    assert_eq!(replay("14:02:00", "14:03:59"), early);
}

#[test]
fn provider_replay_rejects_invalid_rows_and_does_not_depend_on_row_order() {
    let mut lines = FIXTURE.lines();
    let header = lines.next().unwrap();
    let mut data = lines.collect::<Vec<_>>();
    let invalid = |replacement: &str| format!("{header}\n{replacement}");
    assert!(ProviderHistory::parse(&invalid(&data[0].replace("DEMO,ALFA", "DEMO,ALFA!"))).is_err());
    assert!(
        ProviderHistory::parse(&invalid(&data[0].replace("synthetic-sample", "Synthetic")))
            .is_err()
    );
    assert!(ProviderHistory::parse(&invalid(&data[0].replacen(
        "14:00:00Z,10",
        "13:59:59Z,10",
        1
    )))
    .is_err());
    assert!(ProviderHistory::parse(&invalid(&data[0].replace("10.500001", "1"))).is_err());
    assert!(ProviderHistory::parse(&format!("{header}\n{}\n{}", data[0], data[0])).is_err());
    assert!(ProviderHistory::parse(&format!(
        "{header}\n{}\n{}",
        data[0],
        data[1].replace("DEMO,ALFA", "DEMO,BETA")
    ))
    .is_err());
    data.reverse();
    let reversed = ProviderHistory::parse(&format!("{header}\n{}", data.join("\n"))).unwrap();
    let original = ProviderHistory::parse(FIXTURE).unwrap();
    assert_eq!(
        reversed.as_of(utc("14:02:00"), utc("14:05:00")),
        original.as_of(utc("14:02:00"), utc("14:05:00"))
    );
}
