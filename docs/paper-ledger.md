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

## Match paper orders against recorded depth

Choose **Start paper depth demo** in Paper ledger or upload a paper controls CSV and a [normalized depth CSV](recorded-depth.md) for one instrument. The controls use the standard event format with `submit`, `cancel` and `halt`. The matcher generates its own fills and reserves the `DEPTH-F-` event ID prefix for their receipts.

Each synchronized frame offers the positive-price levels it reports, with fills limited to whole shares. The price event must be strictly later than the order submission. At the same observation time, controls apply before the depth frames. Asks are considered from low to high and bids from high to low. At a price level, the more aggressive limits take priority. Equal limits use control file order. The limit is inclusive.

All simulated orders share the liquidity at each level. A replacement size carries forward the consumed quantity, capped at the replacement size. A deletion clears it, and a full snapshot starts fresh. An unchanged update supplies only its previously unconsumed size. A sequence gap or crossed frame pauses matching until a fresh full snapshot. Fees, cash reservations, order status and cost are calculated by the paper account.

| Observation UTC | Result |
| --- | --- |
| 14:00:00 | Two buy orders reserve cash. The same-time snapshot supplies no fills. |
| 14:00:02 | B’s higher limit takes two shares at 99, leaving cash of 799.8 and reserves of 303.3. |
| 14:00:03 | The repeated size leaves the prior account and receipts unchanged. |
| 14:00:04 | The higher reported size supplies one additional share to B and one to A. Cash is 599.6. |
| 14:00:05–06 | The sequence gap pauses fills while the sell order remains open. |
| 14:00:07 | The recovered snapshot fills one sell share at 100. Cash is 697.5, and realized profit and loss is −2.2. |
| 14:00:08–09 | A cancellation and then the halt apply before their same-time depth updates. Three shares remain and all reserves are released. |

**Download paper depth receipts** includes both filenames, the observation cutoff, account settings, status and capture sequence. Each fill source identifies its depth sequence and level index. Rewind to 14:00:02 UTC to reproduce the first fill CSV. [Synthetic controls](../crates/core/tests/fixtures/synthetic-paper-depth-controls.csv) · [Synthetic depth](../crates/core/tests/fixtures/synthetic-paper-depth-liquidity.csv)
