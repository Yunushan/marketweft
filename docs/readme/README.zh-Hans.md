<!-- MarketWeft README · locale=zh-Hans -->

# MarketWeft

**0.294.0 · 0BSD**

**文档语言**

[English](../../README.md) · **简体中文** · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft 的功能

MarketWeft 是面向分析师、开发人员和运维人员的本地优先研究终端。它读取有权使用的 OHLCV 文件，绘制交互式蜡烛图与成交量，用定点数计算 SMA 和 EMA，并把自选列表、选中标的和指标保存在 IndexedDB。应用资源缓存后即可离线使用。内置价格与成交量均为合成数据，无需行情商账户。

MarketWeft 0.294.0 新增最小二乘移动平均线，提供精确拟合的收盘价，并支持窗格独立周期。 MarketWeft 0.7.0 新增按价格收益率进行的时点股票池筛选。基于交易时段的回放支持拆股、现金股息、成分变动和退市。仓库还提供独立 trading-bot 服务的只读 TypeScript 观察器和实验性 Tauri 封装。数据源接入、下单、签名原生安装包及多用户托管仍在路线图上。

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md) · [Least Squares Moving Average](../chart-workspace.md#least-squares-moving-average) · [Equity target research SDKs](../portfolio-replay.md#equity-target-research-sdks)

<!-- section:02 -->
## 启动便携终端

从 GitHub 成功的验证运行中下载 browser-terminal-attempt-N，解压其中的 MarketWeft-browser-0.294.0.zip。让 dist/ 与 serve-terminal.mjs 位于同一目录，在该目录运行下列命令。使用支持 WebAssembly、Canvas、BigInt 和 IndexedDB 的新版浏览器打开 http://127.0.0.1:4173/。启动器需要 Node.js 22.12 或更高版本，无需通过 npm 安装。断网前等待显示 Offline ready。

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md) · [Linux native verification](../../docs/platforms.md#linux-native-verification) · [Ubuntu desktop package](../../docs/platforms.md#ubuntu-desktop-package) · [Ubuntu upgrade verification](../../docs/platforms.md#verify-an-ubuntu-package-upgrade) · [Ubuntu package provenance](../../docs/platforms.md#verify-ubuntu-package-provenance)

<!-- section:03 -->
## 回放纽约证券交易所示例

进入 Historical replay，选择 Start demo。用 Next event 单步，用 Play 和 Pause 控制连续回放，Previous event 后退一步，Reset 清空已显示的历史。图表起初为空，蜡烛在时段结束时才显示。Event time 是区间起点或会话边界，Observed at 是信息可用的时刻。速度只影响屏幕上的播放节奏。

2025 年 10 月 31 日的开盘是 13:30 UTC（UTC−04:00），11 月 3 日改为 14:30 UTC（UTC−05:00）。11 月 3 日 15:00 的缺失区间在 15:30 报告。感恩节当天没有时间槽，11 月 28 日在七根 30 分钟蜡烛后提前于 18:00 UTC 收盘。示例有 20 个交易日、253 根蜡烛和 294 个事件，采用合成行情与公开的 NYSE 核心交易时间。

要查看公司行为，打开 Historical replay → Start split demo，在同一事件下切换 Price basis 中的 Raw 与 Split-adjusted。2 比 1 拆股先公布并被观测，生效前两种视图一致。生效时，拆股前最后一根蜡烛的收盘价由原始 106.50 调为 53.25，成交量翻倍。拆股后第一根蜡烛的收盘价保持 53.00。用自有数据时，上传所选标的的 Corporate actions CSV，确认 OHLCV 未经调整，并提供交易时段日历。生效后采用当时已观测的最新比例。迟到报告和更正从各自的观测时刻起改变视图。原始历史保持完整。

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

打开 Historical replay → Start dividend demo，查看每次分配按 100 股有权获息的情景。除息时确认 USD 25.00 应收股息。金额修订将其提高至 USD 30.00，支付日修订推迟入账。迟到的 EUR 报告在被观测时记入 EUR 10.00，支付后的更正让美元现金余额变为 USD 28.00。后退查看此前余额。使用自己的数据时，上传 Cash dividends CSV 并填写 Entitled shares per distribution。修订沿用同一分配 ID。各币种单独记账，旧分录和原始价格得以保留。

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

打开 Historical replay → Open universe replay → Start universe demo。14:05 UTC 时只有 ALFA 是成分股，14:10 BETA 加入。ALFA 在 14:20 生效的剔除于 14:25 获知。BETA 在 14:30 生效的退市于 14:35 获知。后退查看早先的成分股，或用独立的 Effective time 和 Known time 截止值查询。上传 Universe membership CSV 即可使用自己的历史。修订沿用同一变更 ID，代码重用时使用不同的上市 ID。

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

在 Universe screen 选择 Load demo prices，保留 14:00 UTC 为基准。14:05 时 ALFA 以 1% 领先。14:10 时 BETA 加入，直到 14:12 看到收盘价才参与排名。将生效时间设为 14:10，分别用 14:12 和 14:16 作为已知时间查询，可比较 BETA 的 12% 收益与修订后的 1%。生效时间为 14:20、移除消息于 14:25 可知时，ALFA 离开榜单。上传以挂牌标识为键的 Universe prices CSV，可用自有的精确时点收盘价复现。缺少基准价或目标价的成分仍可见，但不参与排名。

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

载入演示价格后，在 Sector heatmap 中选择 Load demo sectors。14:10 UTC 时，热力图覆盖 60% 的已知权重。14:12 获得 BETA 的价格后，覆盖率升至 100%，已观察到的贡献从 1.2% 升至 6%。14:16 的行业修订把 BETA 从金融移到科技。打开色块可查看排名、贡献和分类报告时间。使用自有报告时，请上传 Sector and weight CSV。

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

打开 Historical replay → Open financial statements → Start financial demo。选择 Original filing 可见市盈率为 10 倍。估值时间不变时，Restatement observed 将市盈率提高到 15 倍，并显示普通股权益缺失。Revised capitalization 将市盈率提高到 20 倍。上传 Annual filings CSV 和可选的 Capitalization CSV，即可查询自己的发行人及信息截止时点。

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

打开 Historical replay → Open economic calendar → Start calendar demo。发布前可见 2.5% 的预测，实际值暂不可见。Actual observed 在 14:32 UTC 显示 2.7%。Revised actual 显示 2.8%，可在 Release evidence 核对两次修订。上传 Macro calendar CSV 可使用自己的带时间戳发布记录。

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

打开 Historical replay → Open option chain → Start option demo。四月执行价 100 的看涨与看跌期权初始隐含波动率约为 20%。Late option quote 显示隐含波动率为 25% 的执行价 90 看涨期权，Corrected spread 修复原先无法估值的看跌期权价差。展开 Implied volatility surface 比较不同到期日。导入 Underlying CSV 与 Option quotes CSV 可使用自己的带日期报价。

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

打开 Historical replay → Open replay alerts → Start alert demo。First crossing 显示一条阈值告警。Correction observed 显示修订样本及其均线穿越。Full alert replay 显示八条告警。连续两次选择 Save to alert inbox，确认第一次保存八条，第二次新增零条。导入 Alert rules CSV 和 Alert observations CSV 可使用自己的数据。

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

打开 Historical replay → Open paper ledger → Start paper demo。从预留现金 503 开始逐步回放。单次部分成交后余额为 801.6。Final account 显示停用后的现金 663.7 和已实现利润 13。导入 Paper events CSV 可回放自己的模拟订单、成交和控制事件。

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

打开 Historical replay → Open bar backtest → Start backtest demo。14:05 UTC 的信号提交买单。14:06 缺失区间没有成交，14:07 的收盘观测有两股可成交。Final backtest 显示权益为 957.8。导入交易时段和行情条 CSV 可用本地历史数据运行同一策略。

在回测演示中使用默认的六根训练行情条和两根测试行情条，运行 Walk-forward validation。首个完整窗口在 14:09 UTC 显示。训练选中 1:2，两根测试行情条始终使用该参数，模拟账户从初始状态开始。

在行情条回测演示中运行 Seeded scenarios，使用种子 20250403、256 条路径，每条路径八次价格变动。基准期末权益为 957.8，模拟期末权益的中位数为 997.6。相同的截止时间、输入和种子可复现风险表。

在成分股演示中为 BETA-001 加载 Delisting proceeds，将两个截止时间设为 14:35 UTC，可看到退市款项缺失。14:37 时十股的应收款为 70 USD，14:50 首次记入现金账。后续更正保留较早时点的结果，且独立处理 BETA-002。

打开 Start split revisions demo，选择 Split-adjusted。6 月 3 日 14:10 UTC，修订后的生效时间使旧调整撤回。14:20 两个操作 ID 的比例相乘。14:30 取消 SPLIT-A 后保留 SPLIT-B 的影响，原始行情条不变。

打开 Start dividend entitlement demo。ALPHA 的应享股份从 100 股开始，迟到报告使其升至 120 股。BETA 使用 40 股。付款后 ALPHA 更正为 110 股，冲回 3 USD。回退可查看之前的余额。

在成分股演示中加载 Portfolio replay。BETA-001 的 14:10 UTC 收盘价到 14:12 才可获知。14:45 时，它的 70 USD 应收款与 BETA-002 的 225 EUR 股票价值分别列示。14:50 股票价值与退市现金合计 284 USD。

选择 Compare charts 并选择对比标的。Link by UTC 在两个窗格中标出同一个可见时间点。每个窗格可单独缩放。工作区备份保存两个标的、叠加指标和联动设置。

选择 Draw measurement，为每个端点指定现有的 UTC K 线和价格。缩放或平移时，图表会重新绘制同一条已保存的线。工作区备份保存坐标，应用显示经过的秒数、价格变动和百分比变动。

打开 Indicators，按 K 线数量设置每个窗格的 SMA 和 EMA 周期。收盘价样本足够时，图表显示选中 UTC K 线的指标值。切换标的、重新加载和恢复备份都能保留周期。

打开图表下方的 Export CSV。下载可重新导入的 OHLCV K 线，或附加来源信息和已启用的移动平均线供研究使用。收盘价样本不足时，均线值留空。

在任一窗格的图表类型控件中选择 Close line。折线采用已观察到的收盘价，并保留成交量和已启用的指标。缺少对应 UTC K 线时不会显示联动十字光标。工作区备份保存图表类型。

选择 OHLC bars，竖线表示最高和最低价，左刻度表示开盘价，右刻度表示收盘价。各窗格保留各自的图表类型，联动光标仍按精确的 UTC K 线匹配。

在任一窗格打开 Timeframe，输入以秒为单位的源间隔和目标间隔。图表和研究用 CSV 显示已观测与预期的源 K 线数量。工作区备份保留完整的原始序列。

在 Timeframe 中添加交易时段日历 CSV，按各交易日的开盘时间划分目标时间桶。最后一桶止于日历中的收盘时间，研究用 CSV 保存日历来源与源 K 线覆盖情况。

打开 Recorded tick bars，指定每根 K 线的成交笔数和观测截止时间。图表按采集顺序处理同一时间戳的成交，标记尚未完成的 K 线，并导出精确的序号边界。

在 Portfolio replay 中加载股息收入示例，或添加投资组合股息 CSV。查询使用除息前的持仓，在支付日结算，并根据观测时间应用后续修订。

载入价格后，在 Universe screen 中展开 Relative returns。选择两个上市记录 ID 和确切的 UTC 基准时间。调整股票池截止时间可重放缺失收盘价和修订，再将完整比较下载为 CSV。

打开 Recorded market depth，载入所选标的的深度 CSV。逐个切换观测截止时间，检查买卖盘档位、序列缺口及下一次快照后的恢复。可将全部档位下载为 CSV。

打开 Recorded footprint 并载入所选标的的成交数据。设置成交时间窗口和观测截止时间，查看各价格区间内主动买入、主动卖出和方向未知的成交量。可将完整足迹与累计差值下载为 CSV。

在 Recorded footprint 运行查询后展开 Price profiles。比较各价格区间的成交量与有成交的时间段数。设定价值区间目标，并将完整分布下载为 CSV。

在 Relative returns 下展开 Rolling risk。设定 UTC 间隔、窗口长度和波动率缩放周期，查看各标的的可用收益率数量及配对样本数。可将完整滚动研究下载为 CSV。

载入价格后，在 Universe screen 中展开 Correlated portfolio scenarios。设定上市标的权重、随机种子和再平衡费用，查看完整收益覆盖和路径分位数，并将所有路径下载为 CSV。

在 Universe screen 中展开 Cross-sectional paper replay，载入流动性报告。设置首次决策时间和排名参数，然后查看入选标的、订单、现金和成交额，或将完整回放下载为 CSV。

在 Cross-sectional paper replay 中打开 Corporate cash reports 并加载相应的 CSV。运行回放以核对股息资格、付款修订、恢复的持仓和现金凭证，并下载公司行动现金记录。

在 Bar backtest 中展开 Recorded trade execution 并加载成交 CSV。设置生效与获知截止时间，查看延迟部分成交、准确的采集序号、现金和权益，并下载完整凭证和估值历史。

运行排名回放后打开 Cross-sectional walk-forward。比较不同回看长度和标的数的候选方案，查看不重叠的测试结果和缺失估值，并将得分与来源信息导出为 CSV。

选择图表并打开 Time-series formulas。输入 OHLCV 表达式和观测截止时间，查看精确结果与不可用行，并将公式、数据来源、语言版本和结果导出为 CSV。

加载柱状图历史后打开 Formula paper backtest。设置入场和退出表达式及两个截止时间，比较基于柱成交量与逐笔成交的执行，查看不可用信号并导出完整 CSV 凭证。

运行公式回测后下载策略包。在另一个工作区加载它即可恢复双向公式、执行模式和精确的模拟账户设置，再用相同的数据和截止时间核对执行凭证、结束权益并复现结果。

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Fibonacci time zones](../chart-workspace.md#fibonacci-time-zones) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

<!-- section:04 -->
## 导入并回放自己的数据

用 Import CSV 填写市场和代码，选择获准存储的 UTF-8 OHLCV。使用严格递增的 Unix 秒、UTC 日期或以 Z 结尾的 UTC 时间戳。数值至多六位小数，成交量不得为负，最高价和最低价须覆盖开收盘价。任意错误行会拒绝整次导入。在 Series details 填写周期、来源、使用权限和复权策略。

回放要求时间戳为区间起点。在 Historical replay 选标的、提供会话 CSV，并输入 1 至 86,400 的整数秒。每行明确 UTC 开收盘、开盘时的分钟偏移，以及 regular 或 early。时间网格从开盘开始，末段可缩短至收盘。系统拒绝时段外或不在网格上的蜡烛。缺档推进时钟并保留上一个可见值。

默认单文件限 1,500,000 字节和 100,000 根蜡烛，构建时可调整至 8 MiB 和 100,000 行。日历限 1 MiB、10,000 个不重叠时段和 200,000 个事件。浏览器存储配额另行生效。

```csv
time,open,high,low,close,volume
2025-11-28T14:30:00Z,10,12,9,11,200.000001
2025-11-28T15:00:00Z,11,13,10,12,150
```

```csv
date,open_utc,close_utc,utc_offset_minutes,kind
2025-11-28,2025-11-28T14:30:00Z,2025-11-28T18:00:00Z,-300,early
```

[apps/terminal/README.md](../../apps/terminal/README.md) · [crates/core/README.md](../../crates/core/README.md)

<!-- section:05 -->
## 备份、迁移与恢复

用 Workspace backup → Export workspace 保存带版本的 JSON，其中有原始 CSV、来源、可见和隐藏历史、自选顺序、选中标的与指标。目标浏览器配置使用 Backup file 选择文件，核对数量，再按 Restore workspace。目标目录在一个事务中被替换。如需保留目标数据，应先导出。

升级时沿用同一浏览器配置、协议、主机和端口。0.1.0 工作区迁入 IndexedDB，系统回读校验并保留旧值。关闭仍运行旧版的标签页。备份为明文，SHA-256 校验完整性。按数据授权管理存储、访问和保留。

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## 架构与计算规则

Rust 验证标的、UTC 时间和 OHLCV，以整数百万分之一计算并生成会话事件。React 终端运行同一套 Wasm 引擎，使用 Canvas 绘图，IndexedDB 保存事务，服务工作线程缓存静态资源。修订号检测并发写入。状态属于本地的浏览器配置与源站。

SMA 使用精确滚动和，EMA 由首个完整窗口初始化，每一步取整到百万分之一，平分时远离零。回放指标只使用已公布收盘价。历史模型以计划区间末端为可用时间。供应商实际到达、修订和区间内时间戳需要独立输入。回放保留原始行。

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## 部署与运行范围

通过 HTTPS 部署 dist/ 或用回环启动器。同源才保留现有工作区。不同端口、配置或隐私窗口使用不同存储。评估 Tauri 时先构建终端并安装系统依赖。CI 在 Windows Server 2022、macOS 15 与 Ubuntu 24.04 构建，并启动 Linux 窗口验证。移动、ARM、BSD 证据见平台矩阵。验收测试请用桌面 Chromium。

当前运行模式为一个配置对应一个本地用户。数据和备份存放于获准设备。认证、租户隔离、监控、保留期和恢复目标需要独立验证的部署方案。ZIP 含许可声明与 CycloneDX 运行时 SBOM。版本标签工作流包含产物证明。

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## 读取外部服务

TradingBotObserverV1 可查询独立交易服务的 runtime、status、account 和 portfolio。选可信地址，回环之外用 HTTPS，授权令牌由可信进程配置注入。按各自时间戳判断快照。服务健康或空快照无法提供进一步的余额和仓位信息。凭据、订单和执行由外部服务管理。

```js
import { TradingBotObserverV1 } from "@marketweft/trading-bot";

const observer = new TradingBotObserverV1({
  baseUrl: process.env.TRADING_BOT_URL ?? "http://127.0.0.1:8000",
  token: process.env.TRADING_BOT_TOKEN,
});
const snapshot = await observer.account();
console.log(snapshot.observedAt, snapshot.totalBalance, snapshot.currency);
```

[docs/trading-bot.md](../../docs/trading-bot.md) · [trading-bot](https://github.com/Yunushan/trading-bot)

<!-- section:09 -->
## 从源码构建并验证

使用 Node.js 22.12 或更新版本与 npm、rust-toolchain.toml 固定的 Rustup 工具链，以及 Python 3.11 或更新版本。从仓库根目录执行。Vite 输出开发地址，通常用 5173 端口。生产启动器用 4173。运行浏览器验收前安装锁定的 Chromium。

验证包含原生 Rust、Wasm、浏览器、SDK、本地服务、许可、SBOM 和安全公告。对时钟切换、缺档及提前收盘在内的每个事件，将两种均线与批处理前缀逐一比较。CI 等待精确的 ZIP 产物 ID，再按字节校验下载文件。版本一致的标签触发证明。

```sh
git clone https://github.com/Yunushan/marketweft.git
cd marketweft
npm ci
npm run dev
```

```sh
node scripts/build-wasm.mjs
npm run build
node scripts/serve-terminal.mjs
```

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo clippy --locked --target wasm32-unknown-unknown -- -D warnings
cargo test --workspace --locked
node --experimental-strip-types --test scripts/core-wasm.test.mjs
node --test scripts/serve-terminal.test.mjs
npx --no-install playwright install chromium
npm test
cargo fetch --locked --manifest-path apps/desktop/Cargo.toml
python -B scripts/test_supply_chain.py
python -B scripts/supply_chain.py --check
python -B scripts/check_readmes.py
npm audit --audit-level=high
python -B scripts/advisories.py
python -B scripts/package_browser.py
```

[verify.yml](../../.github/workflows/verify.yml) · [docs/native-advisories.md](../../docs/native-advisories.md)

<!-- section:10 -->
## 故障排查与复现

端口占用时用 --port 4174，跨源搬迁数据请用导出恢复。离线启动有问题时先联网打开生产版本并等 Offline ready。若文件被拒绝，核对报错行、区间起点以及市场和日期对应的日历。

保留 CSV、日历、间隔、Git 修订、浏览器版本和事件时间。报告故障时提供合成示例及第一个出错步骤。验证记录列出各平台证据，路线图列出下一步验收目标。

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## 仓库、贡献与许可证

crates/core 存放引擎和样本，apps/terminal 存放浏览器和测试，apps/desktop 存放桌面壳，packages/trading-bot 存放观测 SDK，scripts 存放构建、策略与打包工具。让修改小而可测，保留数据权利与第三方声明，依赖变更后更新清单，私下报告漏洞。

原创代码采用 0BSD，依赖保留各自许可证。完整译本按 Ethnologue 2026 的第一与第二语言使用者总人数选择，并包含四舍五入后并列第 20 位的两种语言。链接的技术手册和应用界面可能为英文。

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
