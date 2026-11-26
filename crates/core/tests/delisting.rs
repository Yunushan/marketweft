use marketweft_core::{parse_delistings, parse_universe, DelistingState};

const UNIVERSE: &str = include_str!("fixtures/synthetic-universe.csv");
const TERMS: &str = include_str!("fixtures/synthetic-delisting-terms.csv");
const BASE: i64 = 1_748_872_800;

#[test]
fn delayed_delist_and_missing_proceeds_are_independent_of_ticker_reuse() {
    let book = parse_delistings(parse_universe(UNIVERSE).unwrap(), TERMS).unwrap();
    let time = |minute: i64| BASE + 60 * minute;
    let at = |effective, known| {
        book.as_of("BETA-001", 10, time(effective), time(known))
            .unwrap()
    };
    assert_eq!(at(29, 65).state, DelistingState::Shares);
    assert_eq!(at(32, 34).ordinary_shares, 10);
    let missing = at(35, 35);
    assert_eq!(missing.state, DelistingState::MissingProceeds);
    assert_eq!((missing.ordinary_shares, missing.entitled_shares), (0, 10));
    assert_eq!(missing.cash_value, None);
    let receivable = at(49, 49);
    assert_eq!(receivable.state, DelistingState::Receivable);
    assert_eq!(receivable.cash_value, Some(70_000_000));
    assert_eq!(receivable.return_pct_micros, Some(-30_000_000));
    let reused = book.as_of("BETA-002", 3, time(50), time(50)).unwrap();
    assert_eq!(reused.state, DelistingState::Shares);
    assert_eq!(reused.ordinary_shares, 3);
    assert_eq!(at(50, 50).state, DelistingState::Paid);
    assert_eq!(at(64, 64).return_pct_micros, None);
    let zero = at(65, 65);
    assert_eq!(zero.state, DelistingState::Paid);
    assert_eq!(zero.cash_value, Some(0));
    assert_eq!(zero.return_pct_micros, Some(-100_000_000));
    assert!(book.ledger("BETA-002", 3, time(65)).unwrap().is_empty());
}

#[test]
fn recreates_exact_cash_and_reverses_corrections_only_when_observed() {
    let book = parse_delistings(parse_universe(UNIVERSE).unwrap(), TERMS).unwrap();
    let run = |minute| book.ledger("BETA-001", 10, BASE + minute * 60).unwrap();
    assert!(run(49_i64).is_empty());
    let ahead = run(65);
    let observed: Vec<_> = ahead
        .iter()
        .map(|event| {
            (
                (event.at - BASE) / 60,
                event.currency.as_str(),
                event.delta,
                event.balance,
            )
        })
        .collect();
    assert_eq!(
        observed,
        [
            (50, "USD", 70_000_000, 70_000_000),
            (55, "USD", 10_000_000, 80_000_000),
            (61, "USD", -80_000_000, 0),
            (64, "EUR", 90_000_000, 90_000_000),
            (65, "EUR", -90_000_000, 0),
        ]
    );
    assert_eq!(run(55), ahead[..2]);
    assert_eq!(run(63), ahead[..3]);
    assert_eq!(run(64), ahead[..4]);
}

#[test]
fn cancellation_and_validation_use_stable_listing_and_change_ids() {
    let mut universe = UNIVERSE.to_owned();
    universe.push_str("DEMO-BASKET,BETA-DELIST,BETA-001,DEMO:BETA,2025-06-02T14:30:00Z,2025-06-02T14:56:00Z,cancel\n");
    let universe = parse_universe(&universe).unwrap();
    let invalid = TERMS.replace("BETA-001,BETA-DELIST", "BETA-002,BETA-DELIST");
    assert!(parse_delistings(universe.clone(), &invalid).is_err());
    let duplicate = TERMS.replace("15:05:00Z,", "15:01:00Z,");
    assert!(parse_delistings(universe.clone(), &duplicate).is_err());
    let never_known = TERMS.replace("14:28:00Z,", "16:28:00Z,");
    assert!(parse_delistings(universe.clone(), &never_known).is_err());
    let book = parse_delistings(universe, TERMS).unwrap();
    let after = BASE + 65 * 60;
    let state = book.as_of("BETA-001", 10, after, after).unwrap();
    assert_eq!(state.state, DelistingState::Shares);
    assert_eq!(state.ordinary_shares, 10);
    let correction = book.ledger("BETA-001", 10, after).unwrap().pop().unwrap();
    assert_eq!(
        (correction.at, correction.delta),
        (BASE + 56 * 60, -80_000_000)
    );
}
