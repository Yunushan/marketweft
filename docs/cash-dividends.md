# Point-in-time cash dividend replay

Open **Historical replay → Start dividend demo**. The synthetic portfolio supplies 100 entitled shares per distribution. **Dividend ledger** tracks gross receivables, simulated cash and each signed posting in its declared currency. Use **Next event** and **Previous event** to examine the ledger at each observation time. The chart continues to show its raw or split-adjusted prices.

| Cutoff in UTC | USD receivable | USD cash | EUR cash | Observation |
| --- | ---: | ---: | ---: | --- |
| June 2, 2025 at 14:05 | 0.00 | 0.00 | 0.00 | The initial USD 0.25 per-share report becomes visible. |
| June 3 at 14:00 | 25.00 | 0.00 | 0.00 | The ex-date establishes a receivable. |
| June 3 at 15:00 | 30.00 | 0.00 | 0.00 | A revised amount is observed. |
| June 3 at 15:30 | 30.00 | 0.00 | 0.00 | The pay date moves from June 4 at 12:00 to 14:00. |
| June 4 at 12:00 | 30.00 | 0.00 | 0.00 | The superseded USD pay time has no posting. The EUR report is still unknown. |
| June 4 at 13:30 | 30.00 | 0.00 | 10.00 | The EUR report arrives after its own ex and pay times. The credit posts now. |
| June 4 at 14:00 | 0.00 | 30.00 | 10.00 | Payment clears the USD receivable and adds cash. |
| June 4 at 15:00 | 0.00 | 28.00 | 10.00 | A later amount correction posts a USD 2.00 debit. |

The ledger starts at zero and includes only dividend movements from the input. Corporate events can occur before or after the supplied market sessions. A posting after the last session leaves the revealed bar count unchanged. [Fixture reports](../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [Session calendar](../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [Synthetic OHLCV](../crates/core/tests/fixtures/synthetic-split-ohlcv.csv).

## Replay your own dividend reports

Import your historical candle file and select its instrument and session calendar. Upload **Cash dividends CSV (optional)**. Supply **Entitled shares per distribution** for a fixed scenario, or upload **Dividend positions CSV (optional)** to resolve each entitlement from dated positions. The model leaves withholding, broker settlement, due bills, reinvestment and FX to later work. [Investor.gov explanation of ex-dividend and payable dates](https://www.investor.gov/introduction-investing/investing-basics/glossary/ex-dividend-dates-when-are-you-entitled-stock-and) · [FINRA treatment of distributions and exceptions](https://www.finra.org/rules-guidance/notices/24-04).

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

- Supply one canonical instrument ID. Each distribution ID uses 1–40 ASCII letters, digits, periods, underscores or hyphens. Keep the ID stable if a report changes the amount, dates or currency.
- Resolve announcement, ex-date, pay date and observation to exact UTC timestamps ending in Z. Observation can follow pay time but cannot precede announcement. The supported ordinary schedule requires pay time at or after the ex time.
- Use a three-letter uppercase currency code and a nonnegative amount per share with up to six decimal places. A zero amount cancels the modeled entitlement at that observation. Up to 1,000 reports may fit in a 1 MiB UTF-8 file. Keep up to 1,000,000 whole shares in the run input.
- The ZIP provides `cash-dividends.csv`. Import `split-ohlcv.csv` under `DEMO:DIVIDEND` and use `split-sessions.csv`, a 600-second interval and 100 shares to reconstruct the demo through the file-import path.

## Entitlement from dated positions

Open **Historical replay → Start dividend entitlement demo** to use different quantities for each distribution. Each position row supplies the total whole shares held from its effective timestamp, as known at its observation timestamp. A later observation at the same effective timestamp revises that total. The position observation time must be at or after its effective time.

```csv
instrument,effective_at,observed_at,shares
DEMO:DIVIDEND,2025-06-03T13:55:00Z,2025-06-03T13:56:00Z,100
DEMO:DIVIDEND,2025-06-03T13:55:00Z,2025-06-03T14:40:00Z,120
```

At the ex-date, choose the latest effective position **strictly before** the ex timestamp among position revisions observed by the replay cutoff. A position change at the ex timestamp can apply to later distributions. Before the ex date the entitlement is pending. Without a qualifying position report it is unavailable. An explicit zero reports a known quantity of zero. Holdings changes after the ex cutoff leave that distribution's entitlement intact. Late evidence about a position effective before the ex cutoff adjusts the entitlement when that evidence arrives, including after pay. A revised ex-date selects again from the holdings known at the correction.

In the demo, the ALPHA ex-date assigns 100 shares and 25 USD receivable. Late evidence raises it to 120 shares and adds 5 USD at 14:40 on June 3. The later amount revision makes the receivable 36 USD. BETA uses 40 shares and records 4 EUR. The revised ALPHA pay date posts 36 USD. A late correction to 110 shares at 14:30 on June 4 reverses 3 USD, and the final rate revision leaves 30.80 USD cash.

Supply 0–1,000,000 whole shares per observation and up to 5,000 position rows in 1 MiB. A header-only file preserves an unknown position history. Use one canonical instrument and unique observation times for each effective timestamp. Very large reports can be narrowed after two million entitlement checks or 50,000 ledger events. The input may be derived from authorized trade and split records. The replay expects those holdings as evidence. [Position fixture](../crates/core/tests/fixtures/synthetic-dividend-positions.csv).

## Accounting and revisions

At each inclusive cutoff use the latest observed report per ID. Gross value equals the entitled shares multiplied by the per-share amount in integer millionths. From ex time until pay time it is a receivable. From pay time onward it is cash. Reports arriving after pay time adjust cash at their observation time.

Each new target creates only the difference from the previous target. A later revision can change the pending amount, reverse a prior cash posting or rebook it under another currency. The original posting remains visible at its original observation. A revision at the exact time of an older scheduled transition supersedes that transition. All dividend changes at the same UTC second apply before market events at that second. Currencies remain separate throughout. The Rust engine calculates exact amounts and currency balances. The browser preserves them as BigInt through display.

The current replay keeps dividend files and entitlement assumptions in the open view. Reproduce a run by retaining the exact source candles, calendar, action files, interval, share input and application revision. The workspace retains its original candle data and backup format. [Stock split replay](corporate-actions.md) · [Session-aware replay](historical-replay.md).
