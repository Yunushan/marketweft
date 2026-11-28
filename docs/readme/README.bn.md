<!-- MarketWeft README · locale=bn -->

# MarketWeft

**0.294.0 · 0BSD**

**নথির ভাষা**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · **বাংলা**
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft কী করে

MarketWeft বিশ্লেষক, ডেভেলপার ও অপারেটরের জন্য স্থানীয় গবেষণা টার্মিনাল। অনুমোদিত OHLCV খুলে ক্যান্ডেল ও ভলিউম দেখায়, নির্দিষ্ট দশমিক এককে SMA ও EMA গণনা করে এবং নজরদারি তালিকা, নির্বাচিত ইন্সট্রুমেন্ট ও সূচক IndexedDB-তে রাখে। সম্পদ ক্যাশ হলে অফলাইনে চলে। সঙ্গে দেওয়া দাম ও ভলিউম কৃত্রিম, অ্যাকাউন্ট লাগে না।

MarketWeft 0.294.0 নির্ভুল ফিট করা বন্ধদাম ও প্রতি পেনের আলাদা সময়সীমাসহ ন্যূনতম বর্গ চলমান গড় যোগ করে। MarketWeft 0.7.0 নির্দিষ্ট সময়ে জানা তথ্য দিয়ে দামের রিটার্ন অনুযায়ী ইউনিভার্স স্ক্রিনিং যোগ করে। সেশনভিত্তিক রিপ্লেতে স্টক স্প্লিট, নগদ লভ্যাংশ, সদস্যপদ এবং তালিকা থেকে বাদ পড়া রয়েছে। আলাদা trading-bot পরিষেবার জন্য শুধু পড়ার TypeScript অবজারভার ও পরীক্ষামূলক Tauri র‍্যাপারও আছে। ডেটা ফিড, অর্ডার, স্বাক্ষরিত ইনস্টলার এবং বহু ব্যবহারকারীর হোস্টিং রোডম্যাপে আছে।

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md) · [Least Squares Moving Average](../chart-workspace.md#least-squares-moving-average) · [Equity target research SDKs](../portfolio-replay.md#equity-target-research-sdks)

<!-- section:02 -->
## বহনযোগ্য টার্মিনাল চালান

সফল GitHub যাচাই থেকে browser-terminal-attempt-N ডাউনলোড করে MarketWeft-browser-0.294.0.zip খুলুন। dist/ ও serve-terminal.mjs এক ফোল্ডারে রেখে সেখানে কমান্ড চালান। WebAssembly, Canvas, BigInt ও IndexedDB সমর্থিত ব্রাউজারে http://127.0.0.1:4173/ খুলুন। Node.js 22.12 বা নতুন চাই। npm ইনস্টল লাগে না। নেট বন্ধের আগে Offline ready দেখুন।

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md) · [Linux native verification](../../docs/platforms.md#linux-native-verification) · [Ubuntu desktop package](../../docs/platforms.md#ubuntu-desktop-package) · [Ubuntu upgrade verification](../../docs/platforms.md#verify-an-ubuntu-package-upgrade) · [Ubuntu package provenance](../../docs/platforms.md#verify-ubuntu-package-provenance)

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

Start dividend entitlement demo খুলুন। ALPHA প্রথমে 100 শেয়ারে যোগ্য, দেরিতে প্রতিবেদন এলে 120 হয়। BETA-র জন্য 40 শেয়ার ধরা হয়। পেমেন্টের পরে ALPHA 110 শেয়ারে সংশোধন হলে 3 USD ফেরত যায়। আগের ব্যালেন্স দেখতে পেছনে যান।

ইউনিভার্স ডেমোতে Portfolio replay লোড করুন। BETA-001-এর 14:10 UTC বন্ধের দাম 14:12-তে জানা যায়। 14:45-তে তার 70 USD প্রাপ্য BETA-002-এর 225 EUR শেয়ার মূল্য থেকে আলাদা। 14:50-তে শেয়ার ও তালিকাচ্যুতির নগদ মিলে 284 USD।

Compare charts বেছে নিয়ে তুলনার ইন্সট্রুমেন্ট নির্বাচন করুন। Link by UTC দুই প্যানে একই দৃশ্যমান সময় দেখায়। প্রতিটি প্যান আলাদা করে জুম করুন। ওয়ার্কস্পেস ব্যাকআপ দুই ইন্সট্রুমেন্ট, ওভারলে ও সংযোগ সেটিং রাখে।

Draw measurement বেছে প্রতিটি প্রান্তের জন্য বিদ্যমান UTC বার ও দাম নির্বাচন করুন। জুম বা প্যান করলে সংরক্ষিত রেখা নতুন অবস্থানে আঁকা হয়। ওয়ার্কস্পেস ব্যাকআপে স্থানাঙ্ক থাকে। অ্যাপ অতিবাহিত সেকেন্ড, দামের পরিবর্তন ও শতকরা পরিবর্তন দেখায়।

Indicators খুলে প্রতিটি প্যানের SMA ও EMA পিরিয়ড বারের সংখ্যায় সেট করুন। পর্যাপ্ত বন্ধ দাম পাওয়া গেলে চার্ট নির্বাচিত UTC বারের মান দেখায়। ইন্সট্রুমেন্ট বদল, পুনরায় লোড ও ব্যাকআপ পুনরুদ্ধারের পরও পিরিয়ড থাকে।

চার্টের নিচে Export CSV খুলুন। পুনরায় আমদানির জন্য OHLCV বার ডাউনলোড করুন অথবা গবেষণার জন্য উৎসের তথ্য ও চালু চলমান গড় যোগ করুন। পর্যাপ্ত বন্ধ দাম না পাওয়া পর্যন্ত গড় খালি থাকে।

যেকোনো প্যানের ধরন থেকে Close line বেছে নিন। রেখাটি পর্যবেক্ষিত বন্ধ দাম ব্যবহার করে এবং ভলিউম ও চালু সূচক রাখে। অনুপস্থিত UTC বারে সংযুক্ত ক্রসহেয়ার দেখা যায় না। ব্যাকআপ চার্টের ধরন সংরক্ষণ করে।

OHLC bars বেছে নিলে উল্লম্ব রেখায় সর্বোচ্চ ও সর্বনিম্ন দাম, বাঁয়ে খোলার দাম ও ডানে বন্ধের দাম দেখা যায়। প্রতিটি প্যান নিজস্ব ধরন রাখে এবং সংযুক্ত কার্সর সঠিক UTC বার অনুসরণ করে।

যেকোনো প্যানে Timeframe খুলে উৎস ও লক্ষ্য ব্যবধান সেকেন্ডে দিন। চার্ট ও গবেষণার CSV-তে কতটি উৎস বার পাওয়া গেছে তা দেখা যায়। ব্যাকআপ মূল সিরিজ রাখে।

Timeframe-এ সেশন ক্যালেন্ডার CSV দিন। প্রতিটি সেশনের খোলার সময় থেকে বিরতি ধরা হয় এবং শেষটি নির্ধারিত বন্ধের সময়ে থামে। গবেষণার CSV-তে ক্যালেন্ডার ও উৎস বারের তথ্য থাকে।

Recorded tick bars খুলে প্রতি বারে লেনদেনের সংখ্যা এবং পর্যবেক্ষণের শেষ সময় দিন। একই সময়ের রেকর্ডগুলো সংগ্রহের ক্রমে থাকে। চার্ট অসম্পূর্ণ বার চিহ্নিত করে এবং সঠিক ক্রমসংখ্যা রপ্তানি করে।

Portfolio replay-তে লভ্যাংশের ডেমো চালান বা CSV যোগ করুন। অনুসন্ধান এক্স-তারিখের আগের হোল্ডিং ব্যবহার করে, পেমেন্টের তারিখে নিষ্পত্তি করে এবং সংশোধন পর্যবেক্ষণের সময়ে প্রয়োগ করে।

দাম লোড করার পরে Universe screen-এ Relative returns খুলুন। দুটি তালিকাভুক্তির আইডি ও একটি নির্দিষ্ট UTC ভিত্তিসময় বাছুন। অনুপস্থিত বন্ধদর ও সংশোধন দেখতে ইউনিভার্সের সময়সীমা বদলান, তারপর সম্পূর্ণ তুলনাটি CSV হিসেবে ডাউনলোড করুন।

Recorded market depth খুলে নির্বাচিত ইন্সট্রুমেন্টের ডেপথ CSV লোড করুন। পর্যবেক্ষণসীমা ধরে ক্রয় ও বিক্রয়ের স্তর, ক্রমের ফাঁক ও পরের স্ন্যাপশটে পুনরুদ্ধার দেখুন। সব স্তর CSV হিসেবে ডাউনলোড করুন।

Recorded footprint খুলে নির্বাচিত ইন্সট্রুমেন্টের লেনদেন লোড করুন। নির্বাহের সময়সীমা ও পর্যবেক্ষণসীমা বেছে প্রতিটি মূল্যস্তরে ক্রয়, বিক্রয় ও অজানা ভলিউম দেখুন। সম্পূর্ণ ফুটপ্রিন্ট ও ক্রমপুঞ্জিত ডেল্টা CSV হিসেবে ডাউনলোড করুন।

Recorded footprint-এ অনুসন্ধান চালিয়ে Price profiles খুলুন। প্রতিটি মূল্যস্তরের ভলিউম এবং সেখানে লেনদেন হওয়া সময়খণ্ডের সংখ্যা তুলনা করুন। ভ্যালু এরিয়ার লক্ষ্য ঠিক করে সম্পূর্ণ প্রোফাইল CSV হিসেবে ডাউনলোড করুন।

Relative returns-এর নিচে Rolling risk খুলুন। UTC ব্যবধান, উইন্ডোর দৈর্ঘ্য ও অস্থিরতার স্কেল ঠিক করে প্রতিটি তালিকাভুক্তির উপলব্ধ রিটার্ন ও জোড়া নমুনার সংখ্যা দেখুন। সম্পূর্ণ রোলিং বিশ্লেষণ CSV হিসেবে ডাউনলোড করুন।

দাম লোড করে Universe screen-এ Correlated portfolio scenarios খুলুন। তালিকাভুক্তির ওজন, সিড ও পুনঃসামঞ্জস্য ফি ঠিক করুন। পূর্ণ রিটার্ন কভারেজ ও পথের পার্সেন্টাইল দেখে প্রতিটি পথ CSV হিসেবে ডাউনলোড করুন।

Universe screen-এ Cross-sectional paper replay খুলে তারল্য রিপোর্ট লোড করুন। প্রথম সিদ্ধান্ত ও র‍্যাঙ্কিংয়ের সেটিংস দিন। তারপর বাছাই, অর্ডার, নগদ ও লেনদেনের মোট মূল্য দেখুন অথবা পুরো রিপ্লে CSV হিসেবে নামান।

Cross-sectional paper replay-এ Corporate cash reports খুলে প্রযোজ্য CSV লোড করুন। রিপ্লেতে প্রাপ্য শেয়ার, পেমেন্ট সংশোধন, পুনর্বহাল অবস্থান ও নগদ রসিদ দেখুন। নগদ রেকর্ড CSV হিসেবে ডাউনলোড করুন।

Bar backtest-এ Recorded trade execution খুলে লেনদেনের CSV লোড করুন। কার্যকর ও জানা সময়ের সীমা বেছে নিয়ে বিলম্বিত আংশিক লেনদেন, সঠিক ক্যাপচার আইডি, নগদ ও ইকুইটি দেখুন। পূর্ণ রসিদ ও মূল্যায়ন CSV হিসেবে ডাউনলোড করুন।

র‍্যাঙ্কিং রিপ্লের পর Cross-sectional walk-forward খুলুন। লুকব্যাক ও তালিকাভুক্ত সম্পদের সংখ্যার বিকল্প তুলনা করুন, পৃথক পরীক্ষার ফল ও অসম্পূর্ণ মূল্যায়ন দেখুন এবং উৎসসহ স্কোর CSV হিসেবে রপ্তানি করুন।

চার্ট বেছে Time-series formulas খুলুন। OHLCV রাশি ও পর্যবেক্ষণসীমা দিয়ে সঠিক ফল ও অনুপলব্ধ সারি দেখুন। সূত্র, উৎস, ভাষার সংস্করণ ও ফল CSV হিসেবে রপ্তানি করুন।

বারের ইতিহাস লোড করে Formula paper backtest খুলুন। প্রবেশ ও প্রস্থানের রাশি এবং উভয় সময়সীমা নির্ধারণ করুন। বার ভলিউম ও রেকর্ড করা লেনদেনের ফিল তুলনা করে পূর্ণ রসিদ CSV হিসেবে রপ্তানি করুন।

গৃহীত সূত্র ব্যাকটেস্ট থেকে কৌশল প্যাকেজ নামান। অন্য ওয়ার্কস্পেসে লোড করলে দুই সূত্র, কার্যকর করার ধরন ও সঠিক অ্যাকাউন্ট সেটিংস ফিরে আসে। একই ডেটা ও সময়সীমায় ফল পুনরায় তৈরি করুন।

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Fibonacci time zones](../chart-workspace.md#fibonacci-time-zones) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

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
