<!-- MarketWeft README · locale=ja -->

# MarketWeft

**0.3.0 · 0BSD**

**ドキュメントの言語**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · **日本語** · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft の機能

MarketWeft はアナリスト、開発者、運用者向けのローカル優先の調査端末です。利用権がある OHLCV を開き、ローソク足と出来高を表示し、固定小数点で SMA と EMA を計算します。ウォッチリスト、選択銘柄、指標を IndexedDB に保存します。資材のキャッシュ後はオフラインで使えます。同梱の価格と出来高は合成データです。プロバイダーの口座は不要です。

0.3.0 では変更されない一つの時系列を取引セッションに沿って再生できます。別途稼働する trading-bot 用の読み取り専用 TypeScript SDK と、実験段階の Tauri ホストもあります。企業行動、外部フィード、注文、マルチユーザー運用、署名付きインストーラーは計画段階です。

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## ポータブル端末を起動

成功した GitHub 検証実行から browser-terminal-attempt-N をダウンロードし、MarketWeft-browser-0.3.0.zip を展開します。dist/ を serve-terminal.mjs の隣に置き、同じディレクトリで以下のコマンドを実行します。WebAssembly、Canvas、BigInt、IndexedDB 対応のブラウザーで http://127.0.0.1:4173/ を開きます。Node.js 22.12 以上が必要で、npm によるインストールは不要です。切断前に Offline ready を待ちます。

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## NYSE の例を再生

Historical replay で Start demo を選びます。Next event は進む、Previous event は戻る、Play と Pause は連続再生と停止、Reset は表示履歴の初期化です。最初はグラフが空で、足は区間終了時に表示されます。Event time は区間開始またはセッション境界、Observed at は観測可能になる時刻です。速度は表示の進み方だけを変えます。

2025 年 10 月 31 日の 13:30 UTC（UTC−04:00）と 11 月 3 日の 14:30 UTC（UTC−05:00）の寄り付きを比較できます。欠測は 11 月 3 日の 15:00 に始まり 15:30 に判明します。感謝祭に枠はなく、11 月 28 日は 30 分足七本の後、18:00 UTC に早引けします。20 セッション、253 本、294 イベントです。価格と出来高は合成し、取引時間は NYSE の公開情報に基づきます。

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv)

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
