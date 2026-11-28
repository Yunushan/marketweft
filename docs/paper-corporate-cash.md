# Corporate cash in paper replay

In Historical replay, open Universe replay and load the membership and prices. Expand **Cross-sectional paper replay** and load execution liquidity. Under **Corporate cash reports**, enable **Apply corporate cash and delistings**. Set the paper account currency to the currency used by the prices and starting cash. Upload the applicable reports and choose **Run ranking replay**.

Dividend reports use the listing-based CSV from [portfolio income](portfolio-replay.md). Delisting terms use the CSV from [delisting proceeds](delisting-proceeds.md). Listing IDs link both reports to the replayed positions. Enabling the workflow with membership alone identifies delisted holdings whose proceeds are unavailable.

## Cash recognition

A dividend uses the strategy's position immediately before the ex-time. A simulated fill changes ownership at its observation time. The replay credits the distribution when both the payment time and applicable report are visible. A later report posts the difference, or reverses the original amount and credits a new currency.

When the clock reaches a delisting that is both effective and known, the ledger cancels working orders and retires the shares it still holds at recognition. The resulting claim records the original event, entitled shares and latest known terms. Known proceeds stay receivable until the payment cutoff. Later terms can change or reverse cash already posted. If the membership report is canceled, the ledger restores the retired shares and their original cost basis and reverses any payment.

Only postings in the paper account currency change spendable cash. The report displays foreign amounts in their reported currencies. Account equity includes marked positions and same-currency delisting receivables. Missing delisting proceeds or an unavailable open-position mark leave account equity incomplete. The replay uses the currency you supply for marks and has no exchange-rate input.

**Download corporate cash** exports the two cutoffs, source filenames, effective and observed times, payment schedule, amount, cash movement and ledger receipt ID where the movement hit the paper account. **Download paper replay** includes the full order and cash receipt trail.

## Verify the offline sample

Open **Start corporate cash demo** in Universe replay. In Cross-sectional paper replay, choose **Use sample liquidity**, then **Use sample corporate reports**. Keep the default USD account and set the effective cutoff to 2025-06-02T14:06:00Z. Run the replay and change the knowledge time as follows.

| Known UTC | Account cash | Observed result |
| --- | ---: | --- |
| 14:04 | 536.6 | Two fills leave four A shares. The delisting report is still undisclosed. |
| 14:05 | 540.6 | Two pre-ex shares earn 4 USD. The four retired shares create a 500 USD receivable. |
| 14:06 | 1,040.6 | The account receives the 500 USD settlement. |
| 14:07 | 1,056.6 | Revised terms add 20 USD. The dividend revision reverses 4 USD and records 6 EUR. |
| 14:08 | 536.6 | The canceled delisting reverses 520 USD and restores four A shares at the original 463.4 cost basis. |

Rewind knowledge to 14:05 UTC to reproduce the earlier CSV. The packaged files also support the upload workflow after the terminal cache is ready.

## Successor share claims

Under **Corporate cash reports**, upload a **Paper successor share terms CSV**. The [portfolio successor CSV format](portfolio-replay.md#delisting-successor-shares-csv) identifies the delisting and successor by stable listing ID and contains dated exchange ratios and delivery terms. Paper replay uses the simulated holding immediately before the effective delisting, with fills recorded at observation time. A fill reported at the exact effective time falls outside the entitlement. The latest terms known at the cutoff supply the ratio and delivery status. An explicit zero ratio removes the stock value, and a canceled delisting removes the claim and restores the ordinary holding through the cash workflow.

Both receivable and delivered claims contribute to marked equity using the successor's exact close at the effective cutoff and its latest observation by the knowledge cutoff. Prices use the paper account currency. The engine applies the reduced share fraction and rounds each value once to the nearest millionth of that currency. An unavailable close makes equity incomplete. Supply a zero cash offer for a stock-only event to establish its cash component. Claims contribute to research equity only. The ordinary paper ledger supplies spendable cash, order inventory and position cost basis. Walk-forward scoring values the claims from each window's own fills and reports.

To verify the packaged example, load **Use sample corporate reports** and **Use sample successor share terms** before running the replay. The tables use the same limit fills as the corporate cash demo.

| Effective UTC | Known UTC | Successor claim | Equity in USD |
| --- | --- | --- | --- |
| 14:06 | 14:05 | No terms have been observed. | 1,040.6 |
| 14:05 | 14:05:30 | Four pre-delisting shares produce a receivable of 4/3 B shares, marked at 97.2. | 1,137.8 |
| 14:06 | 14:05:30 | The claim is delivered. The close for 14:06 has yet to be observed. | Incomplete |
| 14:06 | 14:06 | The delivered shares are marked at 97.2. | 1,137.8 |
| 14:06 | 14:07 | Revised terms make two B shares receivable again, marked at 145.8. | 1,202.4 |
| 14:06 | 14:07:30 | A zero ratio removes the stock value. | 1,056.6 |
| 14:06 | 14:08 | The delisting is canceled and the original four shares return. | 1,069 |

**Download paper successor shares** exports the exact fraction, both cutoffs, terms, entitlement time, close observation and value. Rewind to the first receivable to reproduce the earlier CSV. [Synthetic terms](../crates/core/tests/fixtures/synthetic-paper-successor-shares.csv)

## Paper successor delivery journal

Expand **Paper successor delivery journal** after running a ranking replay with successor terms. Each row shows the exact change and balance for the delisting and successor listing. It also identifies the accepted paper receipt that established the entire observed holding immediately before the delisting. Find that ID in **Cross-sectional paper receipts** or in **Download paper replay**. A fill observed at the effective delisting time falls outside the share entitlement.

The effective cutoff caps the delisting and delivery schedule, and the knowledge cutoff limits when the journal can post. Later terms can revise or reverse a previous delivery. The share claims table shows current entitlement and marked equity, and the journal traces the delivered balance history. [Portfolio delivery ledger](portfolio-replay.md#successor-delivery-ledger)

With the sample effective cutoff at 14:06 UTC, set knowledge to 14:05:30 UTC to see an empty journal. At known 14:06, the journal posts 4/3 shares of B and identifies the accepted fill that left four shares of A at 14:03. At known 14:07, a rescheduled delivery reverses 4/3 shares and leaves a zero delivered balance. The reversal references the same holding receipt. The 14:08 delisting cancellation restores the original paper position through the cash workflow.

**Download paper successor delivery journal** exports the source names, both cutoffs, evidence timestamps, receipt IDs, and exact numerators and denominators. Rewind knowledge to 14:06 to reproduce the first export.

## Paper capital returns

Upload a **Paper capital returns CSV** under **Corporate cash reports** using the [listing-based return-of-capital format](portfolio-capital-returns.md). Each report supplies an ex-time, pay time, observation time, currency and amount per share. A revision keeps the same listing and action ID and uses a later observation time. An amount of zero cancels the distribution.

The claim uses the accepted simulated holding immediately before the ex-time. **Position receipt** links to the ledger event that established that holding. The ex-time must be within both cutoffs. The latest visible report determines the claim's terms. A receivable in the account currency contributes to marked equity, and the amount becomes spendable when both cutoffs reach payment. A late correction produces a signed movement at its observation time. A currency change reverses the old amount and records the new amount separately. Foreign cash movements appear in their source currencies, with ledger receipts issued for movements in the account currency. Paper capital returns use gross cash and leave the acquisition cost used for paper execution at its recorded value. The [portfolio capital return workflow](portfolio-capital-returns.md) computes separately reported basis reductions. Walk-forward folds use their own accepted fills and report cutoffs.

Start the corporate cash demo, choose **Use sample liquidity**, **Use sample corporate reports**, and **Use sample capital returns**, then run the ranking replay. The sample fill at 14:03 UTC brings the holding to four shares. The 14:02 fill establishes the two shares that qualify.

| Effective UTC | Known UTC | Capital return | Spendable USD |
| --- | --- | --- | ---: |
| 14:06 | 14:02 | The claim has yet to reach ex-time. | — |
| 14:04 | 14:04 | Two shares earn a 5 USD receivable. Marked equity is 1,025.6 USD. | 536.6 |
| 14:06 | 14:06 | The account has received 5 USD. | 1,045.6 |
| 14:06 | 14:07 | The revision reverses 5 USD and records 6.000002 EUR. | 1,056.6 |
| 14:06 | 14:08 | Cancellation reverses 6.000002 EUR. | 536.6 |

**Download paper capital returns** exports the claims, movements, source filenames, cutoffs, settings and receipt IDs. Rewind both cutoffs to 14:04 to reproduce the first claim CSV. [Synthetic input](../crates/core/tests/fixtures/synthetic-paper-capital-returns.csv)
