use marketweft_core::{
    DepthStatus, Instrument, PaperAction, PaperConfig, PaperDepthReplay, PaperOrderStatus,
};

const CONTROLS: &str = include_str!("fixtures/synthetic-paper-depth-controls.csv");
const DEPTH: &str = include_str!("fixtures/synthetic-paper-depth-liquidity.csv");
const START: i64 = 1_748_872_800;

fn config() -> PaperConfig {
    PaperConfig {
        starting_cash: 1_000_000_000,
        max_committed_cost: 1_200_000_000,
        max_position_shares: 10,
        fee_per_share: 100_000,
        fee_per_order: 2_000_000,
    }
}

#[test]
fn paper_depth_matches_later_quotes_once_and_keeps_order_priority_and_controls() {
    let instrument = Instrument::new("NASDAQ", "NVDA").unwrap();
    let replay = PaperDepthReplay::parse(CONTROLS, DEPTH, &instrument).unwrap();
    assert_eq!(
        replay.cutoffs(),
        [0, 2, 3, 4, 5, 6, 7, 8, 9].map(|seconds| START + seconds)
    );
    let query = |seconds| replay.account_at(config(), START + seconds).unwrap();
    let opening = query(0);
    assert_eq!(opening.ledger.history().len(), 2);
    assert_eq!(opening.ledger.cash(), 1_000_000_000);
    let first = query(2);
    assert_eq!(first.ledger.cash(), 799_800_000);
    assert_eq!(first.ledger.reserved_cash(), 303_300_000);
    assert_eq!(first.ledger.orders()["A"].remaining, 2);
    assert_eq!(first.ledger.orders()["B"].remaining, 1);
    assert_eq!(query(3).ledger.history(), first.ledger.history());

    let expanded = query(4);
    assert_eq!(expanded.ledger.cash(), 599_600_000);
    assert_eq!(expanded.ledger.positions()["NASDAQ:NVDA"].shares, 4);
    assert_eq!(
        expanded
            .ledger
            .history()
            .iter()
            .filter_map(|(event, receipt)| {
                match &event.action {
                    PaperAction::Fill {
                        order_id,
                        price_at,
                        shares,
                        price,
                        source_id,
                    } => {
                        assert_eq!(*price, 99_000_000);
                        assert!(receipt.rejection.is_none());
                        Some((
                            order_id.as_str(),
                            *price_at - START,
                            *shares,
                            source_id.as_str(),
                        ))
                    }
                    _ => None,
                }
            })
            .collect::<Vec<_>>(),
        [
            ("B", 1, 2, "DEPTH-9007199254740994-1"),
            ("B", 3, 1, "DEPTH-9007199254740996-1"),
            ("A", 3, 1, "DEPTH-9007199254740996-1"),
        ]
    );
    let gap = query(6);
    assert_eq!(
        gap.status,
        DepthStatus::SequenceGap {
            expected: 9007199254740997,
            received: 9007199254740998
        }
    );
    assert_eq!(gap.received.unwrap().sequence, 9007199254740999);
    assert_eq!(gap.ledger.cash(), expanded.ledger.cash());

    let recovered = query(7);
    assert_eq!(recovered.status, DepthStatus::Synchronized);
    assert_eq!(recovered.ledger.cash(), 697_500_000);
    assert_eq!(recovered.ledger.positions()["NASDAQ:NVDA"].shares, 3);
    assert_eq!(
        recovered.ledger.positions()["NASDAQ:NVDA"].cost,
        300_300_000
    );
    assert_eq!(recovered.ledger.realized(), -2_200_000);
    let canceled = query(8);
    assert_eq!(
        canceled.ledger.orders()["A"].status,
        PaperOrderStatus::Canceled
    );
    assert_eq!(canceled.ledger.cash(), recovered.ledger.cash());
    let halted = query(9);
    assert!(halted.ledger.halted());
    assert_eq!(
        halted.ledger.orders()["SELL"].status,
        PaperOrderStatus::Canceled
    );
    assert_eq!(
        halted.ledger.orders()["SELL-B"].status,
        PaperOrderStatus::Canceled
    );
    assert_eq!(halted.ledger.cash(), recovered.ledger.cash());
    assert_eq!(query(2).ledger.history(), first.ledger.history());
}

#[test]
fn depth_paper_controls_cannot_supply_ambiguous_receipts_or_external_fills() {
    let instrument = Instrument::new("NASDAQ", "NVDA").unwrap();
    let mixed = CONTROLS.replace("NASDAQ:NVDA", "NASDAQ:MSFT");
    assert!(PaperDepthReplay::parse(&mixed, DEPTH, &instrument).is_err());
    let reserved = CONTROLS.replace("ORDER-A", "DEPTH-F-123-1");
    assert!(PaperDepthReplay::parse(&reserved, DEPTH, &instrument).is_err());
    let fills =
        format!("{CONTROLS}EXTERNAL,2025-06-02T14:00:10Z,fill,A,,,1,99,EXT,2025-06-02T14:00:01Z\n");
    assert!(PaperDepthReplay::parse(&fills, DEPTH, &instrument).is_err());
}
