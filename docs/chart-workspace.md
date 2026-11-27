# Chart workspace

## Linked chart panes

Choose **Compare charts** from the workspace chart toolbar to open a second pane. The watchlist controls the primary chart. **Comparison instrument** controls the second chart and can select any built-in or imported series in the catalog. Each pane has its own visible range, pan controls, and SMA and EMA settings.

**Link by UTC** shares the timestamp selected by the pointer. Each pane draws its own crosshair at the exact matching bar in its visible range. A timestamp that falls in a gap or beyond the visible range leaves that pane's crosshair clear. Panning and zooming one pane leaves the other pane's range in place. You can switch off linking from the comparison settings.

MarketWeft saves the comparison pane's instrument, overlay toggles and link setting with the existing workspace. Pan and zoom ranges are session state.

The comparison uses the original bars and timestamps from each saved series. Imported histories remain independent, including when their intervals or trading hours differ. [Backup format](workspace-backup.md)

## Chart types

Choose **Candles** for a filled price body, **OHLC bars** for a high-to-low stem with a left open tick and right close tick, or **Close line** to trace observed closes. These three show observed volume and use the same source bars, overlays and cursor readout. **Heikin-Ashi** adds a derived candle view. When several bars share a display column, the candles and OHLC bars use the first open, highest high, lowest low and last close. The line keeps the first, last, highest and lowest closes in their original order. A single observed close is drawn as a point.

The x-axis places consecutive observed bars at regular bar spacing. An unobserved timestamp has no chart point or linked crosshair. Switching among time-based chart types keeps the visible range. Switching to or from Renko, Three Line Break or Kagi resets the visible range. The pane keeps its indicator settings. Each pane saves its own chart type. [Backup format](workspace-backup.md)

### Heikin-Ashi

Each pane can display Heikin-Ashi candles independently. The first derived open is the midpoint of the first observed open and close. Subsequent opens are the midpoint of the previous derived open and close. The derived close averages the current observed open, high, low and close. The derived high and low enclose both the observed extremes and the derived body. Prices use signed millionths and round halfway values away from zero at each step. [Dan Valcu’s original calculation](https://c.mql5.com/forextsd/forum/118/using_the_heikin_ashi_technique_d_valcu.pdf).

The calculation starts from the beginning of the pane's selected history or aggregated series, so panning and zooming do not change the values. Timestamps and volume remain aligned with the source, including gaps. The readout labels the derived prices and shows the observed close separately. Moving averages, measurements and exports continue to use the chart's observed or aggregated source bars. Workspace backup saves the pane selection and source CSV. [Backup format](workspace-backup.md)

### Renko

Choose **Renko** for fixed-size price bricks. Enter the size in price units, with up to six decimal places. Each pane saves its size independently. The first observed close anchors the price grid. A move of one brick size extends the current direction, and a move of two brick sizes reverses it. One source close can generate several bricks with the same UTC timestamp. The calculation uses closed source bars and the selected timeframe. [Renko calculation](https://www.tradingview.com/support/solutions/43000502284-understanding-renko-charts/) · [Reversal threshold](https://www.tradingview.com/support/solutions/43000481040-what-do-renko-wicks-mean/).

Hover a brick to inspect its sequence number, open, close, and observed close. The x-axis steps by brick. An incoming UTC crosshair snaps to the last visible brick at that timestamp. Measurements can appear when both endpoint timestamps have bricks. Moving averages follow the closes of the source bars, and Renko omits a volume graph. The visible CSV includes source bars from the first visible brick's observation through the last. Choose **All bars** to include earlier and later observations. Workspace backup keeps the source CSV and pane settings. [Backup format](workspace-backup.md)

### Three Line Break

Choose **Three Line Break** to show new extremes in closing prices. The first observed close anchors the view. A higher close extends a rising line sequence, and a lower close extends a falling sequence. A reversal needs a close strictly beyond the lowest or highest edge of up to three consecutive lines in the prevailing direction. A reversal starts from the prior line’s opposite edge. A close equal to the threshold leaves the chart as it was. Each source close can produce at most one line. [Three-line break construction](https://financialdestination.in/wp-content/uploads/2025/12/3.-Beyond-candlesticks-steve-nison.pdf) · [Consecutive-line settings](https://www.sierrachart.com/index.php?ID=131&page=doc/StudiesReference.php).

The readout shows the line number, UTC timestamp, and exact open and close. Time advances by emitted lines. Linked crosshairs match source timestamps, and moving-average values and CSV exports use the source bars. The backup stores each pane’s choice and preserves its source CSV.

### Kagi

Choose **Kagi** and enter a fixed reversal size of up to six decimal places. The first observed close sets the base. Price must move at least the configured size to start the first line or turn in the opposite direction. A new extreme extends the current line. A reversal adds a horizontal connector and starts a new vertical line in the next column. [Kagi construction](https://financialdestination.in/wp-content/uploads/2025/12/3.-Beyond-candlesticks-steve-nison.pdf) · [Fixed reversal size](https://www.tradingview.com/support/solutions/43000502272-learn-to-use-kagi-charts/).

An initial rise is thick and an initial fall is thin. A thin rising line becomes thick when it rises above the last turning high. A thick falling line becomes thin when it falls below the last turning low. Touching either price preserves the current weight. The chart changes the stroke at the crossed price. Move the pointer along a vertical line to see the exact source close, its UTC time and the resulting stroke weight. Linked panes match the source timestamps that extended Kagi lines. CSV uses the observed source bars, and backups save each pane’s reversal size.

## Fixed-duration timeframes

Open **Timeframe** in either pane. Enter the source and target intervals in whole seconds. The target must be a larger whole multiple of the source. UTC mode aligns source opens and target buckets to the Unix epoch. A source bar on a boundary belongs to the bucket opening at that timestamp.

Each bucket uses the first observed open, highest observed high, lowest observed low, last observed close and exact volume sum. Empty buckets are omitted. A partial bucket shows the observed and expected source counts.

To align buckets to trading sessions, add a **Session calendar CSV** in the Timeframe panel. Use the [historical replay calendar format](historical-replay.md). The calendar supplies dated opens, closes and UTC offsets. Each session restarts the source and target grids at its open. The last bucket stops at the listed close, including early closes, and its expected count includes a shortened final source slot. The source CSV must fall on the calendar's source grid. The selected-bar readout shows the bucket's UTC close and marks early-close sessions.

The pane's indicators and CSV export follow the current view. Research CSV includes both interval lengths and source coverage per row. In session mode it also includes bucket close, session open, session kind and calendar filename. A plain OHLCV export of the aggregated view contains derived bars. **Show source bars** restores the original chart. The applied timeframe and calendar are scoped to the current view, and workspace backup contains the original imported histories. Historical replay uses its own observation clock.

## Measured drawings

Choose **Draw measurement** below a chart. Each endpoint uses an existing bar's UTC time and a price with up to six decimal places. Enter the values in the form or choose **Pick start on chart** or **Pick end on chart** and select a point in the price plot. The plot snaps the horizontal coordinate to that bar and rounds the vertical coordinate to the nearest price tick. **Edit measurement** reopens these coordinates, and **Remove measurement** clears the line.

The readout reports signed elapsed seconds, price change and percentage change from start to end. The percentage uses the absolute start price as the denominator and displays **Unavailable** when the start price is zero. When either pane displays the same instrument, it shares that instrument's saved drawing. Zoom and pan reproject the line in the visible price plot.

The workspace saves one measurement per built-in or imported instrument, including instruments outside the watchlist. Workspace backups preserve drawings and any comparison settings. [Backup format](workspace-backup.md)

## Moving-average periods

Open **Indicators** to configure the primary chart. When the comparison pane is open, the same dialog provides a separate pair of period fields for it. Each field accepts a whole period from 1 to 100,000 bars. The default periods are 20 bars for SMA and 9 bars for EMA. Each overlay can be enabled independently.

The readout shows the value at the hovered bar or the last visible bar when there is no crosshair. It shows a dash until the bar has a full window of closes. The SMA uses the most recent window and the EMA uses the first full window as its seed. Both use the signed six-place calculation in the existing Rust core.

Period settings follow the pane across instrument changes and reloads. Closing the comparison pane preserves its periods for the next time you open it. A backup with custom periods uses version 4 and can also preserve drawings and comparison settings. [Backup format](workspace-backup.md)

## Chart CSV export

Open **Export CSV** beneath either pane. Choose **Visible bars** for that pane's current pan and zoom range, or **All bars** for its entire selected instrument. Exports work offline.

**OHLCV bars for reimport** writes the six columns accepted by the terminal importer. Timestamps use UTC Unix seconds, and signed prices and volume retain their original values through six decimal places.

**Bars, provenance and enabled indicators** includes instrument identity, source, interval, usage grant and adjustment policy. Each enabled moving average adds a column such as `sma_20` or `ema_9`. Calculations use the instrument's full history through each exported bar, so the visible-range export preserves values calculated before the visible boundary. Cells stay empty while the indicator has too few closes. A leading apostrophe escapes formula-like provenance text. The research format can be used in analysis tools.

## Recorded trades

The **Recorded tick bars** tool builds an independent chart from captured trades using an observation cutoff and trade count. [Recorded tick bars](recorded-tick-bars.md)
