# Recorded market depth

Select an instrument in the chart workspace and open **Recorded market depth**. Load a depth CSV for that instrument. With the synthetic NVDA sample selected, choose **Load depth demo** to replay the bundled `depth.csv`.

Step through distinct observation times or enter an exact **Depth known time (UTC)** and choose **Query depth**. The ladder sorts bids by decreasing price and asks by increasing price. The spread is the difference between the best ask and bid when both exist. The ladder displays the best 50 levels per side. **Download depth snapshot** exports every eligible level and the sequence, timestamp and state evidence. When a view has no eligible levels, the CSV still includes a state record.

## CSV contract

```csv
instrument,event_at,observed_at,sequence,kind,side,price,size
NASDAQ:NVDA,2025-06-02T14:00:01Z,2025-06-02T14:00:02Z,9007199254740993,snapshot,bid,99.125,10.000001
NASDAQ:NVDA,2025-06-02T14:00:01Z,2025-06-02T14:00:02Z,9007199254740993,snapshot,ask,100.25,12
NASDAQ:NVDA,2025-06-02T14:00:00Z,2025-06-02T14:00:03Z,9007199254740994,update,bid,99.125,0
```

Use one instrument and one normalized sequence space per file. A positive unsigned 64-bit sequence identifies one atomic frame. Every row in the frame shares its kind and exact UTC event and observation times. Prices are signed decimals with up to six fractional digits. Sizes are positive for snapshots. An update replaces the size at its side and price, with zero deleting that level. A full empty snapshot is one row with blank side, price and size.

Frames must appear in strictly increasing sequence order and nondecreasing observation order. Event times can arrive late. Each frame may set a side and price once. Same-second frames are applied in sequence order. Normalize vendor feeds to this contract before importing, including any provider-specific sequence ranges or restart epochs.

## Observation cutoff and recovery

Only frames observed at or before the selected cutoff enter the book. An update requires a full snapshot and the next consecutive sequence. After a skipped sequence, the ladder remains unavailable until a later full snapshot is observed. A frame whose highest bid exceeds its lowest ask also requires a new snapshot. A bid and ask at the same price are valid. Every frame is applied as a unit before the crossing check.

In the synthetic fixture, the first snapshot becomes visible at `14:00:02Z`. At `14:00:03Z`, the best bid is 99.5 with size 4 and the best ask is 100.25 with size 3.25. The update at `14:00:05Z` skips sequence `9007199254740995` and the ladder withholds both sides. At `14:00:09Z`, a later snapshot and a same-second update recover both sides. Rewind to `14:00:03Z` to reproduce the earlier export.

The imported CSV and its replay stay in the current view. The app can open them offline after its cache is ready. [Synthetic depth fixture](../crates/core/tests/fixtures/synthetic-depth.csv).
