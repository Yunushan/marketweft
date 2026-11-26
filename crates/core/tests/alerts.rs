use marketweft_core::{AlertBook, AlertDirection};

const RULES: &str = include_str!("fixtures/synthetic-alert-rules.csv");
const OBSERVATIONS: &str = include_str!("fixtures/synthetic-alert-observations.csv");
const BASE: i64 = 1_743_688_800;

#[test]
fn revisions_corrections_and_moving_average_crossings_replay_deterministically() {
    let book = AlertBook::parse(RULES, OBSERVATIONS).unwrap();
    let at = |effective: i64, known: i64| {
        book.notifications(BASE + effective * 60, BASE + known * 60)
            .unwrap()
    };
    assert!(at(1, 8).is_empty());
    let early = at(8, 2);
    assert_eq!(early.len(), 1);
    assert_eq!(early[0].id, "LEVEL/R1/O2");
    assert_eq!(early[0].direction, AlertDirection::Above);

    let revised = at(8, 3);
    assert_eq!(revised[1].id, "LEVEL/R1/O2C");
    assert_eq!(revised[1].previous.id, "O2");
    assert_eq!(revised[1].current.id, "O2C");
    assert_eq!(revised[2].id, "MEAN/R1/O2C");
    assert_eq!(revised[2].previous_comparison, (15_000_000, 3));
    assert_eq!(revised[2].current_comparison, (12_000_000, 3));
    assert_eq!(revised[2].direction, AlertDirection::Below);

    let all = at(8, 8);
    let ids: Vec<_> = all.iter().map(|event| event.id.as_str()).collect();
    assert_eq!(
        ids,
        [
            "LEVEL/R1/O2",
            "LEVEL/R1/O2C",
            "MEAN/R1/O2C",
            "LEVEL/R1/O4",
            "MEAN/R1/O4",
            "LEVEL/R2/O7",
            "MEAN/R1/O7",
            "MEAN/R1/O8",
        ]
    );
    assert_eq!(at(8, 8), all);
    assert_eq!(at(8, 2), early);
    assert_eq!(&all[..early.len()], &early);
    assert_eq!(book.last_observation(), Some(BASE + 8 * 60));
}

#[test]
fn identical_duplicates_are_idempotent_and_conflicting_ids_fail_closed() {
    let book = AlertBook::parse(RULES, OBSERVATIONS).unwrap();
    let reversed = format!(
        "{}\n{}",
        OBSERVATIONS.lines().next().unwrap(),
        OBSERVATIONS
            .split_once('\n')
            .unwrap()
            .1
            .lines()
            .rev()
            .collect::<Vec<_>>()
            .join("\n")
    );
    let reordered = AlertBook::parse(RULES, &reversed).unwrap();
    assert_eq!(
        book.notifications(BASE + 500, BASE + 500),
        reordered.notifications(BASE + 500, BASE + 500)
    );

    assert!(AlertBook::parse(
        RULES,
        &OBSERVATIONS.replacen("14:02:00Z,6", "14:02:00Z,8", 1)
    )
    .is_err());
    assert!(AlertBook::parse(
        &RULES.replace("R2,DEMO.CLOSE", "R1,DEMO.CLOSE"),
        OBSERVATIONS
    )
    .is_err());
    assert!(
        AlertBook::parse(&RULES.replace("sma,either,3", "sma,either,1"), OBSERVATIONS).is_err()
    );
    assert!(AlertBook::parse(RULES, &OBSERVATIONS.replace("14:07:00Z,5", "13:59:00Z,5")).is_err());
}

#[test]
fn refuses_batches_above_the_work_or_notification_budget() {
    let run = |rule_count, observation_count, alternating| {
        let mut rules = RULES.lines().next().unwrap().to_owned();
        for index in 0..rule_count {
            rules.push_str(&format!(
                "\nR{index},R1,TEST,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5"
            ));
        }
        let mut observations = OBSERVATIONS.lines().next().unwrap().to_owned();
        for index in 0..observation_count {
            let at = format!("2025-04-03T14:{:02}:{:02}Z", index / 60, index % 60);
            let ticks = if alternating && index % 2 == 0 { 6 } else { 4 };
            observations.push_str(&format!("\nO{index},TEST,{at},{at},{ticks}"));
        }
        let book = AlertBook::parse(&rules, &observations).unwrap();
        book.notifications(BASE + 3600, BASE + 3600).unwrap_err()
    };
    assert!(run(250, 100, true).contains("20,000"));
    assert!(run(1000, 2100, false).contains("two million"));
}
