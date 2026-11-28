# Chart workspace

## Linked chart panes

Choose **Compare charts** from the workspace chart toolbar to open a second pane. The watchlist controls the primary chart. **Comparison instrument** controls the second chart and can select any built-in or imported series in the catalog. Each pane has its own visible range, pan controls, and SMA and EMA settings.

**Link by UTC** shares the timestamp selected by the pointer. Each pane draws its own crosshair at the exact matching bar in its visible range. A timestamp that falls in a gap or beyond the visible range leaves that pane's crosshair clear. Panning and zooming one pane leaves the other pane's range in place. You can switch off linking from the comparison settings.

MarketWeft saves the comparison pane's instrument, overlay toggles and link setting with the existing workspace. Pan and zoom ranges are session state.

The comparison uses the original bars and timestamps from each saved series. Imported histories remain independent, including when their intervals or trading hours differ. [Backup format](workspace-backup.md)

## Chart types

Choose **Candles** for a filled price body, **OHLC bars** for a high-to-low stem with a left open tick and right close tick, or **Close line** to trace observed closes. These three show observed volume and use the same source bars, overlays and cursor readout. **Heikin-Ashi** adds a derived candle view. When several bars share a display column, the candles and OHLC bars use the first open, highest high, lowest low and last close. The line keeps the first, last, highest and lowest closes in their original order. A single observed close is drawn as a point.

### Hollow candles

Choose **Hollow candles** in either pane. A close above the open draws an outlined body, a close below the open draws a filled body, and an equal open and close draw a horizontal mark. Each body, wick and volume bar uses the direction from the previous observed close. Higher closes are green, lower closes are red, and ties or a missing previous close are gray.

The first visible candle uses the preceding observation even when it lies offscreen. In dense views, the first open, highest high, lowest low and last close form the displayed candle, and color compares that last close with the close before the display group. The cursor and chart CSV retain the original observations. Workspace backup version 52 preserves each pane's choice.

### Close area and step line

**Close area** traces observed closes and shades the area between that line and the bottom of the price plot. **Step line** keeps each close level until the next displayed observation and changes the level at that observation's column. Both use the same source bars and volume as the close line. On dense views they retain the same first, last, highest and lowest closes within each display group.

Choose the chart type independently in either pane. A workspace containing either type uses version 38, including any annotations already stored with the pane. The new chart types leave the source OHLCV and research exports intact.

### Baseline chart

Choose **Baseline** and set the **Baseline price** independently in each pane. The reference starts at zero. Enter a signed price with up to six decimal places and choose **Apply baseline**. The close trace is shaded green above the reference and red below it. When the trace crosses the reference, each fill stops at that intersection.

The price axis includes the reference, observed closes and enabled price overlays. The setting survives a temporary switch to another chart type. Version 39 backs up the selected type and any reference values.

The x-axis places consecutive observed bars at regular bar spacing. An unobserved timestamp has no chart point or linked crosshair. Switching among time-based chart types keeps the visible range. Switching to or from Renko, Three Line Break, Kagi or Point and Figure resets the visible range. The pane keeps its indicator settings. Each pane saves its own chart type. [Backup format](workspace-backup.md)

### Close-change histogram

Choose **Close-change histogram** to plot the difference between consecutive observed closes. Bars rise above zero for a gain and fall below zero for a loss. A small neutral mark denotes an exact zero. The first observation and the first after a missing interval have no bars. The crosshair shows both source closes and the previous bar's UTC time when a change is available.

Set **Close-change interval (seconds)** separately in each pane. Built-in samples use 86,400 seconds. Imported metadata in the form `60 seconds` supplies a default interval, and you can enter a value for any import. A fixed-duration or session timeframe uses its target interval and requires both buckets to have complete source coverage. The histogram has its own vertical scale and retains the volume track. Price overlays and drawings are available on price charts.

Version 40 backups preserve the chart selection and any explicitly saved interval. Choose **Bars, provenance and enabled indicators** in **Export CSV** for the interval, previous close time, previous close and signed change. The CSV leaves the three change fields empty for missing values. The OHLCV reimport CSV continues to contain observed bars.

### Volume-weighted candles

Choose **Volume-weighted candles** to make each body width proportional to the displayed bar's volume relative to the largest visible volume. Candle bodies stay centered on the original wick. The open and close still define the height. A bar with zero volume keeps its high-low wick.

When several bars share a display column, the group uses the standard OHLC aggregation and the sum of the underlying volumes. Pan and zoom recalculate widths for the visible range. Crosshairs, annotations, overlays and CSV exports use the original price and time coordinates. Version 41 backups preserve the choice independently for both panes.

### High-low band

Choose **High-low band** to shade the range between observed highs and lows with a close line inside it. Set **High-low band interval (seconds)** to join consecutive observations. The line and band break where observations are missing. An isolated bar shows its range and close as a column and point.

Built-in samples use 86,400 seconds. Imported metadata in the form `60 seconds` supplies a default interval. An active timeframe uses its target interval and isolates buckets with incomplete source coverage. In dense views, a display group keeps its observed high and low and retains the first, last and extreme closes. A group ends at each source gap.

The crosshair shows observed OHLCV. Version 42 backups preserve each pane's choice and saved interval. Source CSV exports continue to use the observed bars.

### Rebased percent change

Choose **Rebased percent change** to compare each close with an observed base close in that pane. The default is the first complete displayed observation in the history. To choose another base, enter the exact bar timestamp in **Rebase at (UTC)** and choose **Apply anchor**. **Use first close** restores the default. A linked cursor uses the same UTC timestamp in each pane and reads each pane's own base.

The chart uses 100 × (observed close ÷ signed base close − 1). Returns are rounded to six decimal places, halfway values away from zero. Values can be negative or positive with a signed base. Earlier rows stay blank, and an absent or zero base leaves returns undefined. When a timeframe is active, use the bucket timestamp. Incomplete buckets supply neither a base nor a return.

The percent axis marks zero. The readout retains the observed close and volume. Price annotations and same-axis price overlays are available on price charts. Version 43 backups preserve explicit UTC anchors by pane. **Bars, provenance and enabled indicators** in **Export CSV** includes the exact base time, base close and return. Rows before the base leave all three fields blank, and the OHLCV reimport format retains its original fields.

### Peak-to-trough drawdown

Choose **Peak-to-trough drawdown** to measure closes against the highest positive close observed through each bar. The chart uses 100 × (current close ÷ running peak − 1) and rounds to six decimal places. A new or recovered peak plots zero. If the same peak is reached again, its original timestamp remains the source.

Negative closes and incomplete timeframe buckets leave a gap and preserve the previous peak. Zero closes produce −100% once a positive peak is known. Observations before the first positive peak leave the value blank. The running peak starts at the beginning of the source history, so it can be outside the visible viewport.

The readout and analysis CSV include the observed peak's UTC timestamp and exact close. A visible-only analysis export keeps that peak evidence when the peak is outside the export range. The OHLCV reimport format retains its original fields. Version 44 backups preserve the selected chart types.

### Confirmed close swings

Choose **Confirmed close swings** and set the number of bars on either side of a candidate close. Each side accepts 1 through 1,000 bars and starts at two. An eligible high or low must be the first occurrence of the maximum or minimum across that window. A gap restarts the window. The faded line shows observed closes and the markers show the earlier pivot prices on the confirming columns.

The pane's **Known through (UTC)** cutoff restricts both the displayed bars and CSV export. Leave it empty for the latest observation. Source bars use their recorded timestamp. With a timeframe, the column uses the bucket's start time and the confirmation is available at its close. A partially covered bucket breaks the confirmation window and cannot serve as a pivot. The active timeframe supplies the interval. In source mode, use **Swing interval (seconds)** or the numeric seconds in the import metadata. Built-in samples default to 86,400 seconds.

The pointer readout separates pivot time, confirmation time and exact pivot close. Analysis CSV includes those fields, direction, both window sizes, the interval and the effective cutoff. Version 45 backups preserve pane settings and chart types. The cutoff is session state. The watchlist continues to show the current workspace snapshot.

### Close distribution chart

Choose **Close distribution** in either chart pane. MarketWeft divides the observed closes into groups of five from the beginning of the selected timeframe. The box spans the first and third quartiles, the center line marks the median, and the whiskers show the minimum and maximum. Each box appears at the last observation in its group. An incomplete aggregation bucket or an unobserved timestamp contributes no close. A trailing group appears once it has all five observations.

The chart readout shows the group's first and last UTC times and its exact price levels. Analysis CSV adds the same evidence on the completed group's final row. The OHLCV reimport export keeps its original fields. Version 54 workspace backups store each pane's chart choice. [Backup format](workspace-backup.md)

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

### Point and Figure

Choose **Point and Figure** and enter a fixed box size of up to six decimal places. The first observed close anchors the price grid. Each full box of continued movement adds an X to a rising column or an O to a falling column. A close that moves at least three boxes in the opposite direction starts the next column. Its first box starts one level away from the old column's tip. One source close can fill several price levels. [Fixed box sizing](https://help.stockcharts.com/charts-and-tools/other-charting-tools/p-and-f-charts) · [Three-box reversal](https://nasdaqdorseywright.zendesk.com/hc/en-us/articles/12906431410829-Point-Figure-Basics).

Hover a mark to see its column, box level, UTC source timestamp and observed close. A linked timestamp selects the last box filled at that source time. The pane saves its own box size, and its CSV export uses the observed source bars.

## Fixed-duration timeframes

Open **Timeframe** in either pane. Enter the source and target intervals in whole seconds. The target must be a larger whole multiple of the source. UTC mode aligns source opens and target buckets to the Unix epoch. A source bar on a boundary belongs to the bucket opening at that timestamp.

Each bucket uses the first observed open, highest observed high, lowest observed low, last observed close and exact volume sum. Empty buckets are omitted. A partial bucket shows the observed and expected source counts.

To align buckets to trading sessions, add a **Session calendar CSV** in the Timeframe panel. Use the [historical replay calendar format](historical-replay.md). The calendar supplies dated opens, closes and UTC offsets. Each session restarts the source and target grids at its open. The last bucket stops at the listed close, including early closes, and its expected count includes a shortened final source slot. The source CSV must fall on the calendar's source grid. The selected-bar readout shows the bucket's UTC close and marks early-close sessions.

The pane's indicators and CSV export follow the current view. Research CSV includes both interval lengths and source coverage per row. In session mode it also includes bucket close, session open, session kind and calendar filename. A plain OHLCV export of the aggregated view contains derived bars. **Show source bars** restores the original chart. The applied timeframe and calendar are scoped to the current view, and workspace backup contains the original imported histories. Historical replay uses its own observation clock.

## Measured drawings

Choose **Draw measurement** below a chart. Each endpoint uses an existing bar's UTC time and a price with up to six decimal places. Enter the values in the form or choose **Pick start on chart** or **Pick end on chart** and select a point in the price plot. The plot snaps the horizontal coordinate to that bar and rounds the vertical coordinate to the nearest price tick. **Edit measurement** reopens these coordinates, and **Remove measurement** clears the line.

The readout reports signed elapsed seconds, price change and percentage change from start to end. The percentage uses the absolute start price as the denominator and displays **Unavailable** when the start price is zero. When either pane displays the same instrument, it shares that instrument's saved drawing. Zoom and pan reproject the line in the visible price plot.

The workspace saves one measurement per built-in or imported instrument, including instruments outside the watchlist. Workspace backups preserve drawings and any comparison settings. [Backup format](workspace-backup.md)

## Horizontal price lines and UTC time markers

Choose **New price line** below the chart and enter a signed price with up to six decimal places. Choose **New time marker** and enter a UTC timestamp such as `2025-01-02T14:30:00Z`. **Pick on chart** sets the nearest price tick or the UTC time of the selected observation. Choose **Save price line** or **Save time marker** to keep the result. Each saved entry can be edited or removed independently.

A price line spans the visible price plot when its price is within the current scale. A UTC marker spans the height of the price plot at its time. Between two plotted observations, its position is interpolated by elapsed UTC time. When a price-movement chart uses one displayed column for multiple observations, the marker uses their plotted column. The current viewport and chart type determine placement.

Both panes show the same saved annotations when they display the same instrument. Annotations are kept for instruments removed from the watchlist. Workspace backup version 31 saves each exact price or UTC timestamp and restores earlier measurement-only backups. [Backup format](workspace-backup.md)

## Horizontal rays and trend lines

Choose **New horizontal ray** to set a signed price and a UTC start time. Its line begins at that time and extends to the right edge of the price plot. A ray anchored before the displayed range can cross the entire visible plot. The price scale follows the chart data and enabled overlays.

Choose **New trend line** to set two distinct price and UTC points. The line extends between those points and its visible part stays inside the price plot. Enter the coordinates or use the two chart pick buttons to snap each time to a displayed observation and each price to a tick. The projection uses the same elapsed-time interpolation as UTC markers when an anchor falls between observations.

Both tools share the instrument's existing drawing list and preserve exact coordinates in backup version 32. With only price lines and time markers saved, backup version 31 still applies. [Backup format](workspace-backup.md)

## Rectangles and parallel channels

Choose **New rectangle** and enter or pick two opposite corners. The rectangle spans those UTC times and prices. It accepts either corner first and requires a nonzero width and height in data coordinates.

Choose **New parallel channel** and enter or pick the two endpoints of its base edge. Enter a signed **Price offset** with up to six decimal places. The parallel edge uses the same UTC points with the offset applied to both base prices. A positive offset places it above the base, and a negative one places it below. The channel requires different UTC times and a nonzero offset. Both shifted prices must stay within supported chart bounds.

The selected chart type and viewport determine the visible portion of each drawing. Workspace backup version 33 preserves both shapes, including the exact signed channel offset. Earlier drawings still use their original backup versions when saved on their own. [Backup format](workspace-backup.md)

## Polylines and Fibonacci retracements

Choose **New polyline** to connect three or more points in the order you enter them. Each point accepts a signed price and UTC time or can be picked on the plot. **Add point** appends another point. A polyline can move forward or backward in time. Consecutive points must differ.

Choose **New Fibonacci retracement** to enter or pick the start and end of a price move. The chart labels seven horizontal prices from 0% at the end of the move to 100% at its start, with 23.6%, 38.2%, 50%, 61.8% and 78.6% in between. Each level spans the two anchor times. Prices are rounded to the nearest millionth, with ties away from zero.

The workspace keeps the exact anchors and point order. Version 34 backups store these tools and restore all earlier drawing formats. [Backup format](workspace-backup.md)

## Fibonacci price extensions

Choose **New Fibonacci price extension**. Enter or pick the start and end of the price move, then place the projection anchor after them. All three times must be in ascending order, and the first two prices must differ. Use **Edit** to change any anchor.

Each horizontal ray starts at the projection anchor. Its price is the anchor price plus the signed move from the first price to the second, multiplied by the labeled ratio. **Projection levels** shows 0%, 38.2%, 61.8%, 100%, 127.2%, 161.8%, 200% and 261.8%. Prices round to the nearest millionth, with ties away from zero. The selected plot range determines which rays are visible.

Workspace backup version 50 retains the exact UTC seconds and signed prices of the three anchors. [Backup format](workspace-backup.md).

## Fibonacci time zones

Choose **New Fibonacci time zones** and enter or pick two increasing UTC times. The difference between the anchors sets the base interval in seconds. From the first anchor, the drawing projects vertical lines at 0, 1, 2, 3, 5, 8, 13, 21, 34, 55 and 89 times that interval. [Fibonacci time-zone reference](https://www.tradingview.com/support/solutions/43000518155-fib-time-zone/).

The chart places lines by UTC. Between adjacent observations it interpolates their display position using the elapsed time. **Projected times** lists the exact timestamps, including projections outside the displayed history. Dates beyond year 9999 are omitted. Both editable anchors are saved per instrument in workspace backup version 51. [Backup format](workspace-backup.md).

## Fibonacci fan

Choose **New Fibonacci fan** and enter or pick two points. **Start** is the common origin of the rays. **End** sets the time and price of the completed move. Choose a later end time and a different price. The fan supports rising and falling moves.

At the end time, the three rays cross the prices reached at 38.2%, 50%, and 61.8% of the signed move from the start price. Open **Fan levels** to see the exact crossing prices, rounded to the nearest millionth with ties away from zero. The chart interpolates UTC anchors between observations and extends each ray to the visible plot boundary. A timeframe that maps both times to the same column has no visible fan until those anchors have distinct columns.

Edit either anchor from the drawing list. The same instrument's drawings project through each pane's timeframe and viewport. A version 53 backup preserves the exact anchors and restores earlier formats. [Backup format](workspace-backup.md).

## Gann fan

Choose **New Gann fan** and enter or pick a start and a later reference point at a different price. The signed move between those anchors defines the 1×1 ray. The other rays use the 1×8, 1×4, 1×3, 1×2, 2×1, 3×1, 4×1 and 8×1 slope ratios relative to that baseline. [Gann fan convention](https://www.tradingview.com/support/solutions/43000518151-gann-fan-drawing-tool/).

**Gann fan levels** lists each exact reference-time price, rounded to the nearest millionth with ties away from zero. Between observed bars, the chart interpolates each UTC anchor into its display column. It extends the nine rays forward using that pane's column spacing and clips them to the visible price plot. A pane that places both anchors in the same column keeps the saved drawing and its reference prices available.

Edit the anchors in the drawing list. Each pane projects the selected instrument's drawing through its own timeframe and viewport. A saved Gann fan uses workspace backup version 57. [Backup format](workspace-backup.md).

## Gann box

Choose **New Gann box** and enter or pick two opposite corners. The end time follows the start, and prices may rise or fall. Choose 2, 4, or 8 equal divisions on each axis. The grid spans the selected UTC and signed price ranges. Each range needs at least one second or one price millionth per division. [Gann box convention](https://www.tradingview.com/support/solutions/43000518152-gann-box/).

**Gann box levels** lists both anchors and each interior division. Time offsets round to the nearest second with ties toward the later second. Signed prices round to the nearest millionth with ties away from zero. The chart interpolates each UTC division between observed columns and clips the grid to the visible price plot. Both panes use the saved anchors when they show the same instrument and project them through their own timeframes. Workspace backup version 61 preserves the two corners and the division count. [Backup format](workspace-backup.md).

## Ellipses and triangles

Choose **New ellipse** and enter or pick two opposite corners of its bounding box. The ellipse accepts either corner first and requires different UTC times and prices.

Choose **New triangle** and enter or pick three corners in UTC and signed prices. The points must enclose an area in time and price coordinates. The chart joins the vertices and fills the enclosed area. Both shapes follow the visible plot and chart type, and they retain exact coordinates in version 35 backups. [Backup format](workspace-backup.md)

## Chart notes and directional arrows

Choose **New chart note**, enter or pick the UTC time and signed price, and enter one line of text. The chart shows the note near its point. The list keeps the full text available for editing.

Choose **New directional arrow** and enter or pick two distinct points. The arrowhead points to **End**, including when the end time is earlier than the start. Both drawings stay within the price plot and preserve exact text, order and coordinates in version 36 backups. [Backup format](workspace-backup.md)

## Price and time range highlights

Choose **New price range** and enter or pick two signed prices. The band highlights those prices across the visible time axis. Choose **New time range** and enter or pick two UTC times. The band highlights that interval across the visible price axis. Enter either boundary first. The saved range stores both coordinates in ascending order.

The chart clips both bands to the visible price plot. When a time boundary falls between observations, the chart interpolates its position. The two ranges can overlap and can be edited independently. Version 37 backups preserve their exact coordinates. [Backup format](workspace-backup.md)

## Anchored VWAP

Choose **New anchored vwap** in **Chart drawings**. Use **Pick on chart** or enter the exact UTC time of a source bar and save the drawing. The same instrument shares the saved anchor across panes. Picking a rolled bucket uses its first observed source bar.

From the anchor onward, the drawing weights each source bar's typical price, (high + low + close) ÷ 3, by its observed volume. The calculation accumulates before rounding to millionths. Values start at the first positive cumulative volume. A zero-volume bar adds no weight. Each rolled bucket shows the value through its last observed source bar, including the UTC time of that source bar in the readout.

The analysis CSV uses the drawing ID to identify columns for the anchor, last observation, calculated price and exact cumulative volume. Chart CSV export applies the source redistribution grant and expiry. A version 46 backup stores the source timestamp and ID. The drawing recalculates from the restored bars.

## Pitchfork

Choose **New pitchfork** in **Chart drawings**. Set an origin and two rail anchors by entering UTC times and signed prices or by picking three chart points. The three anchors must enclose an area. The median ray starts at the origin and passes through the midpoint of the rail anchors. The midpoint averages their UTC timestamps and prices before projection, so gaps between observations preserve the intended time.

The two outer rays start at their own anchors and run parallel to the median in the chart. Each pane clips the three rays to its visible price plot. Pan and zoom preserve the saved anchors. A version 47 backup retains the three points in order and restores earlier drawings alongside them.

## Risk/reward drawing

Choose **New risk/reward** in **Chart drawings**, then set **Direction**, **Entry**, **Target**, and **Stop**. Enter exact prices or pick on the chart. Entry and target times set the horizontal range. The target time must follow the entry time. For a long plan, the stop must be below entry and the target above it. A short plan reverses those price comparisons.

The drawing shades the reward and risk zones on opposite sides of the entry line. Values in the drawings panel show each price distance and reward divided by risk. The calculation supports signed prices and rounds the ratio to millionths. Edits and restores keep the exact input ticks. Version 48 stores the direction, stop and both endpoints. Each pane projects the same saved drawing against its own viewport.

## Regression channel

Choose **New regression channel** in **Chart drawings**. Enter or pick two exact UTC timestamps from source bars to fit the observed closes in that window. The first and last source bars are included. The fit uses observation order, so a missing interval contributes no invented price and does not add weight to the following close.

The middle line is the least-squares fit. Its endpoints round to price millionths. The outer lines are offset by the largest absolute residual from the rounded line, rounded upward to contain all fitted closes. A flat window has a zero residual and shows a single line. If the pane is rewound before the last anchor, the drawing waits for both observations.

Rolled views project the original fit through the last included source observation for each bucket. The readout shows the observed count, exact fitted endpoints, and residual. Version 49 stores the two UTC anchors and recalculates the drawing from the restored bars.

## Moving-average periods

Open **Indicators** to configure the primary chart. When the comparison pane is open, the same dialog provides a separate pair of period fields for it. Each field accepts a whole period from 1 to 100,000 bars. The default periods are 20 bars for SMA and 9 bars for EMA. Each overlay can be enabled independently.

The readout shows the value at the hovered bar or the last visible bar when there is no crosshair. It shows a dash until the bar has a full window of closes. The SMA uses the most recent window and the EMA uses the first full window as its seed. Both use the signed six-place calculation in the existing Rust core.

Period settings follow the pane across instrument changes and reloads. Closing the comparison pane preserves its periods for the next time you open it. A backup with custom periods uses version 4 and can also preserve drawings and comparison settings. [Backup format](workspace-backup.md)

## Wilder Relative Strength Index

Open **Indicators**, select **Show RSI** on the primary or comparison form and choose **Apply RSI**. The default period is 14. Each pane accepts a whole period from 2 through 100,000 changes. Its first value needs one more source close than the period. The RSI chart uses an independent 0 to 100 scale with guide lines at 30 and 70. The cursor identifies the source bar and its RSI when available.

The first average gain and loss are arithmetic means over the full window of close-to-close changes. Each subsequent average weights the previous mean by the period minus one, adds the new movement and divides by the period. The output is 100 times average gain divided by the sum of average gain and average loss. A flat starting window returns 50. A positive gain with zero loss returns 100, and a positive loss with zero gain returns 0. The calculation keeps twelve extra decimal places in its fixed-point averages and rounds results to millionths of an RSI point. [Wilder smoothing reference](https://github.com/TA-Lib/ta-lib/blob/main/src/ta_func/ta_RSI.c).

The study uses the selected timeframe's source closes. In Heikin-Ashi and other derived chart types, the RSI readout follows the source observation represented by the displayed bar or movement. Research CSV includes the study as a column such as `rsi_14`, with empty fields during warm-up. Workspace backup keeps the enabled state and period of each pane.

## Wilder Average True Range

Open **Indicators**, select **Show ATR** for either pane and choose **Apply ATR**. The default period is 14. The available periods are 1 through 100,000 source bars. ATR displays price units on an independent scale that runs from zero to the highest visible positive ATR. During warm-up or when all visible values are zero, it spans zero to one price unit. RSI keeps its own fixed 0–100 scale when both studies are visible.

True range spans the current high, current low and previous source close. The first source bar uses its high minus low. The first ATR averages a full period of true ranges. Subsequent values use Wilder smoothing. A period of one returns the true range directly, including a gap from the previous close. ATR uses the selected timeframe's source OHLC and exports a six-place value in a research CSV column such as `atr_14`. [True range and Wilder smoothing](https://www.tradingview.com/support/solutions/43000501823-average-true-range-atr/).

Settings save independently for each pane. A workspace with legacy RSI settings preserves them when an ATR study is configured.

## Bollinger Bands

Open **Indicators**, enable **Bollinger Bands** for either pane and apply a period from 1 through 100,000 closes. The default period is 20. The middle line is the simple mean and the outer lines sit two population standard deviations above and below the exact mean. Each result rounds to six decimal places, with half ticks rounded away from zero. The study needs a full window. In a flat window, the three lines share the same value. [John Bollinger's Bollinger Bands method](https://www.bollingerbands.com/bollinger-bands).

The three lines share the price scale, which includes the visible band values. They use the source closes for the selected timeframe. Each pane saves its own period and visibility setting. The research CSV adds `bb_lower_20`, `bb_middle_20` and `bb_upper_20` for a 20-bar setting, with blank cells while the window fills.

### Bollinger %B and BandWidth

Enable **Bollinger %B** or **BandWidth** in either pane’s indicator settings. Each has its own period and percentage scale. A study uses a 20-bar window by default and accepts 1 through 100,000 observed closes. Each measure uses the same six-decimal bands that the research CSV exports.

%B is 100 times the close minus the lower band, divided by the upper band minus the lower band. It reads 0% at the lower band, 50% at the middle, and 100% at the upper band. A close beyond the band remains visible on the expanded scale. The result is empty when both outer bands coincide.

BandWidth is 100 times the upper band minus the lower band, divided by the signed middle band. A zero middle band leaves the value empty. A nonzero middle with coincident outer bands gives 0%. The plot includes zero and its visible signed values. [John Bollinger’s %B notes](https://www.bollingerbands.com/_files/ugd/58be43_b120ddf0184540608baf19e2c0ae2019.pdf) · [BandWidth notes](https://www.bollingerbands.com/_files/ugd/58be43_d09c50b6e8ea4afd9af0523ef94de876.pdf).

The research CSV uses columns such as `bb_percent_b_20` and `bb_bandwidth_20`. Values retain six-decimal percentage precision even when they are too large to round-trip through a browser number. An undefined value leaves an empty cell and a gap in its plot.

### Donchian Channels

Enable **Donchian Channels** in either pane’s indicator settings. The upper line is the highest observed high in the window. The lower line is its lowest observed low. The middle line is their average, rounded to the nearest millionth of a price unit with half ticks away from zero. [TradingView’s Donchian Channels calculation](https://www.tradingview.com/support/solutions/43000502253-donchian-channels-dc/).

The window includes the current source bar and uses 20 bars by default. Enter a period from 1 through 100,000. Missing timestamps contribute zero observations. The channel appears once the full window has accumulated. Each pane saves its own period. It shares the price axis with the chart and any other enabled price overlays.

The research CSV exports `donchian_lower_20`, `donchian_middle_20` and `donchian_upper_20` for a 20-bar period. The cells stay empty during warm-up. Values use the source OHLC bars for the selected timeframe, including on chart styles derived from close prices.

### Keltner Channels

Enable **Keltner Channels** in either pane’s indicator settings. The middle line is the close EMA. The outer lines are the EMA plus or minus twice the Wilder ATR. Each pane saves separate EMA and ATR periods from 1 through 100,000 bars. The defaults are 20 bars for EMA and 10 for ATR. [StockCharts’ modern Keltner Channels calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/keltner-channels).

The EMA starts at the first full-window average of closes. Wilder ATR incorporates the previous observed close when measuring each true range. The channels appear once both studies are available and use the same six-decimal EMA and ATR values as the standalone studies. The outer lines coincide with the EMA when the ATR is zero. All three lines use the price axis.

For the default periods, the research CSV exports `keltner_lower_20_10`, `keltner_middle_20_10` and `keltner_upper_20_10`. Both periods are part of the column names. The export leaves warm-up cells empty.

### Stochastic Oscillator

Enable **Stochastic Oscillator** in either pane’s indicator settings. Its panel shows %K and %D on a common 0% to 100% scale. The defaults are 14 bars for the lookback, 3 for %K smoothing and 3 for %D. Each pane saves all three periods, and each can be from 1 through 100,000 bars. [StockCharts’ full Stochastic Oscillator calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/stochastic-oscillator-fast-slow-and-full).

To get the raw value, subtract the lowest observed low from the close, divide by the observed high-low range and multiply by 100. %K is its simple moving average. %D is a second simple moving average applied to %K. Every stage rounds to six decimal places. Use 1 for %K smoothing to see the raw value, or 1 for %D to match %K.

The raw value is absent during warm-up or when the observed range is zero. Each average needs a complete window of defined inputs. Missing timestamps contribute zero observations. A gap in either line stays visible on the plot and leaves its research CSV cell empty. The default CSV columns are `stochastic_k_14_3_3` and `stochastic_d_14_3_3`.

### Williams %R

Enable **Williams %R** in either pane’s indicator settings. The default lookback is 14 observed bars. Each pane can save a lookback from 1 through 100,000. The chart uses a fixed −100% to 0% scale with reference levels at −80% and −20%. [StockCharts’ Williams %R calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/williams-r).

Subtract the highest observed high from the close, divide by the observed high-low range and multiply by 100. The current bar is included. A close at the high gives 0%, and a close at the low gives −100%. The signed result is rounded directly to six decimal places, with half ticks away from zero.

The line is absent during warm-up and when the observed range is zero. Missing timestamps contribute zero observations. The chart leaves gaps for absent values. The research CSV exports exact signed percentage points under a column such as `williams_r_14` and leaves absent values empty.

### MACD

Enable **MACD** in either pane’s indicator settings. The MACD line subtracts the slow close EMA from the fast close EMA. The signal is an EMA of the MACD line. The histogram subtracts the signal from the MACD line and plots signed price differences around zero. [StockCharts’ MACD and histogram calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/macd-histogram).

Each pane saves separate fast, slow and signal periods. The defaults are 12, 26 and 9 observed bars. Each period can be from 1 through 100,000, and the fast period must be shorter than the slow period. Each EMA begins with a complete-window average and rounds to six decimal places. The line appears when the slow EMA is available. The signal and histogram appear after the signal EMA has a full window of MACD values.

The three series share a price-difference scale. With the default periods, the research CSV uses `macd_line_12_26_9`, `macd_signal_12_26_9` and `macd_histogram_12_26_9`. Warm-up cells stay empty.

### Cumulative volume studies

Enable **On-Balance Volume** or **Accumulation/Distribution Line** in either pane’s indicator settings. Each has its own signed volume scale. Both start from the first bar of the selected source history or timeframe, and both use the reported volume from each observed bar. Missing timestamps contribute zero observations. Each pane has an on/off control for each study.

On-Balance Volume starts at zero on the first observed close. It adds volume when the current close exceeds the previous observed close, subtracts volume when the close falls, and stays unchanged on equal closes. [StockCharts’ On-Balance Volume calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/on-balance-volume-obv).

The Accumulation/Distribution Line includes the first bar. For each bar, subtract the distance from the close to the high from the distance from the low to the close. Divide by the bar’s high-low range and multiply by its volume. Flat ranges contribute zero. Each contribution rounds to the nearest volume millionth with half ticks away from zero before adding to the running total. [StockCharts’ Accumulation/Distribution Line calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/accumulation-distribution-line).

The research CSV uses `obv` and `adl` columns. Readouts and CSV retain each exact volume millionth for totals beyond the signed 64-bit limit. Exporting the visible range keeps the cumulative values computed from all earlier observed bars.

### Chaikin studies

Enable **Chaikin Money Flow** or **Chaikin Oscillator** in either pane’s indicator settings. The studies share the same per-bar signed volume contribution as the Accumulation/Distribution Line. They each have their own scale and zero line.

Chaikin Money Flow adds the signed contributions over a full window, divides by the total reported volume over the same window and displays the result as a percentage. The default window is 20 observed bars. A window with zero reported volume leaves a gap. A flat bar contributes zero to the numerator and its reported volume to the denominator. [StockCharts’ Chaikin Money Flow calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/chaikin-money-flow-cmf).

The Chaikin Oscillator subtracts the slow EMA of the Accumulation/Distribution Line from the fast EMA. It uses volume units. The default periods are 3 and 10 observed bars. The fast period must be shorter than the slow period. It starts at the first full slow window. Each EMA begins with a full-window average and rounds each value to the nearest volume millionth. [StockCharts’ Chaikin Oscillator calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/chaikin-oscillator).

Each period accepts 1 through 100,000 bars. The default research CSV columns are `chaikin_money_flow_20` and `chaikin_oscillator_3_10`. Undefined values leave empty cells. Both readouts and exports retain exact six-place values.

### Money Flow Index and Volume-Weighted Moving Average

Enable **MFI** or **VWMA** in either pane’s indicator settings. MFI uses a fixed 0% to 100% scale with reference levels at 20% and 80%. VWMA shares the price axis with the candles and other overlays. Either period accepts 1 through 100,000 observed bars.

MFI defaults to 14 price changes. A change compares an observed bar’s typical price, the average of its high, low and close, with the previous observed bar. An increase adds to positive money flow, a decrease adds to negative money flow, and a tie contributes zero. The flow magnitude is volume times the absolute typical price. This keeps rising and falling flows distinct for instruments with signed prices. The first value requires a full window of classified changes. MFI divides positive flow by combined positive and negative flow and expresses the result as a percentage. A window with zero combined flow leaves an empty cell. [StockCharts’ Money Flow Index calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/money-flow-index-mfi).

VWMA defaults to 20 bars. It divides the sum of each close times its reported volume by total reported volume over a full window. A window with zero reported volume leaves an empty cell. The result rounds directly to the nearest price millionth with half ticks away from zero. [TradingView’s Volume-Weighted Moving Average calculation](https://www.tradingview.com/support/solutions/43000592293-volume-weighted-moving-average-vwma/).

The default research CSV columns are `mfi_14` and `vwma_20`. The chart leaves gaps for absent values. Missing timestamps contribute zero observations.

### WMA, DEMA, TEMA and Hull moving average

Enable **WMA**, **DEMA**, **TEMA** or **HMA** in either pane’s indicator settings. The four lines share the price axis. Each defaults to 20 observed closes and accepts a period from 1 through 100,000. The chart readout shows exact signed price millionths. A period of one follows the observed close.

WMA assigns weights from one for the oldest close through the chosen period for the newest close. DEMA combines twice the first EMA with the negative of the second. TEMA combines the first, second and third successive EMAs with coefficients 3, −3 and 1. Each EMA stage starts with a full-window simple average and rounds after each observation. [TA-Lib WMA](https://ta-lib.org/functions/wma.html) · [TA-Lib DEMA](https://ta-lib.org/functions/dema.html) · [TA-Lib TEMA](https://ta-lib.org/functions/tema.html)

HMA subtracts the full-period WMA from twice the half-period WMA, then smooths the result over the whole-number square root of the period. The half period rounds down and has a minimum of one. Each WMA stage rounds to the nearest price millionth with half ticks away from zero. [Alan Hull’s moving average](https://alanhull.com/the-hull-moving-average/)

Before the required windows are available, outputs stay empty in the plot and CSV. The default columns are `wma_20`, `dema_20`, `tema_20` and `hma_20`. Version 56 workspace backups preserve each pane’s settings.

### Directional Movement System

Enable **DMI** in either pane’s indicator settings. +DI, −DI and ADX share a fixed 0% to 100% scale with a reference at 25%. The DI period and ADX smoothing period each default to 14 and accept 1 through 100,000 observed bars. [StockCharts’ Wilder Directional Movement System](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-directional-index-adx).

A rise in the high must be positive and exceed the fall in the low to count as positive movement. A fall in the low must be positive and exceed the rise in the high to count as negative movement. Equal moves contribute zero to both. True range includes the gap from the previous observed close, and missing timestamps contribute zero observations.

+DI and −DI divide smoothed movement by smoothed true range, using Wilder’s averages and an initial full window of changes. ADX smooths the absolute difference between positive and negative movement divided by their sum. The first ADX requires a full window of directional values. A true range of zero gives zero for both DI lines, and a combined movement of zero contributes zero to ADX.

The default research CSV columns are `dmi_plus_di_14_14`, `dmi_minus_di_14_14` and `dmi_adx_14_14`. The CSV preserves six-place percentage points and leaves warm-up values empty.

### Commodity Channel Index and Rate of Change

Enable **CCI** or **ROC** in either pane’s indicator settings. Each period accepts 1 through 100,000 observed bars. CCI shows index values with references at −100, 0 and 100. ROC shows percentages with a zero reference.

CCI defaults to 20 bars. The study subtracts the trailing mean typical price from the current typical price and divides by 0.015 times the mean absolute deviation from that same mean. Typical price is the mean of high, low and close. Both statistics use the same full trailing window. A window with zero mean deviation leaves the CCI value empty. [StockCharts’ Commodity Channel Index calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/commodity-channel-index-cci).

ROC defaults to 12 changes. It subtracts the close one lookback ago from the current close, divides by that earlier signed close and multiplies by 100. A zero baseline leaves the value empty. A negative baseline retains its sign in the calculation. [StockCharts’ Rate of Change calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/rate-of-change-roc).

The default research CSV columns are `cci_20` and `roc_12`. Values are rounded directly to six decimal places. The plot leaves gaps where output is absent, and the CSV leaves those cells empty. Exact ROC readouts and CSV values can exceed the signed 64-bit tick range.

### Chande Momentum Oscillator and TRIX

Enable **CMO** or **TRIX** in either pane’s indicator settings. CMO defaults to 20 close changes and accepts a period from 2 through 100,000. It divides the net signed change by the sum of the absolute changes over the same trailing window, then expresses the ratio as a percentage. A full flat window has a value of 0%. The scale spans −100% to 100%. [TA-Lib’s unsmoothed Chande Momentum Oscillator](https://ta-lib.org/functions/cmou.html)

TRIX defaults to 30 closes and accepts 1 through 100,000. Three successive EMAs each start with a full-window simple average and round to six places after each step. The oscillator reports the percentage change from the preceding value of the third EMA. A zero previous value leaves the percentage empty. The readout and export keep exact signed values, including percentages beyond the 64-bit tick range. [TA-Lib’s TRIX formula](https://ta-lib.org/functions/trix.html)

Both studies operate on the available closes in the selected timeframe. Their default research CSV columns are `cmo_20` and `trix_30`. Warm-up values remain empty. Workspace backup version 55 preserves each pane’s enabled studies and periods.

### Aroon and Aroon Oscillator

Enable **Aroon** or **Aroon Oscillator** in either pane’s indicator settings. Aroon Up and Down share a 0% to 100% scale. The oscillator uses a −100% to 100% scale with a zero reference. Each study defaults to 25 and saves its own period from 1 through 100,000. [TradingView’s Aroon calculation](https://www.tradingview.com/support/solutions/43000501801-aroon-indicator/) · [StockCharts’ Aroon Oscillator calculation](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/aroon-oscillator).

A period of 25 searches the current bar and 25 preceding observed bars. Up tracks the age of the highest high and Down tracks the age of the lowest low. Both use the latest bar when an extreme is tied. Subtract the age from the period, divide by the period and multiply by 100. An extreme on the current bar gives 100%. An extreme at the oldest eligible bar gives 0%. Missing timestamps contribute zero observations.

The oscillator subtracts Down from Up before rounding the result to six decimal places. The chart and CSV leave warm-up values empty. The default research CSV columns are `aroon_up_25`, `aroon_down_25` and `aroon_oscillator_25`.

### Vortex and Balance of Power

Enable **Vortex** in either pane and choose a lookback from one to 100,000 observed bar pairs. The default is 14. VI+ uses the absolute distance from the current high to the prior low. VI− uses the absolute distance from the current low to the prior high. Each line divides the sum of its movement by the same window's total true range. The first value needs one preceding close and a full window of pairs. A zero true-range total leaves both lines empty. [Vortex formula](https://www.tradingview.com/support/solutions/43000591352-vortex-indicator/).

**Balance of Power** divides the signed close-minus-open move by that bar's high-minus-low range. It uses each bar independently and has a fixed scale from −1 to +1. A zero range leaves an empty value. A nonzero range with an unchanged open and close gives zero. [Balance of Power formula](https://ta-lib.org/functions/bop.html).

Each pane uses the bars available to its selected history and timeframe. Both studies round once to six decimal places. The research CSV uses `vortex_positive_14`, `vortex_negative_14` and `bop`, with the chosen lookback in the Vortex column names. A saved Vortex or Balance of Power setting uses workspace backup version 58.

### Elder Force Index and Chaikin Volatility

**Elder Force Index** multiplies the signed change between consecutive closes by the current bar's volume. The EMA starts after a full period of close pairs and defaults to 13. The core keeps trillionths during smoothing and rounds the reported force to millionths. Zero current volume contributes zero force. [Elder Force Index formula](https://www.tradingview.com/support/solutions/43000502259-elder-s-force-index-efi/).

**Chaikin Volatility** smooths the high-minus-low range with an EMA, then reports the signed percentage change over a separate comparison period. Both periods default to 10. The moving average uses millionths, and a zero comparison baseline leaves the value empty. The first percentage requires a complete EMA and an earlier complete EMA at the comparison distance. [Chaikin Volatility formula](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/volatility).

Both studies use observed bars and preserve separate pane settings. Research CSV names include the configured periods, such as `elder_force_13` and `chaikin_volatility_10_10`. Their settings use workspace backup version 59.

### Daily floor pivots

Enable **Daily Floor Pivots** independently in either pane’s indicator settings. The five stepped lines for each bar use the high, low, and final observed close of the latest earlier UTC date with source observations. This carries the previous observed day's levels across weekends and other gaps. The first observed date has no levels. Observations from the current UTC day cannot change its levels. Rolled panes read the same original source bars and use each displayed bar’s opening UTC date.

With high `H`, low `L` and close `C`, the pivot is `P = (H + L + C) / 3`. The support levels are `S1 = 2P − H` and `S2 = P − (H − L)`. The resistance levels are `R1 = 2P − L` and `R2 = P + (H − L)`. Each result is rounded once to the nearest price millionth with ties away from zero. [Pivot Points Standard formulas](https://www.tradingview.com/support/solutions/43000521824-pivot-points-standard/).

The active bar readout shows the timestamp of the source close. Research CSV gives the five signed prices in `daily_pivots_pivot`, `daily_pivots_support_1`, `daily_pivots_support_2`, `daily_pivots_resistance_1` and `daily_pivots_resistance_2`. Workspace backup version 60 preserves the pane settings.

## Monthly returns calendar

Open **Monthly returns calendar** from the workspace for the selected primary instrument. Choose up to 30 consecutive UTC calendar years and set an inclusive **Observed through (UTC)** timestamp. The calendar uses the bar timestamps and closes in the selected history. Each cell compares the last close through that cutoff with the last close in the immediately preceding UTC month, including the December observation for the first displayed January when available.

The price return is `(current close − prior close) ÷ prior close × 100`, rounded once to six decimal places. A cutoff before a month's final UTC second labels that month **Month to date**. Missing closes, a zero prior close and future months have separate labels. A missing month also leaves the following month without a baseline. A genuine zero return shows **0%**. The calculation uses the source's existing adjustment convention and does not add dividend cash flows.

The calendar works offline and requires an automated-use grant for user-imported history. **Download monthly returns CSV** requires a separate redistribution grant and writes the selected source, cutoff, month state, price availability, exact UTC close timestamps and prices, and return. Repeating a prior cutoff with the same source reproduces the same CSV.

### Native and Python monthly returns

The `marketweft-research monthly-returns` command reads a tab-separated header followed by the same UTF-8 OHLCV CSV that the terminal imports. The header fields are `marketweft-monthly-returns`, `1`, first UTC year, last UTC year and the inclusive cutoff in `YYYY-MM-DDTHH:MM:SSZ` format. End the header with LF.

The response starts with the protocol name, version and row count separated by tabs. Each following row contains the year, month, window (`complete`, `month-to-date` or `future`), preceding close UTC second and ticks, current close UTC second and ticks, and the return in millionths of a percentage point. Blank fields represent unavailable observations or returns.

```python
from pathlib import Path
from marketweft_research import ResearchEngine

engine = ResearchEngine("marketweft-research")
rows = engine.monthly_returns(
    Path("history.csv").read_text(encoding="utf-8"),
    first_year=2024,
    last_year=2024,
    observed_through="2024-02-29T16:00:00Z",
)
```

The SDK validates the response counts, UTC month bounds, close evidence and fixed-point fields before returning immutable `MonthlyReturn` records. The native executable, Python SDK and TypeScript SDK use the same Rust calculation. [Python SDK](../packages/python-research/README.md).

## Chart CSV export

Open **Export CSV** beneath either pane. Choose **Visible bars** for that pane's current pan and zoom range, or **All bars** for its entire selected instrument. Exports work offline.

**OHLCV bars for reimport** writes the six columns accepted by the terminal importer. Timestamps use UTC Unix seconds, and signed prices and volume retain their original values through six decimal places.

**Bars, provenance and enabled indicators** includes instrument identity, source, interval, usage grant and adjustment policy. Each enabled study adds a column such as `sma_20`, `ema_9`, `rsi_14`, or `atr_14`. Calculations use the instrument's full history through each exported bar, so the visible-range export preserves values calculated before the visible boundary. Cells stay empty while the study has too few closes. A leading apostrophe escapes formula-like provenance text. The research format can be used in analysis tools.

## Recorded range bars

Open **Recorded range bars** for the primary instrument or **Comparison range bars** under the comparison chart. Select a [recorded trade CSV](recorded-tick-bars.md) and set a positive price range with up to six decimal places. The optional observation cutoff includes trades seen at that UTC second. The tool consumes capture sequence in order, including late-reported trades once they are observed.

Each bar closes when a recorded trade makes its high-to-low range reach or exceed the selected size. A gap that overshoots the threshold stays in the bar that it completes. Each captured trade contributes once to volume. The final bar is provisional if its range is still below the threshold. This mode displays the exact prints through a gap. [Range chart variants](https://www.sierrachart.com/index.php?page=doc/ChartSettings.html).

Hover a bar to inspect its target and actual range, completion state, observation time and exact capture sequences. Download the same fields alongside OHLCV. **Save range size for this pane** stores a reusable starting size and includes it in workspace backup. Select the trade file each time you open the tool.

## Recorded volume bars

Open **Recorded volume bars** for the primary instrument or **Comparison volume bars** under the comparison chart. Select a [recorded trade CSV](recorded-tick-bars.md), enter a positive volume target with up to six decimal places and optionally set an inclusive UTC observation cutoff.

A completed bar contains exactly the entered volume. When a trade crosses the boundary, its remaining volume starts the next bar at that trade's price. Each portion keeps the original capture sequence and observation timestamp. A large trade can fill several bars that share a timestamp. The final bar is provisional while its volume is below target. [Constant-volume bar construction](https://www.sierrachart.com/index.php?page=doc/ChartSettings.html).

Hover a bar to inspect its volume, status, date and capture sequences. The CSV also reports the volume contributed by the first and last trades and the number of contributing trades in each bar. One capture sequence can contribute to multiple bars. **Save volume target for this pane** saves the setting in the workspace backup. Select the trade file when you reopen the tool.

## Recorded trades

The **Recorded tick bars** tool builds an independent chart from captured trades using an observation cutoff and trade count. [Recorded tick bars](recorded-tick-bars.md)
