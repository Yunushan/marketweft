<!-- MarketWeft README · locale=ja -->

# MarketWeft

**0.99.0 · 0BSD**

**ドキュメントの言語**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · **日本語** · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft の機能

MarketWeft はアナリスト、開発者、運用者向けのローカル優先の調査端末です。利用権がある OHLCV を開き、ローソク足と出来高を表示し、固定小数点で SMA と EMA を計算します。ウォッチリスト、選択銘柄、指標を IndexedDB に保存します。資材のキャッシュ後はオフラインで使えます。同梱の価格と出来高は合成データです。プロバイダーの口座は不要です。

MarketWeft 0.99.0 指定時点のオプションチェーンを認証付きで調査用 REST サービスから取得できるようにします。 MarketWeft 0.7.0 は、照会時点で利用可能な情報に基づき、価格リターンでユニバースを順位付けします。取引セッション単位のリプレイは、株式分割、現金配当、構成銘柄の変更、上場廃止に対応します。独立した trading-bot サービスの読み取り専用 TypeScript オブザーバーと、実験的な Tauri ラッパーも含まれます。データ配信、注文、署名済みインストーラー、マルチユーザー運用はロードマップに残っています。

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## ポータブル端末を起動

成功した GitHub 検証実行から browser-terminal-attempt-N をダウンロードし、MarketWeft-browser-0.99.0.zip を展開します。dist/ を serve-terminal.mjs の隣に置き、同じディレクトリで以下のコマンドを実行します。WebAssembly、Canvas、BigInt、IndexedDB 対応のブラウザーで http://127.0.0.1:4173/ を開きます。Node.js 22.12 以上が必要で、npm によるインストールは不要です。切断前に Offline ready を待ちます。

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## NYSE の例を再生

Historical replay で Start demo を選びます。Next event は進む、Previous event は戻る、Play と Pause は連続再生と停止、Reset は表示履歴の初期化です。最初はグラフが空で、足は区間終了時に表示されます。Event time は区間開始またはセッション境界、Observed at は観測可能になる時刻です。速度は表示の進み方だけを変えます。

2025 年 10 月 31 日の 13:30 UTC（UTC−04:00）と 11 月 3 日の 14:30 UTC（UTC−05:00）の寄り付きを比較できます。欠測は 11 月 3 日の 15:00 に始まり 15:30 に判明します。感謝祭に枠はなく、11 月 28 日は 30 分足七本の後、18:00 UTC に早引けします。20 セッション、253 本、294 イベントです。価格と出来高は合成し、取引時間は NYSE の公開情報に基づきます。

Historical replay → Start split demo を開き、同じイベントで Price basis の Raw と Split-adjusted を切り替えます。2 対 1 の分割は発効前に公表され、観測されます。それまでは両方の表示が一致します。発効すると直前の終値が未調整の 106.50 から調整後の 53.25 に変わり、出来高は倍になります。発効後の最初の足は 53.00 のままです。独自データでは銘柄の Corporate actions CSV とカレンダーを選び、OHLCV が未調整であると確認します。発効後、観測済みの最新比率を適用します。遅れて届いた報告や訂正の反映は観測時からです。元の履歴は保持されます。

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Historical replay → Start dividend demo を開くと、各配当を受け取る資格がある 100 株の例を確認できます。権利落ち日に USD 25.00 の未収金が生じます。金額の改定で USD 30.00 になり、支払日の改定で入金が遅れます。遅着した報告は観測時に EUR 10.00 を計上します。支払後の訂正で米ドルの現金は USD 28.00 になります。巻き戻すと過去の残高を確認できます。独自データでは Cash dividends CSV と Entitled shares per distribution を指定し、改定で同じ配当 ID を使います。台帳は通貨を分け、過去の仕訳と元の価格を保持します。

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Historical replay → Open universe replay → Start universe demo を開きます。14:05 UTC は ALFA のみで、14:10 に BETA が加わります。14:20 の ALFA の除外は 14:25、14:30 の BETA の上場廃止は 14:35 に判明します。巻き戻すか、Effective time と Known time を別々に設定して照会します。独自データには Universe membership CSV を使います。修正時は変更 ID を維持し、ティッカーが再利用されたときは別の上場 ID を指定します。

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Universe screen で Load demo prices を選び、基準時刻を 14:00 UTC にします。14:05 には ALFA が 1% で首位です。BETA は 14:10 に加わり、14:12 に終値が判明するまで順位が付きません。有効時刻を 14:10 とし、既知時刻を 14:12 と 14:16 に変えると、BETA の 12% が訂正後に 1% になります。有効時刻 14:20 では、除外が判明する 14:25 に ALFA が外れます。独自データには上場 ID と正確な時刻の終値を含む Universe prices CSV をアップロードします。基準または対象の終値が欠ける場合は順位が付きません。

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

デモ価格を読み込み、Sector heatmap で Load demo sectors を選びます。14:10 UTC のカバレッジは既知ウェイトの 60% です。14:12 に BETA の価格が判明すると 100% になり、観測済みの寄与は 1.2% から 6% に上がります。14:16 の訂正で BETA は Financials から Technology に移ります。タイルを開くと順位、寄与、分類時刻が見られます。独自データには Sector and weight CSV をアップロードします。

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Historical replay → Open financial statements → Start financial demo を開きます。Original filing の P/E は 10 倍です。同じ評価時刻で Restatement observed を選ぶと P/E は 15 倍になり、普通株主資本の欠損が表示されます。Revised capitalization では P/E は 20 倍です。独自の発行体と既知時刻を調べるには、Annual filings CSV と任意の Capitalization CSV をアップロードします。

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Historical replay → Open economic calendar → Start calendar demo を開きます。発表前は予測 2.5% が表示され、実績値はありません。Actual observed では 14:32 UTC に 2.7% を確認できます。Revised actual では 2.8% と表示され、Release evidence で 2 回の改定を追跡できます。独自データは Macro calendar CSV で読み込みます。

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Historical replay → Open option chain → Start option demo を開きます。4月満期で権利行使価格100の組は IV が約20%です。Late option quote で権利行使価格90のコールが IV 25% で表示され、Corrected spread でプットの評価が可能になります。Implied volatility surface で満期を比較できます。独自のデータには Underlying CSV と Option quotes CSV を読み込みます。

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Historical replay → Open replay alerts → Start alert demo を開きます。First crossing はしきい値アラートを1件表示します。Correction observed は訂正値と移動平均とのクロスを表示します。Full alert replay の結果は8件です。Save to alert inbox を2回実行すると初回は8件、次回は0件を新規保存します。独自データには Alert rules CSV と Alert observations CSV を読み込みます。

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Historical replay → Open paper ledger → Start paper demo を開きます。503 の現金予約から進めると、1件の部分約定で残高が 801.6 になります。停止後の Final account は現金 663.7、実現利益 13 です。独自の模擬注文や約定を再生するには Paper events CSV を読み込みます。

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Historical replay → Open bar backtest → Start backtest demo を開きます。14:05 UTC のシグナルで買い注文を出します。14:06 は欠損のため約定できず、14:07 の終値で2株が約定します。Final backtest の純資産は957.8です。独自履歴にはセッションとバーの CSV を読み込みます。

バックテストのデモで学習バー6本とテストバー2本のまま Walk-forward validation を実行します。最初の完全な区間は 14:09 UTC に表示されます。学習で選ばれた 1:2 をテストの2本で固定し、テストは新しい口座で始まります。

バックテストのデモでシード 20250403、256 パス、パスごとに8回の変動を指定して Seeded scenarios を実行します。基準の期末純資産は 957.8、シナリオの中央値は 997.6 です。締切時刻、入力、シードが同じなら同じリスク表を再現できます。

銘柄集合のデモで BETA-001 の Delisting proceeds を読み込み、両方の締切を 14:35 UTC に設定すると受取額は未確認です。14:37 に10株分の70 USDが未収金となり、14:50 に入金を記録します。後続の修正は以前の結果に影響せず、BETA-002 は別の銘柄として扱います。

Start split revisions demo を開いて Split-adjusted を選びます。6月3日 14:10 UTC に発効時刻の訂正で旧調整が外れます。14:20 に二つの比率が合成されます。14:30 に SPLIT-A が取り消されても SPLIT-B と元の足は維持されます。

Start dividend entitlement demo を開きます。ALPHA は100株から始まり、遅延報告により120株になります。BETA は40株です。支払い後に ALPHA が110株に訂正されると3 USDを取り消します。巻き戻すと以前の残高を確認できます。

銘柄集合のデモで Portfolio replay を読み込みます。BETA-001 の14:10 UTC 終値は14:12に観測されます。14:45には70 USDの未収金と BETA-002 の225 EURの評価額が別々に表示され、14:50の株式評価額と入金額の合計は284 USDです。

Compare charts から比較対象を選びます。Link by UTC は両方のペインで同じ表示中の時刻を示します。各ペインは別々に拡大できます。ワークスペースのバックアップに銘柄、指標、連動設定が保存されます。

Draw measurement を選び、各端点に既存の UTC の足と価格を指定します。拡大縮小や横移動の際は保存済みの座標で線を描き直します。バックアップには座標が含まれ、アプリには経過秒数、価格差、変化率が表示されます。

Indicators を開き、各ペインの SMA と EMA の期間を足の本数で設定します。終値が十分にそろうと、選択した UTC の足に対する値を表示します。銘柄の切り替え、再読み込み、バックアップからの復元でも設定は引き継がれます。

チャートの下にある Export CSV を開きます。再インポート用の OHLCV データをダウンロードするか、分析用に出所情報と有効な移動平均を含めます。終値が十分にそろうまで、平均値の欄は空欄になります。

各ペインのチャート種類で Close line を選びます。折れ線は観測された終値を使い、出来高と有効な指標も表示します。該当する UTC の足がなければ連動カーソルは表示されません。バックアップには選択した種類が保存されます。

OHLC bars を選ぶと、縦線が高値と安値、左の目盛りが始値、右の目盛りが終値を示します。各ペインは独自の種類を保持し、連動カーソルは正確な UTC の足に合わせます。

どちらかのペインで Timeframe を開き、元と集約先の間隔を秒で入力します。チャートと分析用 CSV で収録状況を確認できます。バックアップには元の系列が残ります。

Timeframe にセッションカレンダーの CSV を追加します。各取引日の開始時刻を基準に時間足を作り、最後の足は指定された終了時刻で区切ります。分析用 CSV はカレンダー名と元の足の収録状況を記録します。

Recorded tick bars で約定件数と観測の締切時刻を指定します。同じ時刻の約定は収録順を保ち、未完成の足は区別して表示します。エクスポートには正確な連番の範囲が入ります。

Portfolio replay で配当デモを読み込むか CSV を追加します。権利落ち日前の保有数を用い、支払日に決済し、訂正は記録された観測時刻に反映します。

価格を読み込んだら Universe screen の Relative returns を開きます。二つの上場 ID と正確な UTC 基準時刻を選びます。ユニバースの照会時刻を切り替えて終値の欠損や訂正を確認し、比較結果の全件を CSV で保存します。

Recorded market depth を開き、選択した銘柄の板情報 CSV を読み込みます。観測時刻を進めて買い板と売り板の価格水準、連番の欠落、次のスナップショットでの復旧を確認します。全水準を CSV で保存できます。

Recorded footprint を開き、選択した銘柄の約定を読み込みます。約定期間と観測時点を指定し、価格帯ごとの買い、売り、不明の出来高を確認します。全価格帯と累積デルタを CSV で保存できます。

Recorded footprint で照会を実行してから Price profiles を開きます。価格帯ごとの出来高と、各価格帯で約定があった時間区分の数を比較します。バリューエリアの目標を設定し、全プロファイルを CSV で保存します。

Relative returns の下で Rolling risk を開きます。UTC の間隔、ウィンドウの長さ、ボラティリティの倍率を指定し、銘柄ごとの利用可能な収益率とペアの件数を確認します。全結果を CSV で保存できます。

価格を読み込んだら、Universe screen の Correlated portfolio scenarios を開きます。銘柄ウェイト、シード、リバランス手数料を指定します。全銘柄にそろったリターンの件数とパスの分位点を確認し、全パスを CSV で保存します。

Universe screen の Cross-sectional paper replay を開いて流動性レポートを読み込みます。最初の判定時刻と順位付け条件を設定し、選定銘柄、注文、現金、売買代金を確認するか、全履歴を CSV でダウンロードします。

Cross-sectional paper replay の Corporate cash reports を開き、該当の CSV を読み込みます。再生して権利株数、支払条件の修正、復元されたポジション、入出金明細を確認し、現金記録を CSV で保存します。

Bar backtest の Recorded trade execution を開いて取引 CSV を読み込みます。執行と観測の締切を設定し、遅れて届いた部分約定、正確な記録番号、現金と純資産を確認して、履歴全体を CSV で保存します。

順位の再生後に Cross-sectional walk-forward を開きます。参照期間と銘柄数を比較し、重複しない検証結果と欠落した評価を確認して、スコアとデータ出所を CSV に出力します。

チャートを選択して Time-series formulas を開きます。OHLCV 式と観測の締切を設定し、正確な値や欠損行を確認して、式、出所、言語バージョン、結果を CSV に出力します。

バー履歴を読み込んで Formula paper backtest を開きます。エントリーと決済の式、二つの締切時刻を設定します。バー出来高と記録済み取引による約定を比較し、履歴を CSV に出力します。

完了した数式バックテストから戦略パッケージをダウンロードします。別のワークスペースに読み込んで両方の式、執行方式、正確な口座設定を復元し、同じデータと締切で結果を再現します。

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Local REST](../local-rest-research.md) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots)

<!-- section:04 -->
## 独自データを取り込み再生

Import CSV で取引所と銘柄を指定し、保存権限がある UTF-8 OHLCV を選びます。Unix 秒、UTC 日付、または末尾が Z の UTC 時刻を厳密な昇順にします。小数六桁までで、出来高は非負、始値と終値は高値と安値の間に収めます。不正行があれば全体が拒否されます。Series details に間隔、出所、利用権、調整方針を記録できます。

再生用の時刻は区間開始にそろえます。Historical replay で銘柄、セッション CSV、整数秒の間隔（1～86,400）を指定します。UTC の始終時刻、開始時のオフセット分、regular または early を入力します。区間は開始時刻を基準とし、最終区間は早く終わる場合があります。取引時間外や格子外の足は拒否します。欠測では時計だけが進み、それまでの値が残ります。

初期の上限は一ファイル 1,500,000 バイトと 100,000 本です。ビルド設定で 8 MiB と 100,000 行まで指定できます。カレンダーは 1 MiB、重複のない 10,000 区間、200,000 イベントまでです。ブラウザーの容量制限も適用されます。

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
## バックアップ、移行、復元

Workspace backup → Export workspace で元の CSV、由来、非表示を含む履歴、並び順、選択、指標を含むバージョン付き JSON を出力します。移行先で Backup file を開き、件数を確認して Restore workspace を選択します。一つのトランザクションで移行先の内容を置き換えます。保存が必要な移行先は先に書き出します。

更新時はプロファイル、スキーム、ホスト、ポートを維持します。0.1.0 のデータは IndexedDB に移行し、読み戻し確認を行って元の値を保持します。旧版のタブを閉じます。バックアップは平文です。SHA-256 が整合性を検証します。利用権に沿って保存場所、アクセス、保持期間を管理します。

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## アーキテクチャと数値処理

Rust は銘柄、UTC、OHLCV を検証し、整数の百万分の一単位で計算してイベント計画を作ります。React は同じ Wasm を使います。Canvas が描画し、IndexedDB がトランザクションを扱い、サービスワーカーが資材をキャッシュします。改訂番号で競合を検出します。状態はプロファイルとオリジンに属します。

SMA は厳密な移動和を使います。EMA は最初にそろった窓から始まり、各段階で百万分の一に丸め、同距離ならゼロから離れる方を採ります。再生は観測済み終値のみを使います。区間終了がモデル上の可用時刻です。配信到着、訂正、区間内時刻を扱うには別情報が必要です。元の行は保持されます。

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## 配備と運用範囲

dist/ を HTTPS で配信するか、ループバック起動を使います。同一オリジンを維持します。ポート、プロファイル、プライベートウィンドウが違えば別の保存領域です。Tauri は端末をビルドし、システムの前提条件を導入して評価します。CI は Windows Server 2022、macOS 15、Ubuntu 24.04 でビルドし、Linux ウィンドウを確認します。モバイル、ARM、BSD は対応表を参照してください。ブラウザーテストにはデスクトップ Chromium を使います。

現在はプロファイルごとに一人で使う設計です。データとバックアップは承認済みの機器に置きます。認証、テナント分離、監視、保存期間、復旧目標は別途検証が必要です。ZIP にはライセンス通知と CycloneDX SBOM が入り、バージョンタグのワークフローに証明処理があります。

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## 外部サービスの観測

TradingBotObserverV1 は別途構成された trading-bot の runtime、status、account、portfolio を読み取ります。信頼できるオリジン、ループバック外の HTTPS、プロセス構成から渡す許可済みトークンを使います。各スナップショットの時刻を確認します。空の口座や正常稼働だけでは残高やポジションは分かりません。認証情報、注文、執行は外部サービスの責務です。

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
## ソースからビルドして検証

Node.js 22.12 以上と npm、rust-toolchain.toml に固定した Rustup ツールチェーン、Python 3.11 以上を使い、ルートから実行します。Vite の開発用 URL は通常ポート 5173 です。本番は 4173 です。テスト前に指定の Chromium を入れます。

ネイティブ Rust、Wasm、ブラウザー、SDK、配信、ライセンス、SBOM、アドバイザリーを検証します。夏時間切替、欠測、早引けを含むすべてのイベントで二つの移動平均をバッチ結果の先頭部分と比較します。CI は ZIP の ID を待ち、ダウンロードしたバイト列を照合します。バージョンに合うタグのみ証明処理を起動します。

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
## 障害調査と再現

ポートが埋まっている場合は --port 4174 を使い、別オリジンへの移行はエクスポートと復元で行います。オフライン起動の前に本番ビルドをオンラインで開き、Offline ready を待ちます。取り込みに失敗したら行番号、区間開始、取引所と対象日付のカレンダーを確認します。

CSV、カレンダー、間隔、Git リビジョン、ブラウザー、イベント時刻を保存します。障害報告には合成データによる例と最初に失敗した手順を添えます。検証記録で対象環境を、ロードマップで次の受入条件を確認できます。

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## リポジトリ、貢献、ライセンス

エンジンとフィクスチャーは crates/core、端末とテストは apps/terminal、ホストは apps/desktop、SDK は packages/trading-bot、ツールは scripts です。小さくテスト可能な変更を作り、利用権と通知を維持し、依存変更時は一覧を更新してください。脆弱性は非公開で報告します。

独自コードは 0BSD で、依存関係は個別のライセンスに従います。各完全版の選定は Ethnologue 2026 の第一・第二言語話者の合計に基づき、丸め後に 20 位で並ぶ二言語が含まれます。リンク先の技術文書や画面は英語の場合があります。

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
