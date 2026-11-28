use marketweft_core::{DepthLevel, DepthStatus, DepthTape, Instrument, PaperSide};

const FIXTURE: &str = include_str!("fixtures/synthetic-depth.csv");
const N: u64 = 9_007_199_254_740_993;

#[test]
fn depth_sweep_uses_price_priority_limits_gaps_and_exact_notional() {
    let instrument = Instrument::new("NASDAQ", "NVDA").unwrap();
    let tape = DepthTape::parse(FIXTURE, &instrument).unwrap();
    let start = tape.checkpoints()[0];
    let sweep = |seconds, side, limit| tape.sweep(start + seconds, side, 5_000_000, limit).unwrap();
    let before = sweep(2, PaperSide::Buy, None);
    assert_eq!(before.received.unwrap().sequence, N);
    assert_eq!(before.execution.unwrap().notional, 501_250_000_000_000);
    let after = sweep(3, PaperSide::Buy, Some(100_250_000))
        .execution
        .unwrap();
    assert_eq!((after.filled, after.remaining), (3_250_000, 1_750_000));
    assert_eq!(after.notional, 325_812_500_000_000);
    assert_eq!(after.mean_price, Some(100_250_000));
    let blocked = sweep(3, PaperSide::Buy, Some(100_249_999))
        .execution
        .unwrap();
    assert_eq!(blocked.filled, 0);
    assert_eq!(blocked.notional, 0);
    assert_eq!(blocked.mean_price, None);
    let sell = sweep(3, PaperSide::Sell, Some(98_500_000))
        .execution
        .unwrap();
    assert_eq!(
        sell.fills,
        [
            DepthLevel {
                price: 99_500_000,
                size: 4_000_000
            },
            DepthLevel {
                price: 98_500_000,
                size: 1_000_000
            },
        ]
    );
    assert_eq!(sell.mean_price, Some(99_300_000));
    let gap = sweep(5, PaperSide::Buy, None);
    assert_eq!(
        gap.status,
        DepthStatus::SequenceGap {
            expected: N + 2,
            received: N + 3
        }
    );
    assert!(gap.execution.is_none());
    let recovered = sweep(9, PaperSide::Buy, None);
    assert_eq!(recovered.received.unwrap().sequence, N + 8);
    assert_eq!(recovered.execution.unwrap().notional, -8_000_000_000_000);
    assert!(sweep(10, PaperSide::Buy, None).execution.is_none());
    assert_eq!(sweep(12, PaperSide::Buy, None).execution.unwrap().filled, 0);
    assert_eq!(
        sweep(3, PaperSide::Buy, Some(100_250_000)).execution,
        Some(after)
    );
    assert!(tape.sweep(start, PaperSide::Buy, 0, None).is_err());
}

#[test]
fn sweep_rounds_the_signed_weighted_price_once() {
    let instrument = Instrument::new("NASDAQ", "NVDA").unwrap();
    let csv = concat!(
        "instrument,event_at,observed_at,sequence,kind,side,price,size\n",
        "NASDAQ:NVDA,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,1,snapshot,ask,-5.000001,1\n",
        "NASDAQ:NVDA,2025-06-02T14:00:00Z,2025-06-02T14:00:00Z,1,snapshot,ask,-5,2000000000\n",
    );
    let tape = DepthTape::parse(csv, &instrument).unwrap();
    let at = tape.checkpoints()[0];
    let equal = tape
        .sweep(at, PaperSide::Buy, 2_000_000, None)
        .unwrap()
        .execution
        .unwrap();
    assert_eq!(equal.notional, -10_000_001_000_000);
    assert_eq!(equal.mean_price, Some(-5_000_001));
    let large = tape
        .sweep(at, PaperSide::Buy, 2_000_000_000_000_000, None)
        .unwrap()
        .execution
        .unwrap();
    assert_eq!(large.notional, -10_000_000_000_000_001_000_000);
    assert_eq!(large.mean_price, Some(-5_000_000));
}

#[test]
fn exact_levels_follow_the_inclusive_observation_prefix_and_recover_at_a_snapshot() {
    let instrument = Instrument::new("NASDAQ", "NVDA").unwrap();
    let tape = DepthTape::parse(FIXTURE, &instrument).unwrap();
    let checkpoints = tape.checkpoints();
    let start = checkpoints[0];
    let state = |seconds| tape.as_of(start + seconds).unwrap();
    assert_eq!(
        checkpoints.iter().map(|at| at - start).collect::<Vec<_>>(),
        [0, 2, 3, 5, 6, 9, 10, 11, 12]
    );

    assert_eq!(state(-1).status, DepthStatus::NoObservation);
    assert_eq!(state(0).status, DepthStatus::AwaitingSnapshot);
    assert_eq!(state(1).received.unwrap().sequence, N - 2);
    let full = state(2);
    assert_eq!(full.status, DepthStatus::Synchronized);
    assert_eq!(full.snapshot.unwrap().sequence, N);
    assert_eq!(
        full.bids,
        [
            DepthLevel {
                price: 99_125_000,
                size: 10_000_001
            },
            DepthLevel {
                price: 98_500_000,
                size: 2_000_000
            },
        ]
    );
    assert_eq!(
        full.asks[0],
        DepthLevel {
            price: 100_250_000,
            size: 12_000_000
        }
    );

    let updated = state(3);
    assert_eq!(updated.received.unwrap().event_at, start);
    assert_eq!(updated.received.unwrap().observed_at, start + 3);
    assert_eq!(
        updated.bids,
        [
            DepthLevel {
                price: 99_500_000,
                size: 4_000_000
            },
            DepthLevel {
                price: 98_500_000,
                size: 2_000_000
            },
        ]
    );
    assert_eq!(updated.asks[0].size, 3_250_000);
    assert_eq!(state(4), updated);
    let gap = DepthStatus::SequenceGap {
        expected: N + 2,
        received: N + 3,
    };
    for time in 5..=8 {
        let view = state(time);
        assert_eq!(view.status, gap);
        assert!(view.bids.is_empty() && view.asks.is_empty());
    }
    assert_eq!(state(6).received.unwrap().sequence, N + 4);

    let recovered = state(9);
    assert_eq!(recovered.status, DepthStatus::Synchronized);
    assert_eq!(recovered.snapshot.unwrap().sequence, N + 7);
    assert_eq!(recovered.received.unwrap().sequence, N + 8);
    assert_eq!(
        recovered.bids,
        [DepthLevel {
            price: -4_000_000,
            size: 1
        }]
    );
    assert_eq!(
        recovered.asks,
        [DepthLevel {
            price: -4_000_000,
            size: 2_000_000
        }]
    );
    for time in [10, 11] {
        assert_eq!(state(time).status, DepthStatus::Crossed { sequence: N + 9 });
        assert!(state(time).bids.is_empty());
    }
    let empty = state(12);
    assert_eq!(empty.status, DepthStatus::Synchronized);
    assert!(empty.bids.is_empty() && empty.asks.is_empty());
    assert_eq!(state(2), full);
    assert!(tape.as_of(i64::MAX).is_err());
}

#[test]
fn recorded_depth_rejects_broken_packet_boundaries_and_malformed_rows() {
    let instrument = Instrument::new("NASDAQ", "NVDA").unwrap();
    for (old, new, expected) in [
        ("NVDA", "MSFT", "Instrument"),
        (
            ",snapshot,bid,98.5,2",
            ",snapshot,bid,99.125,2",
            "each side and price once",
        ),
        (",snapshot,bid,98.5,2", ",snapshot,,,", "one row"),
        (
            ",snapshot,bid,98.5,2",
            ",update,bid,98.5,2",
            "share both timestamps",
        ),
        (
            ",snapshot,bid,98.5,2",
            ",snapshot,bid,98.5,0",
            "positive snapshot",
        ),
        (
            ",update,bid,99.125,0",
            ",update,bid,99.125,-1",
            "nonnegative",
        ),
        (
            ",update,ask,100.25,3.25",
            ",update,ask,100.25,3.0000001",
            "fractional digits",
        ),
        (
            "14:00:04Z,2025-06-02T14:00:05Z",
            "14:00:05Z,2025-06-02T14:00:04Z",
            "precedes",
        ),
        ("9007199254740996", "9007199254740980", "must increase"),
        (
            "9007199254740993,snapshot,bid,98.5,2",
            "9007199254740993,snapshot,bid,98.5,2,extra",
            "eight fields",
        ),
    ] {
        let malformed = FIXTURE.replace(old, new);
        assert_ne!(malformed, FIXTURE);
        let message = DepthTape::parse(&malformed, &instrument).err().unwrap();
        assert!(message.contains(expected), "{message}");
    }
}
