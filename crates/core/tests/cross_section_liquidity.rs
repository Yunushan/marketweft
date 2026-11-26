use marketweft_core::{parse_universe, LiquidityTape};

const UNIVERSE: &str = include_str!("fixtures/synthetic-listing-risk-membership.csv");
const CAPACITY: &str = concat!(
    "universe,listing_id,price_at,observed_at,sequence,price,shares\n",
    "RISK,A,2025-06-02T14:01:00Z,2025-06-02T14:01:00Z,9007199254740993,110.000001,2\n",
    "RISK,B,2025-06-02T14:00:00Z,2025-06-02T14:03:00Z,9007199254740994,100,3\n",
    "RISK,A,2025-06-02T14:02:00Z,2025-06-02T14:03:00Z,9007199254740995,110,1\n",
);

#[test]
fn an_earlier_price_time_enters_liquidity_at_its_later_observation() {
    let universe = parse_universe(UNIVERSE).unwrap();
    let tape = LiquidityTape::parse(&universe, CAPACITY).unwrap();
    let at = universe.checkpoints()[0];
    assert!(tape.through(at).is_empty());
    let first = tape.through(at + 60);
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].price, 110_000_001);
    assert_eq!(first[0].shares, 2);
    assert_eq!(tape.through(at + 120), first);
    let later = tape.through(at + 180);
    assert_eq!(later.len(), 3);
    assert_eq!(later[1].price_at, at);
    assert_eq!(later[1].sequence, 9_007_199_254_740_994);
    assert_eq!(later[2].sequence, 9_007_199_254_740_995);
    assert_eq!(tape.through(at + 60), first);
}

#[test]
fn aliases_duplicate_sequences_and_invalid_capacity_fail_transactionally() {
    let universe = parse_universe(UNIVERSE).unwrap();
    for (from, to, error) in [
        ("RISK,A,", "RISK,DEMO:ALFA,", "listing IDs"),
        (
            "9007199254740994",
            "9007199254740993",
            "sequences must increase",
        ),
        (",100,3\n", ",100,0\n", "positive whole-share capacity"),
        (
            ",100,3\n",
            ",100,1000000001\n",
            "positive whole-share capacity",
        ),
        (",100,3\n", ",100.0000001,3\n", "six fractional places"),
        (
            "2025-06-02T14:00:00Z,2025-06-02T14:03:00Z",
            "2025-06-02T14:05:00Z,2025-06-02T14:03:00Z",
            "precedes",
        ),
    ] {
        let csv = CAPACITY.replace(from, to);
        let message = LiquidityTape::parse(&universe, &csv).err().unwrap();
        assert!(message.contains(error), "{message}");
    }
    let empty = CAPACITY.lines().next().unwrap();
    assert!(LiquidityTape::parse(&universe, empty)
        .unwrap()
        .through(i64::MAX)
        .is_empty());
}
