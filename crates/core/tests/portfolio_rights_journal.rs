use marketweft_core::{
    parse_exact_utc, parse_universe, portfolio_rights_settlement_journal, RightsExerciseStage,
    RightsSettlementAsset::{Cash, Shares},
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const RIGHTS: &str = include_str!("fixtures/synthetic-subscription-rights.csv");
const REPORTS: &str = include_str!("fixtures/synthetic-rights-journal.csv");

fn utc(time: &str) -> i64 {
    parse_exact_utc(&format!("2025-06-02T{time}Z")).unwrap()
}

#[test]
fn journals_paid_cash_delivered_shares_and_revisions_without_crossing_currencies() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let run = |effective, known| {
        portfolio_rights_settlement_journal(&universe, RIGHTS, REPORTS, utc(effective), utc(known))
            .unwrap()
    };
    assert!(run("14:53:59", "15:02:00").is_empty());
    assert!(run("14:54:00", "14:56:59").is_empty());
    let original = run("14:54:00", "14:57:00");
    assert_eq!(original.len(), 2);
    assert!(original.iter().all(|row| row.offering_id == "ALFA-RIGHTS"
        && row.exercise_id == "EX-A"
        && row.effective_at == utc("14:54:00")
        && row.observed_at == utc("14:57:00")
        && row.stage == RightsExerciseStage::Settled));

    let all = run("15:00:00", "15:02:00");
    let postings: Vec<_> = all
        .iter()
        .map(|row| (row.asset.clone(), row.delta, row.balance))
        .collect();
    assert_eq!(
        postings,
        [
            (Shares, 2, 2),
            (Cash("USD".into()), -38_500_000, -38_500_000),
            (Cash("USD".into()), -500_001, -39_000_001),
            (Shares, -1, 1),
            (Cash("USD".into()), 39_000_001, 0),
            (Cash("EUR".into()), -20_125_001, -20_125_001),
            (Shares, -1, 0),
            (Cash("EUR".into()), 20_125_001, 0),
        ]
    );
    assert_eq!(run("14:54:00", "14:59:00"), all[..3]);
    assert_eq!(run("14:59:59", "15:02:00"), all[..6]);
    assert_eq!(run("15:00:00", "15:01:59"), all[..6]);
    assert!(all[6..]
        .iter()
        .all(|row| row.stage == RightsExerciseStage::Cancelled));
    assert_eq!(run("14:54:00", "14:57:00"), original);

    let mut source = REPORTS.lines();
    let header = source.next().unwrap();
    let reversed = std::iter::once(header)
        .chain(source.rev())
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(
        portfolio_rights_settlement_journal(
            &universe,
            RIGHTS,
            &reversed,
            utc("15:00:00"),
            utc("15:02:00")
        )
        .unwrap(),
        all,
    );
}

#[test]
fn simultaneous_reports_publish_only_the_effective_winner() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let header = REPORTS.lines().next().unwrap();
    let csv = format!("{header}\n\
DEMO-BASKET,ALFA-RIGHTS,EX-A,2025-06-02T14:53:00Z,2025-06-02T14:59:00Z,settled,2025-06-02T14:42:00Z,3,2,EUR,20,1,20\n\
DEMO-BASKET,ALFA-RIGHTS,EX-A,2025-06-02T14:54:00Z,2025-06-02T14:59:00Z,settled,2025-06-02T14:42:00Z,3,2,USD,19.25,2,39.000001\n");
    let query = |effective| {
        portfolio_rights_settlement_journal(
            &universe,
            RIGHTS,
            &csv,
            utc(effective),
            utc("14:59:00"),
        )
        .unwrap()
    };
    let full = query("14:54:00");
    assert_eq!(full.len(), 2);
    assert_eq!(
        (&full[1].asset, full[1].delta),
        (&Cash("USD".into()), -39_000_001)
    );
    let early = query("14:53:59");
    assert_eq!(early.len(), 2);
    assert_eq!(
        (&early[1].asset, early[1].delta),
        (&Cash("EUR".into()), -20_000_000)
    );
}
