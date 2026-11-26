# Linked chart panes

Choose **Compare charts** from the workspace chart toolbar to open a second pane. The watchlist controls the primary chart. **Comparison instrument** controls the second chart and can select any built-in or imported series in the catalog. Each pane has its own visible range, pan controls, and SMA and EMA settings.

**Link by UTC** shares the timestamp selected by the pointer. Each pane draws its own crosshair at the exact matching bar in its visible range. A timestamp that falls in a gap or beyond the visible range leaves that pane's crosshair clear. Panning and zooming one pane leaves the other pane's range in place. You can switch off linking from the comparison settings.

MarketWeft saves the comparison pane's instrument, overlay toggles and link setting with the existing workspace. A two-pane workspace exports a version 2 backup. A single-pane workspace exports version 1. Both formats can be restored in this version of MarketWeft. Pan and zoom ranges are session state.

The comparison uses the original bars and timestamps from each saved series. Imported histories remain independent, including when their intervals or trading hours differ. [Backup format](workspace-backup.md)
