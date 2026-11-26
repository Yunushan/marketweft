use marketweft_core::{parse_csv, parse_universe, UniverseAction, UniverseBook};
use UniverseAction::{Add, Delist, Remove};

const CSV: &str = include_str!("fixtures/synthetic-universe.csv");

fn clock(time: &str) -> i64 {
    parse_csv(&format!(
        "time,open,high,low,close,volume\n2025-06-02T{time}Z,0,0,0,0,0"
    ))
    .unwrap()[0]
        .time
}

fn rows(book: &UniverseBook, effective: &str, known: &str) -> Vec<(String, UniverseAction)> {
    book.as_of(clock(effective), clock(known))
        .into_iter()
        .map(|row| (row.listing_id.clone(), row.action))
        .collect()
}

#[test]
fn every_replay_cutoff_preserves_the_membership_known_at_that_time() {
    let book = parse_universe(CSV).unwrap();
    assert_eq!(book.name(), "DEMO-BASKET");
    let cutoffs = [
        "14:00:00", "14:05:00", "14:10:00", "14:25:00", "14:35:00", "14:40:00", "14:45:00",
        "14:50:00", "14:55:00", "15:00:00", "15:05:00",
    ];
    assert_eq!(book.checkpoints(), cutoffs.map(clock));
    let expected = [
        vec![("ALFA-001", Add)],
        vec![("ALFA-001", Add)],
        vec![("ALFA-001", Add), ("BETA-001", Add)],
        vec![("ALFA-001", Remove), ("BETA-001", Add)],
        vec![("ALFA-001", Remove), ("BETA-001", Delist)],
        vec![("ALFA-001", Remove), ("BETA-001", Delist)],
        vec![
            ("ALFA-001", Remove),
            ("BETA-001", Delist),
            ("BETA-002", Add),
        ],
        vec![("ALFA-001", Add), ("BETA-001", Delist), ("BETA-002", Add)],
        vec![("ALFA-001", Add), ("BETA-001", Delist), ("BETA-002", Add)],
        vec![("ALFA-001", Add), ("BETA-001", Delist), ("BETA-002", Add)],
        vec![("ALFA-001", Add), ("BETA-001", Delist), ("BETA-002", Add)],
    ];
    for (cutoff, expected) in cutoffs.into_iter().zip(expected) {
        assert_eq!(
            rows(&book, cutoff, cutoff),
            expected
                .into_iter()
                .map(|(id, state)| (id.into(), state))
                .collect::<Vec<_>>(),
            "{cutoff}"
        );
    }
    assert!(rows(&book, "13:59:59", "13:59:59").is_empty());
    for (at, members) in [
        ("14:09:59", 1),
        ("14:10:00", 2),
        ("14:24:59", 2),
        ("14:25:00", 1),
        ("14:34:59", 1),
        ("14:35:00", 0),
    ] {
        assert_eq!(
            rows(&book, at, at)
                .iter()
                .filter(|(_, state)| *state == Add)
                .count(),
            members
        );
    }
}

#[test]
fn as_of_queries_advance_effective_and_knowledge_time_independently() {
    let book = parse_universe(CSV).unwrap();
    let state = |listing: &str, effective, known| {
        rows(&book, effective, known)
            .into_iter()
            .find(|(id, _)| id == listing)
            .map(|(_, state)| state)
    };
    assert_eq!(state("BETA-001", "14:10:00", "14:04:59"), None);
    assert_eq!(state("BETA-001", "14:09:59", "14:05:00"), None);
    assert_eq!(state("BETA-001", "14:10:00", "14:05:00"), Some(Add));
    assert_eq!(state("ALFA-001", "14:20:00", "14:24:59"), Some(Add));
    assert_eq!(state("ALFA-001", "14:19:59", "14:25:00"), Some(Add));
    assert_eq!(state("ALFA-001", "14:20:00", "14:25:00"), Some(Remove));
    assert_eq!(state("BETA-001", "14:30:00", "14:34:59"), Some(Add));
    assert_eq!(state("BETA-001", "14:30:00", "14:35:00"), Some(Delist));
    assert_eq!(state("ALFA-001", "15:10:00", "14:59:59"), Some(Remove));
    assert_eq!(state("ALFA-001", "15:10:00", "15:00:00"), Some(Add));
    assert_eq!(state("ALFA-001", "15:20:00", "15:04:59"), Some(Remove));
    assert_eq!(state("ALFA-001", "15:20:00", "15:05:00"), Some(Add));
    assert_eq!(state("BETA-001", "15:20:00", "15:05:00"), Some(Delist));
    assert_eq!(state("BETA-002", "15:20:00", "15:05:00"), Some(Add));
}

#[test]
fn ties_are_conservative_and_a_delisted_listing_does_not_reappear() {
    let more = concat!(
        "DEMO-BASKET,BETA-ADD-TIE,BETA-001,DEMO:BETA,2025-06-02T14:30:00Z,2025-06-02T14:35:00Z,add\n",
        "DEMO-BASKET,BETA-REMOVE-TIE,BETA-001,DEMO:BETA,2025-06-02T14:30:00Z,2025-06-02T14:35:00Z,remove\n",
        "DEMO-BASKET,BETA-TRY-RETURN,BETA-001,DEMO:BETA,2025-06-02T15:10:00Z,2025-06-02T15:10:00Z,add\n",
    );
    let csv = format!("{CSV}{more}");
    let mut lines = csv.lines();
    let header = lines.next().unwrap();
    let reversed = format!("{header}\n{}", lines.rev().collect::<Vec<_>>().join("\n"));
    let book = parse_universe(&csv).unwrap();
    let shuffled = parse_universe(&reversed).unwrap();
    assert_eq!(
        book.as_of(clock("15:10:00"), clock("15:10:00")),
        shuffled.as_of(clock("15:10:00"), clock("15:10:00"))
    );
    assert_eq!(
        book.as_of(clock("15:10:00"), clock("15:10:00"))
            .iter()
            .find(|row| row.listing_id == "BETA-001")
            .unwrap()
            .change_id,
        "BETA-DELIST"
    );
}

#[test]
fn input_rejects_mixed_universes_conflicting_identities_and_duplicate_revisions() {
    let first = CSV.lines().nth(1).unwrap();
    for invalid in [
        format!("{CSV}{first}\n"),
        format!("{CSV}{}", first.replace("DEMO-BASKET", "OTHER")),
        format!(
            "{CSV}{}",
            first
                .replace("ALFA-001", "DIFFERENT")
                .replace("14:00:00Z,add", "14:01:00Z,add")
        ),
        format!(
            "{CSV}{}",
            first
                .replace("ALFA-BASE", "IDENTITY")
                .replace("DEMO:ALFA", "OTHER:ALFA")
        ),
        CSV.replace("DEMO:ALFA", "demo:ALFA"),
        CSV.replace("14:05:00Z", "14:05:00+00:00"),
        CSV.replace(",delist", ",unknown"),
    ] {
        assert!(parse_universe(&invalid).is_err(), "{invalid}");
    }
}
