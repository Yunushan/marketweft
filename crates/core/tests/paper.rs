use marketweft_core::{parse_paper_config, PaperReplay};
use marketweft_core::{
    Instrument, PaperAccount, PaperAction, PaperApply, PaperConfig, PaperError, PaperEvent,
    PaperOrderStatus, PaperPosition, PaperReceipt, PaperRejection, PaperSide, SCALE,
};

fn amount(units: i64) -> i128 {
    i128::from(units * SCALE)
}
fn config() -> PaperConfig {
    PaperConfig {
        starting_cash: amount(1000),
        max_position_shares: 10,
        max_committed_cost: amount(1200),
        fee_per_share: SCALE / 10,
        fee_per_order: 2 * SCALE,
    }
}
fn event(id: &str, observed_at: i64, action: PaperAction) -> PaperEvent {
    PaperEvent {
        id: id.into(),
        observed_at,
        action,
    }
}
fn order(order_id: &str, symbol: &str, side: PaperSide, shares: u64, limit: i64) -> PaperAction {
    PaperAction::Submit {
        order_id: order_id.into(),
        instrument: Instrument::new("DEMO", symbol).unwrap(),
        side,
        shares,
        limit: limit * SCALE,
    }
}
fn fill(order_id: &str, source_id: &str, price_at: i64, shares: u64, price: i64) -> PaperAction {
    PaperAction::Fill {
        order_id: order_id.into(),
        source_id: source_id.into(),
        price_at,
        shares,
        price: price * SCALE,
    }
}
fn apply(account: &mut PaperAccount, event: PaperEvent) -> PaperReceipt {
    let PaperApply::Applied(receipt) = account.apply(event).unwrap() else {
        panic!("expected a new event")
    };
    receipt
}
fn rejected(account: &mut PaperAccount, event: PaperEvent, reason: PaperRejection) {
    let before = (
        account.cash(),
        account.reserved_cash(),
        account.committed_cost(),
        account.realized(),
    );
    let receipt = apply(account, event);
    assert_eq!(receipt.rejection, Some(reason));
    assert_eq!(
        (receipt.cash_delta, receipt.fee, receipt.realized_delta),
        (0, 0, 0)
    );
    assert_eq!(
        (
            account.cash(),
            account.reserved_cash(),
            account.committed_cost(),
            account.realized()
        ),
        before
    );
}

#[test]
fn reserves_cash_accounts_for_partial_fills_once_and_reconciles_realized_pnl() {
    let mut ledger = PaperAccount::new(config()).unwrap();
    let buy = event("E1", 10, order("BUY", "AAA", PaperSide::Buy, 10, 50));
    assert_eq!(apply(&mut ledger, buy).rejection, None);
    assert_eq!(ledger.reserved_cash(), amount(503));
    assert_eq!(ledger.available_cash(), amount(497));

    let partial = event("E2", 12, fill("BUY", "Q1", 11, 4, 49));
    let receipt = apply(&mut ledger, partial.clone());
    assert_eq!(receipt.fee, 2_400_000);
    assert_eq!(receipt.cash_delta, -198_400_000);
    assert_eq!(ledger.cash(), 801_600_000);
    assert_eq!(ledger.reserved_cash(), 300_600_000);
    assert_eq!(ledger.available_cash(), amount(501));
    assert_eq!(ledger.committed_cost(), amount(499));
    assert_eq!(
        ledger.orders()["BUY"].status,
        PaperOrderStatus::PartiallyFilled
    );
    assert_eq!(
        ledger.positions()["DEMO:AAA"],
        PaperPosition {
            shares: 4,
            cost: 198_400_000
        }
    );
    assert_eq!(
        ledger.apply(partial.clone()),
        Ok(PaperApply::Duplicate(receipt))
    );
    assert_eq!(ledger.history().len(), 2);
    assert_eq!(
        ledger.apply(event("E2", 12, fill("BUY", "Q1", 11, 5, 49))),
        Err(PaperError::ConflictingEventId)
    );
    rejected(
        &mut ledger,
        event("COPY", 12, fill("BUY", "Q1", 11, 4, 49)),
        PaperRejection::RepeatedFillSource,
    );

    let receipt = apply(&mut ledger, event("E3", 13, fill("BUY", "Q2", 13, 6, 50)));
    assert_eq!(receipt.fee, 600_000);
    assert_eq!(ledger.reserved_cash(), 0);
    assert_eq!(ledger.cash(), amount(501));
    assert_eq!(
        ledger.positions()["DEMO:AAA"],
        PaperPosition {
            shares: 10,
            cost: amount(499)
        }
    );
    assert_eq!(ledger.orders()["BUY"].status, PaperOrderStatus::Filled);
    assert_eq!(
        apply(
            &mut ledger,
            event("E4", 15, order("SELL", "AAA", PaperSide::Sell, 3, 55))
        )
        .rejection,
        None
    );
    let receipt = apply(&mut ledger, event("E5", 16, fill("SELL", "Q3", 16, 3, 55)));
    assert_eq!(receipt.fee, 2_300_000);
    assert_eq!(receipt.cash_delta, 162_700_000);
    assert_eq!(
        ledger.positions()["DEMO:AAA"],
        PaperPosition {
            shares: 7,
            cost: 349_300_000
        }
    );
    assert_eq!(ledger.realized(), amount(13));
    assert_eq!(
        ledger.cash() + ledger.positions()["DEMO:AAA"].cost,
        amount(1013)
    );
    assert!(matches!(
        ledger.apply(partial),
        Ok(PaperApply::Duplicate(_))
    ));
}

#[test]
fn position_and_cost_limits_cancel_and_halt_release_reservations_without_executing() {
    let mut ledger = PaperAccount::new(PaperConfig {
        max_committed_cost: amount(650),
        ..config()
    })
    .unwrap();
    assert_eq!(
        apply(
            &mut ledger,
            event("OPEN", 1, order("BUY", "AAA", PaperSide::Buy, 10, 50))
        )
        .rejection,
        None
    );
    rejected(
        &mut ledger,
        event("POSITION", 2, order("OVER", "AAA", PaperSide::Buy, 1, 50)),
        PaperRejection::PositionLimit,
    );
    rejected(
        &mut ledger,
        event("COST", 2, order("GROSS", "BBB", PaperSide::Buy, 5, 30)),
        PaperRejection::ExposureLimit,
    );
    rejected(
        &mut ledger,
        event("CASH", 2, order("CASH-O", "BBB", PaperSide::Buy, 10, 50)),
        PaperRejection::CashLimit,
    );
    rejected(
        &mut ledger,
        event("SHORT", 2, order("SHORT-O", "AAA", PaperSide::Sell, 1, 50)),
        PaperRejection::InsufficientShares,
    );
    rejected(
        &mut ledger,
        event("SAME-TIME", 2, fill("BUY", "OLD", 1, 1, 50)),
        PaperRejection::IneligiblePriceTime,
    );
    rejected(
        &mut ledger,
        event("FUTURE", 2, fill("BUY", "FUTURE-Q", 3, 1, 50)),
        PaperRejection::IneligiblePriceTime,
    );
    rejected(
        &mut ledger,
        event("LIMIT", 2, fill("BUY", "HIGH", 2, 1, 51)),
        PaperRejection::LimitPrice,
    );

    assert_eq!(
        apply(
            &mut ledger,
            event(
                "CANCEL",
                3,
                PaperAction::Cancel {
                    order_id: "BUY".into()
                }
            )
        )
        .rejection,
        None
    );
    assert_eq!(ledger.reserved_cash(), 0);
    assert_eq!(ledger.orders()["BUY"].status, PaperOrderStatus::Canceled);
    rejected(
        &mut ledger,
        event("LATE-FILL", 4, fill("BUY", "Q", 4, 1, 50)),
        PaperRejection::ClosedOrder,
    );
    assert_eq!(
        apply(
            &mut ledger,
            event("LIVE", 5, order("NEXT", "BBB", PaperSide::Buy, 5, 30))
        )
        .rejection,
        None
    );
    assert_eq!(
        apply(&mut ledger, event("STOP", 6, PaperAction::Halt)).rejection,
        None
    );
    assert!(ledger.halted());
    assert_eq!(ledger.reserved_cash(), 0);
    assert_eq!(ledger.orders()["NEXT"].status, PaperOrderStatus::Canceled);
    rejected(
        &mut ledger,
        event("AFTER-STOP", 7, order("NO", "AAA", PaperSide::Buy, 1, 10)),
        PaperRejection::AccountHalted,
    );
    rejected(
        &mut ledger,
        event("HALTED-FILL", 8, fill("NEXT", "Q", 8, 1, 30)),
        PaperRejection::AccountHalted,
    );
    assert_eq!(
        ledger.apply(event("BACK", 7, PaperAction::Halt)),
        Err(PaperError::OutOfOrder)
    );
    assert_eq!(ledger.cash(), amount(1000));
}

#[test]
fn reserves_long_share_quantities_and_keeps_fractional_cost_ticks_conserved() {
    let mut ledger = PaperAccount::new(PaperConfig {
        fee_per_share: 0,
        fee_per_order: 1,
        ..config()
    })
    .unwrap();
    apply(
        &mut ledger,
        event("OPEN", 1, order("BUY", "AAA", PaperSide::Buy, 3, 1)),
    );
    apply(&mut ledger, event("FILL", 2, fill("BUY", "Q1", 2, 3, 1)));
    assert_eq!(ledger.positions()["DEMO:AAA"].cost, 3_000_001);
    apply(
        &mut ledger,
        event("OUT", 3, order("SELL", "AAA", PaperSide::Sell, 2, 2)),
    );
    rejected(
        &mut ledger,
        event("OVER", 4, order("OVER", "AAA", PaperSide::Sell, 2, 2)),
        PaperRejection::InsufficientShares,
    );
    let receipt = apply(&mut ledger, event("SELL-1", 5, fill("SELL", "Q2", 5, 1, 2)));
    assert_eq!(receipt.realized_delta, 999_999);
    assert_eq!(ledger.positions()["DEMO:AAA"].cost, 2_000_001);
    let receipt = apply(&mut ledger, event("SELL-2", 6, fill("SELL", "Q3", 6, 1, 2)));
    assert_eq!(receipt.realized_delta, 1_000_000);
    apply(
        &mut ledger,
        event("REST", 7, order("REST", "AAA", PaperSide::Sell, 1, 2)),
    );
    let receipt = apply(&mut ledger, event("LAST", 8, fill("REST", "Q4", 8, 1, 2)));
    assert_eq!(receipt.realized_delta, 999_998);
    assert!(ledger.positions().is_empty());
    assert_eq!(ledger.cash(), config().starting_cash + ledger.realized());
    assert_eq!(ledger.realized(), 2_999_997);
}

#[test]
fn same_replay_prefix_produces_the_same_account_and_unique_receipts() {
    let source = include_str!("fixtures/synthetic-paper-events.csv");
    let demo = PaperReplay::parse(source).unwrap();
    let config = parse_paper_config("1000,10,1200,0.1,2").unwrap();
    let times = demo.cutoffs();
    assert_eq!(times.len(), 9);
    assert!(demo
        .account_at(config, times[0] - 1)
        .unwrap()
        .orders()
        .is_empty());
    let partial = demo.account_at(config, times[2]).unwrap();
    assert_eq!(partial.cash(), 801_600_000);
    assert_eq!(partial.history().len(), 3);
    assert_eq!(
        partial.history()[1].1.rejection,
        Some(PaperRejection::IneligiblePriceTime)
    );
    let end = demo.account_at(config, times[8]).unwrap();
    assert_eq!(end.cash(), 663_700_000);
    assert_eq!(end.realized(), amount(13));
    assert_eq!(end.reserved_cash(), 0);
    assert_eq!(end.orders()["PENDING"].status, PaperOrderStatus::Canceled);
    assert_eq!(
        end.history()[8].1.rejection,
        Some(PaperRejection::AccountHalted)
    );
    assert_eq!(
        demo.account_at(config, times[2]).unwrap().history(),
        partial.history()
    );
    assert_eq!(
        PaperReplay::parse(&source.replacen("4,49,Q1", "5,49,Q1", 1))
            .err()
            .as_deref(),
        Some("Paper line 5: An event ID has conflicting fields.")
    );
}
