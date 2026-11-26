# Chart workspace

## Linked chart panes

Choose **Compare charts** from the workspace chart toolbar to open a second pane. The watchlist controls the primary chart. **Comparison instrument** controls the second chart and can select any built-in or imported series in the catalog. Each pane has its own visible range, pan controls, and SMA and EMA settings.

**Link by UTC** shares the timestamp selected by the pointer. Each pane draws its own crosshair at the exact matching bar in its visible range. A timestamp that falls in a gap or beyond the visible range leaves that pane's crosshair clear. Panning and zooming one pane leaves the other pane's range in place. You can switch off linking from the comparison settings.

MarketWeft saves the comparison pane's instrument, overlay toggles and link setting with the existing workspace. Pan and zoom ranges are session state.

The comparison uses the original bars and timestamps from each saved series. Imported histories remain independent, including when their intervals or trading hours differ. [Backup format](workspace-backup.md)

## Measured drawings

Choose **Draw measurement** below a chart. Each endpoint uses an existing bar's UTC time and a price with up to six decimal places. Enter the values in the form or choose **Pick start on chart** or **Pick end on chart** and select a point in the price plot. The plot snaps the horizontal coordinate to that bar and rounds the vertical coordinate to the nearest price tick. **Edit measurement** reopens these coordinates, and **Remove measurement** clears the line.

The readout reports signed elapsed seconds, price change and percentage change from start to end. The percentage uses the absolute start price as the denominator and displays **Unavailable** when the start price is zero. When either pane displays the same instrument, it shares that instrument's saved drawing. Zoom and pan reproject the line in the visible price plot.

The workspace saves one measurement per built-in or imported instrument, including instruments outside the watchlist. Backups with drawings use version 3 and also preserve any comparison settings. [Backup format](workspace-backup.md)
