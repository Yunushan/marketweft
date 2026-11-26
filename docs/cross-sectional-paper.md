# Cross-sectional paper replay

Open **Historical replay → Open universe replay** and load the membership and price reports. Expand **Cross-sectional paper replay** in Universe screen, then load an execution liquidity CSV. The **Start listing risk demo** workspace also offers **Use sample liquidity**.

Set the first decision in the replay form. The effective time in Universe replay is the last point on that UTC decision grid. The grid supports up to 512 decisions. The known time controls which decisions and observed executions appear. At each decision, the replay ranks members by return across the specified lookback using exact closes and information available at that decision. The decision table reports ranked and missing listings and the selected IDs. Each selected listing targets the same configured number of shares.

## Orders and fills

Each decision cancels pending orders and submits orders for the difference between the target and current shares when an exact close is available. Sells are submitted first. A listing removed from the universe can still be sold while it is listed and the necessary prices are available. The shared long-only paper account applies cash reserves, share and committed cost limits, and per-share and per-order fees. A limit buffer raises buy limits and lowers sell limits from the decision close.

The execution liquidity header is:

```csv
universe,listing_id,price_at,observed_at,sequence,price,shares
```

Use the same universe as the membership and price reports. Each row supplies an effective price time, observation time, unique positive unsigned 64-bit sequence, positive price and whole available shares. Time fields use UTC. A fill can use a row only after its observation, with a price time strictly later than order submission and within the effective cutoff. Order limits and the participation cap apply to fills. Participation is rounded down to whole shares. At each decision time, visible liquidity is processed before the new orders are submitted.

Use prices and cash on a common currency and adjustment basis. Ending equity is cash plus the value of open positions at exact closes. An unavailable mark, including for a delisted holding, leaves ending equity unavailable. Cash, reserved cash, fees, executed principal and known position values are still reported. Enable [corporate cash in paper replay](paper-corporate-cash.md) to retire delisted holdings, value their claims and post dated payments.

## Verify the offline sample

Start the listing risk demo and load the sample liquidity. Keep the default 60-second grid and lookback, one ranked listing, four target shares, and starting cash of 1,000. Use 2025-06-02T14:01:00Z as the first decision and 2025-06-02T14:06:00Z as the effective cutoff.

- At knowledge 14:01 UTC the replay shows one decision and one submitted order. Cash is 1,000, with 484.9 reserved and no fills.
- At knowledge 14:06 UTC it shows six decisions and two fills. Turnover is 462, fees are 1.4, cash is 536.6, and ending equity is 1,069 at the exact mark of 133.1.
- Moving knowledge to 14:07 UTC reveals a late close while preserving the prior decisions and receipts. Returning to 14:01 UTC reproduces the earlier download.

**Download paper replay** exports the source labels, cutoffs, settings, rankings, open positions and paper receipts. Each receipt includes its ledger outcome and any source liquidity ID. The packaged browser build includes the three synthetic reports and works offline once the terminal cache is ready.
