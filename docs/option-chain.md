# Point-in-time option chain

Open **Historical replay → Open option chain → Start option demo**. Change **Effective time (UTC)** and **Known time (UTC)** independently, then run the query. **Maximum quote age (seconds)** defaults to 300 and applies to both inputs. Expand **Implied volatility surface** for observed call and put points by strike and expiry. Cells show unavailable points explicitly and use stronger color for higher modeled IV. The view displays sparse observed points without interpolation.

The fixture uses April 3, 2025 UTC and one synthetic USD underlying.

| Effective UTC | Known UTC | Selected observations |
| --- | --- | --- |
| 14:00 | 14:00 | The 13:59 underlying is USD 100. The April 100-strike call and put yield about 20% IV. The October pair yields about 23% IV. |
| 14:00 | 14:02 | The delayed April 90-strike call appears with about 25% IV. |
| 14:00 | 14:03 | The 14:00 underlying report is now known at USD 100.50. The same option midpoints produce different modeled IV and Greeks. |
| 14:00 | 14:04 | A correction replaces the crossed April 110-strike put spread. |
| 14:00 | 14:05 | The 14:01 underlying is known and remains outside the effective cutoff. |
| 14:01 | 14:05 | The 14:01 underlying becomes eligible at USD 101. |

The fixture also includes a one-sided quote, a stale quote and a midpoint above the European price bound. Each remains visible with a reason in its analytics cells.

## Input

Upload **Underlying CSV** and **Option quotes CSV** with one matching canonical instrument and three-letter uppercase currency. Each UTF-8 file accepts up to 20,000 rows and 2 MiB. Supply positive spot and strike, nonnegative bid and ask, and rates as annual fractions. A blank bid or ask remains missing. Times are exact UTC seconds. An observation must be at or after its quote time. Contract IDs keep their strike, expiry, side and exercise style. An observation of the same quote time with a new observation timestamp can revise it. Duplicate quote and observation times within a series fail validation. [Underlying sample](../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [European option sample](../crates/core/tests/fixtures/synthetic-option-quotes.csv).

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

The snapshot uses the latest effective quote known for each contract and for the underlying. Both cutoffs are inclusive. A newer observation of an earlier price time leaves a later eligible price time selected. The view flags staleness from effective time minus source quote time and excludes unpublished contract identities until an eligible quote appears.

## Model and checks

The engine solves the Black–Scholes–Merton European price with a continuous yield and continuous rate against the exact two-sided bid–ask midpoint. It uses UTC seconds divided by 365 days for time to expiry. The per-query input rate and yield are flat across expiries. The implementation covers time to expiry from one second through 10 model years, annual interest rate from −1 to 1, annual yield from 0 to 1, and searched volatility from zero to 10. Boundary prices without a resolved positive IV and inputs outside this domain return explicit statuses. Discrete dividends, fitted surfaces and live or executable prices remain separate work. [Original Black–Scholes paper](https://doi.org/10.1086/260062) · [Merton's option pricing paper](https://ideas.repec.org/a/rje/bellje/v4y1973ispringp141-183.html).

The code prices the out-of-the-money side first and uses European put–call parity to recover the other side. It evaluates the Gaussian CDF with a near-origin series and a continued fraction in the tails. IV is a bracketed solve. Native tests compare independent golden prices, parity, inversion and finite differences for Delta, Gamma, Vega, Theta and Rho. Vega and Rho are per percentage point and Theta is per elapsed calendar day. [NIST error function definitions](https://dlmf.nist.gov/7.2).

## American exercise pricing

Use the original header for a European-only file. Insert `exercise_style` immediately after `side` for a mixed file and use `european` or `american` on each row. The **American exercise pricing** panel appears when an American contract is visible at both applied cutoffs. Select a contract, enter annual volatility as a percentage and choose 1–256 lattice steps. The calculation uses the visible underlying spot, rate and continuous yield.

The recombining Cox–Ross–Rubinstein lattice steps backward from expiry and compares immediate exercise with discounted continuation at each node. Zero volatility evaluates the exercise dates along a deterministic forward path. A positive-volatility grid with a risk-neutral probability outside the valid range reports a model-range status. [Cox, Ross and Rubinstein's original lattice paper](https://www.sciencedirect.com/science/article/pii/0304405X79900151).

The demo's American call becomes visible at 14:02 UTC. With 25% annual volatility and 128 steps, its model price is USD 16.247756. The underlying revision at 14:03 UTC changes it to USD 16.614676. Choose **Late option quote** to restore the earlier underlying and price the same contract again. The adjacent European contracts retain their quote-derived IV and Greeks. [Mixed option sample](../crates/core/tests/fixtures/synthetic-option-exercise-quotes.csv).

## American implied volatility

Choose **Solve midpoint IV** for a selected American contract and lattice size. The solve uses the observed two-sided midpoint, the underlying snapshot and both applied UTC cutoffs. The manual volatility field is used for **Price American option**. Expired, stale, missing or crossed inputs produce a status. A midpoint at the flat immediate-exercise boundary leaves volatility unresolved.

At 128 steps, the demo call's midpoint is USD 16.234568. The implied volatility is 24.96% at 14:02 UTC and 23.82% after the 14:03 UTC underlying update. The model reproduces the same midpoint at both volatilities.
