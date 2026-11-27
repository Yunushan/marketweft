use marketweft_core::{
    parse_exact_utc, parse_universe, portfolio_rights_exercises_as_of, RightsExerciseStage,
    RightsRequestAssessment,
};

const MEMBERSHIP: &str = include_str!("fixtures/synthetic-universe.csv");
const HOLDINGS: &str = include_str!("fixtures/synthetic-rights-holdings.csv");
const RIGHTS: &str = include_str!("fixtures/synthetic-subscription-rights.csv");
const EXERCISES: &str = include_str!("fixtures/synthetic-rights-exercises.csv");

fn utc(time: &str) -> i64 {
    parse_exact_utc(&format!("2025-06-02T{time}Z")).unwrap()
}

#[test]
fn independently_replays_request_allocation_settlement_revision_and_cancellation() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let run = |effective, known| {
        portfolio_rights_exercises_as_of(
            &universe,
            HOLDINGS,
            RIGHTS,
            EXERCISES,
            utc(effective),
            utc(known),
        )
        .unwrap()
    };
    assert!(run("14:41:59", "15:02:00").is_empty());
    assert!(run("14:42:00", "14:44:59").is_empty());
    let original = run("14:42:00", "14:45:00");
    let request = &original[0];
    assert_eq!(request.stage, RightsExerciseStage::Requested);
    assert_eq!(request.assessment, RightsRequestAssessment::WithinCapacity);
    assert_eq!(request.basic_capacity, Some(3));
    assert!(request.allocation.is_none() && request.settlement.is_none());
    assert_eq!(run("14:50:00", "14:51:59")[0], *request);
    let allocation = run("14:54:00", "14:56:59");
    assert_eq!(allocation[0].stage, RightsExerciseStage::Allocated);
    assert_eq!(allocation[0].allocation.as_ref().unwrap().shares, 2);
    assert!(allocation[0].settlement.is_none());
    assert_eq!(run("14:53:59", "14:59:00"), allocation);

    let first = run("14:54:00", "14:57:00");
    let settle = first[0].settlement.unwrap();
    assert_eq!(first[0].stage, RightsExerciseStage::Settled);
    assert_eq!(first[0].allocation.as_ref().unwrap().currency, "USD");
    assert_eq!(
        (settle.shares, settle.cash_paid, settle.cash_variance),
        (2, 38_500_000, 0)
    );
    let corrected = run("15:00:00", "14:59:00");
    let revised = corrected[0].settlement.unwrap();
    assert_eq!(
        (revised.cash_paid, revised.cash_variance),
        (39_000_001, 500_001)
    );
    assert_eq!(corrected[0].basic_capacity, Some(3));
    assert_eq!(corrected[1].exercise_id, "EX-B");
    assert_eq!(
        corrected[1].assessment,
        RightsRequestAssessment::OutsideWindow
    );
    assert_eq!(corrected[1].basic_capacity, None);
    assert_eq!(run("14:59:59", "15:02:00"), corrected);
    assert_eq!(run("15:00:00", "15:01:59"), corrected);
    let cancelled = run("15:00:00", "15:02:00");
    assert_eq!(cancelled[0].stage, RightsExerciseStage::Cancelled);
    assert!(cancelled[0].allocation.is_none() && cancelled[0].settlement.is_none());
    assert_eq!(run("14:54:00", "14:57:00"), first);
}

#[test]
fn validates_report_identity_quantity_fields_and_precision() {
    let universe = parse_universe(MEMBERSHIP).unwrap();
    let run = |holdings: &str, reports: &str| {
        portfolio_rights_exercises_as_of(
            &universe,
            holdings,
            RIGHTS,
            reports,
            utc("14:54:00"),
            utc("14:57:00"),
        )
    };
    for (from, to, error) in [
        (
            "ALFA-RIGHTS",
            "UNKNOWN-RIGHTS",
            "offering ID from the rights reports",
        ),
        ("14:45:00Z", "14:41:00Z", "times in that order"),
        (
            "3,2,USD,19.25,2,38.50",
            "3,2,USD,19.25,3,38.50",
            "within the allocation",
        ),
        (
            "3,2,USD,19.25,2,38.50",
            "3,2,USD,19.25,2,0.0000001",
            "six decimal places",
        ),
        ("3,2,USD,19.25,,", "3,4,USD,19.25,,", "within the request"),
        ("3,2,USD,19.25,,", "3,2,USD,19.25,0,0", "until settlement"),
    ] {
        let invalid = EXERCISES.replace(from, to);
        assert!(run(HOLDINGS, &invalid).unwrap_err().contains(error));
    }
    let duplicate = format!("{EXERCISES}{}\n", EXERCISES.lines().nth(1).unwrap());
    assert!(run(HOLDINGS, &duplicate).unwrap_err().contains("Duplicate"));

    let no_prior = HOLDINGS
        .lines()
        .filter(|line| !line.contains("14:06:00Z"))
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(
        run(&no_prior, EXERCISES).unwrap()[0].assessment,
        RightsRequestAssessment::Unavailable
    );
    let above = EXERCISES.replace(",3,", ",4,");
    assert_eq!(
        run(HOLDINGS, &above).unwrap()[0].assessment,
        RightsRequestAssessment::AboveCapacity
    );

    let partial = EXERCISES
        .lines()
        .enumerate()
        .filter(|(index, _)| *index == 0 || *index == 3)
        .map(|(_, line)| line)
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(
        run(HOLDINGS, &partial).unwrap()[0]
            .settlement
            .unwrap()
            .cash_paid,
        38_500_000
    );
}
