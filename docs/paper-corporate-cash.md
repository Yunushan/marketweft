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
