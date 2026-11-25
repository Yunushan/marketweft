<!-- MarketWeft README · locale=bn -->

# MarketWeft

**0.3.0 · 0BSD**

**নথির ভাষা**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · **বাংলা**
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft কী করে

MarketWeft বিশ্লেষক, ডেভেলপার ও অপারেটরের জন্য স্থানীয় গবেষণা টার্মিনাল। অনুমোদিত OHLCV খুলে ক্যান্ডেল ও ভলিউম দেখায়, নির্দিষ্ট দশমিক এককে SMA ও EMA গণনা করে এবং নজরদারি তালিকা, নির্বাচিত ইন্সট্রুমেন্ট ও সূচক IndexedDB-তে রাখে। সম্পদ ক্যাশ হলে অফলাইনে চলে। সঙ্গে দেওয়া দাম ও ভলিউম কৃত্রিম, অ্যাকাউন্ট লাগে না।

0.3.0 একটি অপরিবর্তনীয় ইতিহাস সেশনের ভিত্তিতে চালায়। আলাদা trading-bot-এর জন্য শুধু পাঠযোগ্য TypeScript SDK ও পরীক্ষামূলক Tauri হোস্ট আছে। কর্পোরেট অ্যাকশন, ফিড, অর্ডার, বহু ব্যবহারকারীর হোস্টিং ও স্বাক্ষরিত ইনস্টলার রোডম্যাপে রয়েছে।

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## বহনযোগ্য টার্মিনাল চালান

সফল GitHub যাচাই থেকে browser-terminal-attempt-N ডাউনলোড করে MarketWeft-browser-0.3.0.zip খুলুন। dist/ ও serve-terminal.mjs এক ফোল্ডারে রেখে সেখানে কমান্ড চালান। WebAssembly, Canvas, BigInt ও IndexedDB সমর্থিত ব্রাউজারে http://127.0.0.1:4173/ খুলুন। Node.js 22.12 বা নতুন চাই। npm ইনস্টল লাগে না। নেট বন্ধের আগে Offline ready দেখুন।

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## NYSE নমুনা চালান

Historical replay থেকে Start demo বাছুন। Next event এগোয়, Previous event ফেরায়, Play ও Pause চলা থামায়, Reset দৃশ্যমান ইতিহাস ফাঁকা করে। চার্ট শুরুতে ফাঁকা। ক্যান্ডেল সময়খণ্ডের শেষে দেখা যায়। Event time শুরু বা সেশন সীমা, Observed at তথ্য পাওয়ার সময়। গতি পর্দায় চলার হার বদলায়।

৩১ অক্টোবর ২০২৫-এ 13:30 UTC (UTC−04:00) খোলে, ৩ নভেম্বর 14:30 UTC (UTC−05:00)। ৩ নভেম্বর 15:00-এর অনুপস্থিত খণ্ড 15:30-এ ধরা পড়ে। Thanksgiving-এ খণ্ড নেই। ২৮ নভেম্বর সাতটি ৩০ মিনিটের ক্যান্ডেলের পর 18:00 UTC-তে আগাম বন্ধ। নমুনায় ২০ সেশন, ২৫৩ ক্যান্ডেল ও ২৯৪ ইভেন্ট, কৃত্রিম মূল্য এবং প্রকাশিত NYSE সময়।

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv)

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
