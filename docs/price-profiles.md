# Observed volume and time-price opportunity profiles

Open **Recorded footprint** on the chart workspace and load the selected instrument's trades. The [footprint import contract](recorded-footprint.md) also governs both profiles.

Set the execution window, observed cutoff, bracket interval and price increment. Apply **Query footprint**, then expand **Price profiles** and choose **Calculate profiles**. A later footprint query refreshes both profiles for the same value-area target. **Download price profiles** exports every populated price bin, the shared cutoffs and each metric's point of control and value area.

## Volume and occupancy

The volume profile sums the exact buy, sell and unknown trade size allocated to each price bin. The table preserves those component sums and the total.

The time-price opportunity profile counts each execution bracket in which a price bin contains at least one eligible trade. Repeated executions in the same bin and bracket count as one opportunity. Brackets or prices with no captured trade add no opportunities. Brackets begin at UTC epoch multiples of the selected interval. Price bins include the lower price boundary and exclude the upper boundary.

Both metrics use the inclusive execution window and observation cutoff. A late trade may change volume, occupancy or both. The calculation uses source event and observation times even when a file contains trades reported later.

## Time-price bracket chart

Open **Time-price bracket chart** beneath the applied footprint. The chart places price bins on rows and UTC execution brackets on columns. An occupied cell represents one opportunity regardless of how many eligible trades it contains. A labeled gap groups consecutive brackets without an observed trade. Rows include the exact lower and exclusive upper price boundaries and show the number of opportunities on the current time page. Page through the price and time axes independently.

Advance or rewind **Footprint known time (UTC)** to see when late trades fill a gap or mark an additional price bin. **Download time-price brackets** writes every occupied pair across all pages, the bracket bounds, the exact price bounds, the contributing trade count and the applied query. An occupied pair always contributes one opportunity, so totaling those rows for each price bin reconciles to the time-price profile. [Time-price chart convention](https://www.sierrachart.com/index.php?page=doc%2FStudiesReference%2FTimePriceOpportunityCharts.html).

## Point of control and value area

Choose a target from 0.01% to 100%, with 70% as the default. The point of control is the populated bin with the greatest weight. The lower price breaks ties.

Each value area starts at its point of control. It expands to the neighboring populated bin with the larger weight, using the lower neighbor for ties. Expansion continues until the covered weight meets the exact target fraction. The displayed price interval can include empty price bins between the occupied bins it contains. Volume weight is expressed in size units. Time-price weight is expressed in opportunities.

## Verify the example

Use the synthetic NVDA footprint demo with 60-second brackets, a price increment of 0.5, and an execution window from 1969-12-31T23:59:59Z to 1970-01-01T00:01:00Z. At that knowledge end the 70% volume area spans prices 100.5 through 101.5, with an exclusive upper bound, and covers 5 of 6.5 units. The time-price area covers 3 of 4 opportunities. Advance knowledge to 1970-01-01T00:01:01Z. The volume area now covers 13.000001 of 16.600001 units. The new trades occupy existing price bins in their respective brackets, so the time-price area still covers 3 of 4 opportunities.

The terminal can run the query and export the CSV offline once the cache is ready.
