<!-- MarketWeft README · locale=bn -->

# MarketWeft

**0.18.0 · 0BSD**

**নথির ভাষা**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · **বাংলা**
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft কী করে

MarketWeft বিশ্লেষক, ডেভেলপার ও অপারেটরের জন্য স্থানীয় গবেষণা টার্মিনাল। অনুমোদিত OHLCV খুলে ক্যান্ডেল ও ভলিউম দেখায়, নির্দিষ্ট দশমিক এককে SMA ও EMA গণনা করে এবং নজরদারি তালিকা, নির্বাচিত ইন্সট্রুমেন্ট ও সূচক IndexedDB-তে রাখে। সম্পদ ক্যাশ হলে অফলাইনে চলে। সঙ্গে দেওয়া দাম ও ভলিউম কৃত্রিম, অ্যাকাউন্ট লাগে না।

MarketWeft 0.18.0 স্থায়ী স্প্লিট আইডি, কার্যকর সময়ের সংশোধন ও বাতিল যোগ করে। MarketWeft 0.7.0 নির্দিষ্ট সময়ে জানা তথ্য দিয়ে দামের রিটার্ন অনুযায়ী ইউনিভার্স স্ক্রিনিং যোগ করে। সেশনভিত্তিক রিপ্লেতে স্টক স্প্লিট, নগদ লভ্যাংশ, সদস্যপদ এবং তালিকা থেকে বাদ পড়া রয়েছে। আলাদা trading-bot পরিষেবার জন্য শুধু পড়ার TypeScript অবজারভার ও পরীক্ষামূলক Tauri র‍্যাপারও আছে। ডেটা ফিড, অর্ডার, স্বাক্ষরিত ইনস্টলার এবং বহু ব্যবহারকারীর হোস্টিং রোডম্যাপে আছে।

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## বহনযোগ্য টার্মিনাল চালান

সফল GitHub যাচাই থেকে browser-terminal-attempt-N ডাউনলোড করে MarketWeft-browser-0.18.0.zip খুলুন। dist/ ও serve-terminal.mjs এক ফোল্ডারে রেখে সেখানে কমান্ড চালান। WebAssembly, Canvas, BigInt ও IndexedDB সমর্থিত ব্রাউজারে http://127.0.0.1:4173/ খুলুন। Node.js 22.12 বা নতুন চাই। npm ইনস্টল লাগে না। নেট বন্ধের আগে Offline ready দেখুন।

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## NYSE নমুনা চালান

Historical replay থেকে Start demo বাছুন। Next event এগোয়, Previous event ফেরায়, Play ও Pause চলা থামায়, Reset দৃশ্যমান ইতিহাস ফাঁকা করে। চার্ট শুরুতে ফাঁকা। ক্যান্ডেল সময়খণ্ডের শেষে দেখা যায়। Event time শুরু বা সেশন সীমা, Observed at তথ্য পাওয়ার সময়। গতি পর্দায় চলার হার বদলায়।

৩১ অক্টোবর ২০২৫-এ 13:30 UTC (UTC−04:00) খোলে, ৩ নভেম্বর 14:30 UTC (UTC−05:00)। ৩ নভেম্বর 15:00-এর অনুপস্থিত খণ্ড 15:30-এ ধরা পড়ে। Thanksgiving-এ খণ্ড নেই। ২৮ নভেম্বর সাতটি ৩০ মিনিটের ক্যান্ডেলের পর 18:00 UTC-তে আগাম বন্ধ। নমুনায় ২০ সেশন, ২৫৩ ক্যান্ডেল ও ২৯৪ ইভেন্ট, কৃত্রিম মূল্য এবং প্রকাশিত NYSE সময়।

Historical replay → Start split demo খুলে একই ইভেন্টে Price basis-এ Raw ও Split-adjusted বদলান। ২-এর বিনিময়ে ১ পুরোনো শেয়ারের বিভাজন কার্যকর হওয়ার আগে ঘোষণা ও পর্যবেক্ষণ হয়। ততক্ষণ দুই দৃশ্য মেলে। কার্যকর হলে আগের শেষ ক্যান্ডেলের বন্ধ 106.50 থেকে সমন্বিত 53.25 হয় এবং ভলিউম দ্বিগুণ হয়। পরের প্রথম ক্যান্ডেল 53.00 থাকে। নিজের ডেটার জন্য নির্বাচিত ইন্সট্রুমেন্টের Corporate actions CSV ও সেশন ক্যালেন্ডার দিন এবং কাঁচা OHLCV নিশ্চিত করুন। কার্যকর হলে সর্বশেষ দেখা অনুপাত লাগে। দেরির খবর ও সংশোধন দেখার সময় থেকেই দৃশ্য বদলায়। মূল ইতিহাস অক্ষত।

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

প্রতি বণ্টনে ১০০ যোগ্য শেয়ার দেখতে Historical replay → Start dividend demo খুলুন। এক্স-তারিখে USD 25.00 প্রাপ্য হয়। সংশোধিত অঙ্ক USD 30.00 করে, আর নতুন পরিশোধের তারিখ জমার সময় বদলায়। দেরিতে আসা রিপোর্ট পর্যবেক্ষণে EUR 10.00 জমা হয়। পরিশোধের পর সংশোধনে USD 28.00 থাকে। আগের ব্যালান্স দেখতে পিছিয়ে যান। নিজের ক্ষেত্রে Cash dividends CSV আপলোড করে Entitled shares per distribution দিন। সংশোধনে একই বণ্টন ID রাখুন। লেজার মুদ্রা আলাদা রাখে, আগের এন্ট্রি ও মূল দাম অক্ষত থাকে।

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Historical replay → Open universe replay → Start universe demo খুলুন। 14:05 UTC-তে শুধু ALFA সদস্য, 14:10-এ BETA যোগ দেয়। 14:20-এ কার্যকর ALFA-র অপসারণ 14:25-এ জানা যায়। 14:30-এ কার্যকর BETA-র তালিকাচ্যুতি 14:35-এ জানা যায়। আগের সদস্য দেখতে পিছিয়ে যান বা আলাদা Effective time ও Known time দিয়ে অনুসন্ধান করুন। নিজের Universe membership CSV দিন। সংশোধনে পরিবর্তন ID একই রাখুন এবং টিকার পুনর্ব্যবহারে আলাদা তালিকাভুক্তি ID দিন।

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Universe screen-এ Load demo prices নির্বাচন করে ভিত্তি 14:00 UTC রাখুন। 14:05-এ ALFA 1% নিয়ে শীর্ষে। 14:10-এ BETA যোগ দেয়, কিন্তু 14:12-এ সমাপনী দাম জানা পর্যন্ত তার র‍্যাঙ্ক নেই। কার্যকর সময় 14:10 রেখে জানা সময় 14:12 ও 14:16 দিয়ে BETA-র 12% ও সংশোধিত 1% তুলনা করুন। ALFA-র 14:20-এর অপসারণ 14:25-এ জানা গেলে সে বাদ পড়ে। নিজের নির্দিষ্ট সময়ের দাম ব্যবহার করতে লিস্টিং আইডিসহ Universe prices CSV আপলোড করুন। শুরুর বা শেষের দাম না থাকলে সদস্য র‍্যাঙ্ক ছাড়াই দেখা যায়।

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

ডেমো দাম লোড করে Sector heatmap-এ Load demo sectors নির্বাচন করুন। 14:10 UTC-তে জানা ওজনের 60% অন্তর্ভুক্ত। 14:12-তে BETA-র দাম জানা গেলে কভারেজ 100% এবং দেখা অবদান 1.2% থেকে 6% হয়। 14:16-এর সংশোধনে BETA Financials থেকে Technology-তে যায়। র‍্যাঙ্ক, অবদান ও শ্রেণিবিভাগের সময় দেখতে টাইল খুলুন। নিজের রিপোর্টের জন্য Sector and weight CSV আপলোড করুন।

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Historical replay → Open financial statements → Start financial demo খুলুন। Original filing-এ P/E 10×। একই মূল্যায়নের সময়ে Restatement observed-এ P/E 15× এবং সাধারণ ইকুইটি অনুপস্থিত। Revised capitalization-এ P/E 20×। নিজের ইস্যুয়ার ও তথ্য জানার সময় দিয়ে খুঁজতে Annual filings CSV ও ঐচ্ছিক Capitalization CSV আপলোড করুন।

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Historical replay → Open economic calendar → Start calendar demo খুলুন। প্রকাশের আগে পূর্বাভাস 2.5 শতাংশ, প্রকৃত মান অনুপস্থিত। Actual observed-এ 14:32 UTC-তে 2.7 শতাংশ দেখা যায়। Revised actual-এ 2.8 শতাংশ এবং Release evidence-এ দুটি সংশোধনের রেকর্ড আছে। নিজের প্রকাশের জন্য Macro calendar CSV আপলোড করুন।

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Historical replay → Open option chain → Start option demo খুলুন। এপ্রিলের 100 স্ট্রাইকের জোড়ার IV প্রায় 20%। Late option quote-এ 90 স্ট্রাইকের কল 25% IV নিয়ে আসে। Corrected spread-এ একটি পুটের মান হিসাব করা যায়। Implied volatility surface-এ মেয়াদ তুলনা করুন। নিজের কোটের জন্য Underlying CSV ও Option quotes CSV লোড করুন।

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Historical replay → Open replay alerts → Start alert demo খুলুন। First crossing-এ একটি সীমা সতর্কতা আছে। Correction observed-এ সংশোধিত নমুনা ও চলমান গড় অতিক্রম দেখায়। Full alert replay-এ আটটি সতর্কতা। Save to alert inbox দুবার চাপলে প্রথমবার আটটি, দ্বিতীয়বার শূন্য নতুন রেকর্ড জমা হয়। নিজের জন্য Alert rules CSV ও Alert observations CSV লোড করুন।

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Historical replay → Open paper ledger → Start paper demo খুলুন। 503 রিজার্ভ থেকে একটি আংশিক পূরণ পর্যন্ত এগিয়ে দেখুন, যাতে 801.6 নগদ থাকে। বন্ধের পর Final account-এ নগদ 663.7 ও উপলব্ধি করা লাভ 13। নিজস্ব সিমুলেশনের জন্য Paper events CSV লোড করুন।

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Historical replay → Open bar backtest → Start backtest demo খুলুন। 14:05 UTC-তে সংকেত ক্রয় অর্ডার দেয়। 14:06 অনুপস্থিত থাকায় অর্ডার পূরণ হয় না। 14:07-এর বন্ধে দুই শেয়ারের পূরণ হয়। Final backtest-এ ইকুইটি 957.8। স্থানীয় ইতিহাসের জন্য সেশন ও বার CSV লোড করুন।

ব্যাকটেস্ট ডেমোতে ছয়টি প্রশিক্ষণ বার ও দুটি পরীক্ষার বার দিয়ে Walk-forward validation চালান। প্রথম পূর্ণ পর্ব 14:09 UTC-তে দেখা যায়। প্রশিক্ষণে 1:2 জেতে এবং নতুন অ্যাকাউন্ট থেকে শুরু হওয়া দুই পরীক্ষার বারেই সেই জোড়া থাকে।

বার ব্যাকটেস্ট ডেমোতে 20250403 সিড, 256টি পথ এবং প্রতি পথে আটটি পরিবর্তন দিয়ে Seeded scenarios চালান। ভিত্তি ইকুইটির শেষ মান 957.8 এবং পরিস্থিতিগুলোর মধ্যক 997.6। একই কাটঅফ, ইনপুট ও সিডে ঝুঁকির ছক একই থাকে।

ইউনিভার্স ডেমোতে BETA-001-এর জন্য Delisting proceeds লোড করুন এবং দুই কাটঅফ 14:35 UTC-তে রাখুন। তখন প্রাপ্য অজানা। 14:37-তে দশ শেয়ারের জন্য 70 USD প্রাপ্য হয়, আর 14:50-তে নগদ খাতায় ওঠে। পরের সংশোধন আগের ফল বজায় রাখে এবং BETA-002 আলাদা থাকে।

Start split revisions demo খুলে Split-adjusted বেছে নিন। ৩ জুন 14:10 UTC-তে কার্যকর সময় বদলালে আগের সমন্বয় সরে যায়। 14:20-তে দুই আইডির অনুপাত একসঙ্গে প্রয়োগ হয়। 14:30-তে SPLIT-A বাতিল হলে SPLIT-B ও মূল ক্যান্ডেল অক্ষত থাকে।

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv)

<!-- section:04 -->
## নিজের তথ্য আমদানি ও পুনরায় চালান

Import CSV-তে বাজার ও প্রতীক দিয়ে অনুমোদিত UTF-8 OHLCV বাছুন। ক্রমবর্ধমান Unix সেকেন্ড, UTC তারিখ বা Z-শেষ UTC সময় দিন। ছয় দশমিক, ঋণাত্মক নয় এমন ভলিউম এবং খোলা ও বন্ধকে ঘিরে সর্বোচ্চ ও সর্বনিম্ন দাম দিন। ভুল সারি পুরো আমদানি বাতিল করে। Series details-এ বিরতি, উৎস, ব্যবহারাধিকার ও সমন্বয় নীতি লিখুন।

ক্যান্ডেলকে খণ্ডের শুরুর সময় দিন। Historical replay-তে ইন্সট্রুমেন্ট, সেশন CSV এবং পূর্ণ সেকেন্ড (১–৮৬,৪০০) দিন। সারিতে সঠিক UTC সীমানা, খোলার মিনিট অফসেট এবং regular বা early রাখুন। গ্রিড খোলা থেকে শুরু, শেষ খণ্ড ছোট হতে পারে। সেশন বা গ্রিডের বাইরের ক্যান্ডেল প্রত্যাখ্যাত হয়। ফাঁক ঘড়ি এগোয় এবং আগের দৃশ্যমান মূল্য রাখে।

ডিফল্টে ফাইলপ্রতি ১,৫০০,০০০ বাইট ও ১০০,০০০ ক্যান্ডেল। বিল্ডে 8 MiB ও ১০০,০০০ সারি পর্যন্ত। ক্যালেন্ডারে 1 MiB, ১০,০০০ পৃথক খণ্ড ও ২০০,০০০ ইভেন্ট। ব্রাউজারের কোটা আলাদা।

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
## ব্যাকআপ, স্থানান্তর ও পুনরুদ্ধার

Workspace backup → Export workspace সংস্করণযুক্ত JSON-এ মূল CSV, উৎস, দৃশ্যমান ও লুকানো ইতিহাস, তালিকার ক্রম, নির্বাচন ও সূচক রাখে। গন্তব্য প্রোফাইলে Backup file বাছুন, যাচাইকৃত সংখ্যা দেখে Restore workspace চাপুন। এক লেনদেন গন্তব্য ক্যাটালগ বদলায়। পুরোনো গন্তব্য লাগলে আগে রপ্তানি করুন।

আপগ্রেডে একই স্কিম, হোস্ট, পোর্ট ও প্রোফাইল রাখুন। 0.1.0 থেকে IndexedDB-তে স্থানান্তর লিখে আবার পড়ে যাচাই করে, মূল মানও রাখে। পুরোনো ট্যাব বন্ধ করুন। ব্যাকআপ সরল পাঠ্য। SHA-256 অখণ্ডতা যাচাই করে। অনুমতি মেনে প্রবেশাধিকার, সংরক্ষণ ও মেয়াদ ঠিক করুন।

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## স্থাপত্য ও গণনার নিয়ম

Rust পরিচয়, UTC এবং OHLCV যাচাই করে, পূর্ণসংখ্যায় দশ লক্ষ ভাগের এক ভাগে গণনা করে এবং সেশন পরিকল্পনা বানায়। React একই Wasm, আঁকার Canvas, লেনদেনের IndexedDB ও ক্যাশের service worker ব্যবহার করে। রিভিশন সমসাময়িক লেখা শনাক্ত করে। অবস্থা প্রোফাইল ও উৎসভিত্তিক।

SMA সঠিক চলমান যোগফল নেয়। EMA প্রথম পূর্ণ উইন্ডো থেকে শুরু, প্রতি ধাপে দশ লক্ষ ভাগের এক ভাগে রাউন্ড হয়, সমান দূরত্বে শূন্য থেকে দূরে। পুনরাবৃত্তি প্রকাশিত বন্ধমূল্য ব্যবহার করে। খণ্ড শেষই প্রাপ্যতার সময়। সরবরাহকারীর আগমন, সংশোধন ও খণ্ডের ভেতরের সময়ের জন্য আলাদা ইনপুট চাই। মূল সারি অক্ষত।

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## স্থাপন ও পরিচালনার পরিধি

dist/ HTTPS-এ দিন বা loopback চালু করুন। কর্মক্ষেত্রের জন্য একই উৎস রাখুন। আলাদা পোর্ট, প্রোফাইল বা ব্যক্তিগত উইন্ডোর স্টোরেজ ভিন্ন। Tauri চালাতে ওয়েব বিল্ড ও সিস্টেম পূর্বশর্ত নিন। CI Windows Server 2022, macOS 15 ও Ubuntu 24.04-এ তৈরি করে এবং Linux উইন্ডো যাচাই করে। মোবাইল, ARM ও BSD ম্যাট্রিক্সে আছে। ডেস্কটপ Chromium-এ পরীক্ষা করুন।

এক প্রোফাইলে এক স্থানীয় ব্যবহারকারী। অনুমোদিত যন্ত্রে তথ্য ও ব্যাকআপ রাখুন। প্রমাণীকরণ, ব্যবহারকারী বিচ্ছিন্নতা, পর্যবেক্ষণ, ধারণকাল ও পুনরুদ্ধারের লক্ষ্য আলাদা যাচাইকৃত নকশা চায়। ZIP-এ লাইসেন্স নোটিশ ও CycloneDX SBOM আছে। রিলিজ ট্যাগে প্রমাণীকরণের ধাপ আছে।

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## বাইরের সেবা পর্যবেক্ষণ

TradingBotObserverV1 আলাদা trading-bot-এর runtime, status, account ও portfolio পড়ে। বিশ্বস্ত অরিজিন, loopback-এর বাইরে HTTPS ও প্রক্রিয়ার কনফিগারেশন থেকে অনুমোদিত টোকেন নিন। স্ন্যাপশটের নিজস্ব সময় দেখুন। ফাঁকা হিসাব বা সুস্থ সেবা বাড়তি ব্যালান্স বা পজিশনের প্রমাণ নয়। পরিচয়পত্র, অর্ডার ও কার্যকর করা বাহ্যিক সেবার অধীনে।

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
## সোর্স থেকে বিল্ড ও যাচাই

Node.js 22.12 বা নতুন, npm, rust-toolchain.toml-নির্ধারিত Rustup ও Python 3.11 বা নতুন ব্যবহার করুন। রিপোজিটরির মূল থেকে চালান। Vite উন্নয়ন URL সাধারণত 5173, উৎপাদন 4173। পরীক্ষার আগে নির্ধারিত Chromium ইনস্টল করুন।

Rust, Wasm, ব্রাউজার, SDK, স্থানীয় সার্ভার, লাইসেন্স, SBOM ও নিরাপত্তা নোটিশ যাচাই হয়। সময় পরিবর্তন, ফাঁক ও আগাম বন্ধসহ প্রতি ইভেন্টে দুই গড়কে ব্যাচের সমান দৈর্ঘ্যের শুরুর অংশের সঙ্গে মেলানো হয়। CI ZIP-এর নির্দিষ্ট ID অপেক্ষা করে এবং ডাউনলোডের বাইট মেলায়। রিলিজ ট্যাগ সংস্করণের সঙ্গে মিললে প্রত্যয়ন চালু হয়।

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
## সমস্যা নির্ণয় ও পুনরুৎপাদন

পোর্ট ব্যস্ত হলে --port 4174 নিন, এবং উৎস বদলাতে রপ্তানি ও পুনরুদ্ধার করুন। অফলাইন সমস্যায় উৎপাদন বিল্ড প্রথমে অনলাইনে খুলে Offline ready দেখুন। প্রত্যাখ্যানে ত্রুটির সারি, খণ্ডের শুরু এবং বাজার ও তারিখের ক্যালেন্ডার পরীক্ষা করুন।

CSV, ক্যালেন্ডার, বিরতি, Git রিভিশন, ব্রাউজার ও ইভেন্টের সময় রাখুন। কৃত্রিম নমুনা ও প্রথম ব্যর্থ ধাপ দিয়ে জানান। যাচাই রেকর্ডে প্ল্যাটফর্ম প্রমাণ ও রোডম্যাপে পরের লক্ষ্য আছে।

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## রিপোজিটরি, অবদান ও লাইসেন্স

ইঞ্জিন ও নমুনা crates/core-এ, ব্রাউজার ও পরীক্ষা apps/terminal-এ, হোস্ট apps/desktop-এ, SDK packages/trading-bot-এ, টুল scripts-এ। ছোট পরীক্ষিত পরিবর্তন দিন। অধিকার ও নোটিশ রাখুন, নির্ভরতা বদলালে তালিকা হালনাগাদ করুন এবং দুর্বলতা ব্যক্তিগতভাবে জানান।

মূল কোড 0BSD, নির্ভরতার নিজস্ব লাইসেন্স আছে। পূর্ণ সংস্করণ Ethnologue 2026-এর প্রথম ও দ্বিতীয় ভাষার মোট বক্তা অনুসারে, গোল করা হিসাবে বিশতম স্থানে থাকা দুই ভাষাসহ। সংযুক্ত নির্দেশিকা ও ইন্টারফেস ইংরেজি হতে পারে।

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
