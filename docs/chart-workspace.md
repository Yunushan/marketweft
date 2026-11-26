# Chart workspace

## Linked chart panes

Choose **Compare charts** from the workspace chart toolbar to open a second pane. The watchlist controls the primary chart. **Comparison instrument** controls the second chart and can select any built-in or imported series in the catalog. Each pane has its own visible range, pan controls, and SMA and EMA settings.

**Link by UTC** shares the timestamp selected by the pointer. Each pane draws its own crosshair at the exact matching bar in its visible range. A timestamp that falls in a gap or beyond the visible range leaves that pane's crosshair clear. Panning and zooming one pane leaves the other pane's range in place. You can switch off linking from the comparison settings.

MarketWeft saves the comparison pane's instrument, overlay toggles and link setting with the existing workspace. Pan and zoom ranges are session state.

The comparison uses the original bars and timestamps from each saved series. Imported histories remain independent, including when their intervals or trading hours differ. [Backup format](workspace-backup.md)

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
