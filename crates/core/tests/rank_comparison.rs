use marketweft_core::{parse_universe, PriceBook, ScreenCutoff, UniverseAction};

const START: i64 = 1_748_872_800;

fn cutoff(effective: i64, known: i64) -> ScreenCutoff {
    ScreenCutoff {
        effective_at: START + effective,
        known_at: START + known,
    }
}

#[test]
fn comparisons_preserve_active_sets_delisting_identity_and_independent_observation_times() {
    let universe = parse_universe(include_str!("fixtures/synthetic-universe.csv")).unwrap();
    let book = PriceBook::parse(
        &universe,
        include_str!("fixtures/synthetic-universe-prices.csv"),
    )
    .unwrap();
    let addition = book
        .compare_ranks(START, cutoff(300, 300), cutoff(600, 719))
        .unwrap();
    assert_eq!(addition.len(), 2);
    let beta = &addition[1];
    assert_eq!(beta.listing.listing_id, "BETA-001");
    assert!(beta.before.membership.is_none());
    assert_eq!(beta.after.membership.unwrap().change_id, "BETA-JOIN");
    assert!(beta.after.rank.is_none());
    assert!(beta.after.current.is_none());
    assert_eq!(beta.after.baseline.unwrap().ticks, 50_000_000);
    let revision = book
        .compare_ranks(START, cutoff(600, 720), cutoff(600, 960))
        .unwrap();
    assert_eq!(revision[0].rank_move, Some(1));
    assert_eq!(revision[1].rank_move, Some(-1));
    assert_eq!(revision[1].before.current.unwrap().observed_at, START + 720);
    assert_eq!(revision[1].after.current.unwrap().ticks, 50_500_000);

    let removal = book
        .compare_ranks(START, cutoff(1200, 1499), cutoff(1200, 1500))
        .unwrap();
    let alfa = &removal[0];
    let event = alfa.after.membership.unwrap();
    assert_eq!(event.action, UniverseAction::Remove);
    assert_eq!(event.observed_at, START + 1500);
    assert_eq!(alfa.before.rank, Some(2));
    assert!(alfa.after.current.is_none());
    assert!(alfa.rank_move.is_none());

    let reuse = book
        .compare_ranks(START, cutoff(1200, 1500), cutoff(2700, 2700))
        .unwrap();
    assert_eq!(
        reuse
            .iter()
            .map(|row| row.listing.listing_id.as_str())
            .collect::<Vec<_>>(),
        ["BETA-001", "BETA-002"]
    );
    assert_eq!(
        reuse[0].after.membership.unwrap().action,
        UniverseAction::Delist
    );
    assert!(reuse[1].after.baseline.is_none());
    assert_eq!(reuse[1].after.current.unwrap().ticks, 75_000_000);
    assert!(book
        .compare_ranks(START + 301, cutoff(300, 300), cutoff(600, 960))
        .is_err());
}
