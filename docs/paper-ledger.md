# Paper cash and fill ledger

Open **Historical replay → Open paper ledger → Start paper demo**. Step the observation clock or enter a UTC cutoff to reconstruct the account. Use **Final account** to see cash, orders, positions and receipts after the halt. Configurable starting cash, risk limits and fees are applied to the entire replay.

| Observed UTC | Result |
| --- | --- |
| 14:00 | The open limit order reserves 503 out of a 1,000 cash balance. Available cash is 497. |
| 14:01 | A fill using a price from the submission instant is rejected. Cash stays 1,000. |
| 14:02 | Four shares fill at 49 with a 2.4 fee. Cash is 801.6 and reserves are 300.6. Repeated identical evidence yields one receipt. |
| 14:03 | Six shares fill at 50 with a 0.6 fee. Cash is 501 and the buy order is fully filled. |
| 14:05 | The sale of three shares at 55 leaves cash of 663.7 and realized profit of 13. |
| 14:06 | A later pending buy reserves 122.4. |
| 14:07 | Halting cancels the pending order and releases the reserve. The later fill is rejected. |

Times are from the synthetic April 3, 2025 fixture. Rewinding reconstructs the earlier state and only exposes receipts known then. Load the packaged `paper-events.csv` to reproduce these steps. [Event fixture](../crates/core/tests/fixtures/synthetic-paper-events.csv).

## Event report

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

- Use UTF-8, exact UTC timestamps, stable event and order IDs and at most 20,000 rows and 2 MiB. Use whole shares and six-place decimal prices in the ledger's common currency unit.
- `submit` sets a limit price, side, instrument and initial quantity. `fill` supplies order ID, quantity, execution price, price source ID and that source's effective time. `cancel` supplies the order ID. `halt` takes no additional fields.
- New events must arrive in observation order. Earlier identical events can be replayed safely. Conflicting IDs fail validation. Repeated fill sources for the same order and fills larger than the remaining position are rejected.
- A fill must respect its limit and use a price dated strictly after submission and no later than its own observation time. A halt cancels all working orders and stays in effect for the remainder of the replay.

## Accounting and risk rules

The engine uses integer millionths. It reserves cash for remaining buy shares at the limit price plus fees, and reserves held shares for open sells. Position limits count held and pending buy shares. The committed cost cap includes inventory cost and outstanding buy reservations. The ledger applies the per-share fee to each fill and charges the flat order fee only on the first fill. A sale retires inventory at weighted average cost and keeps residual cost ticks on the remaining position. Realized profit and loss equals net proceeds minus retired cost. Working buys cannot consume the cash reserved by another order.

The account is an isolated, long-only simulation from local event evidence. Each receipt records application or rejection and all financial deltas. The ledger does not infer liquidity from a supplied price. Order matching, strategy timing, slippage, corporate action proceeds and live routing remain separately tracked. [Architecture decision](adr/0013-paper-ledger.md).
