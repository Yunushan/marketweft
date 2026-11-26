<!-- MarketWeft README · locale=ur -->

# MarketWeft

**0.8.0 · 0BSD**

**دستاویز کی زبانیں**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · **اردو** · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft کی سہولیات

<div dir="rtl">

MarketWeft تجزیہ کاروں، ڈویلپرز اور آپریٹرز کا مقامی تحقیقی ٹرمینل ہے۔ یہ مجاز OHLCV کھولتا، کینڈل اور حجم دکھاتا، مقررہ اعشاریے میں SMA اور EMA نکالتا، اور فہرست، منتخب اثاثہ اور اشاریے IndexedDB میں رکھتا ہے۔ وسائل کیش ہونے پر آف لائن چلتا ہے۔ فراہم کردہ قیمتیں اور حجم مصنوعی ہیں اور اکاؤنٹ درکار نہیں۔

</div>

<div dir="rtl">

MarketWeft 0.8.0 وقت کے مطابق سیکٹر ہیٹ میپ، وزن کی کوریج اور واپسی میں حصہ دکھاتا ہے۔ MarketWeft 0.7.0 کسی وقت پر دستیاب معلومات کے مطابق قیمت کی واپسی سے یونیورس کی درجہ بندی شامل کرتا ہے۔ سیشن پر مبنی ری پلے میں اسٹاک اسپلٹ، نقد منافع، رکنیت اور ڈی لسٹنگ شامل ہیں۔ مخزن میں الگ trading-bot سروس کے لیے صرف پڑھنے والا TypeScript آبزرور اور تجرباتی Tauri ریپر بھی ہے۔ ڈیٹا فیڈز، آرڈرز، دستخط شدہ انسٹالر اور کثیر صارف ہوسٹنگ روڈمیپ میں ہیں۔

</div>

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## پورٹیبل ٹرمینل چلائیں

<div dir="rtl">

کامیاب GitHub رن سے browser-terminal-attempt-N حاصل کریں۔ MarketWeft-browser-0.8.0.zip کھولیں، dist/ کو serve-terminal.mjs کے ساتھ رکھیں اور اسی فولڈر میں کمانڈ چلائیں۔ WebAssembly، Canvas، BigInt اور IndexedDB والے براؤزر میں http://127.0.0.1:4173/ کھولیں۔ Node.js 22.12 یا نیا چاہیے۔ npm کی تنصیب درکار نہیں۔ نیٹ بند کرنے سے پہلے Offline ready دیکھیں۔

</div>

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## NYSE کی مثال چلائیں

<div dir="rtl">

Historical replay میں Start demo منتخب کریں۔ Next event آگے، Previous event پیچھے، Play اور Pause چلانے اور روکنے کے لیے ہیں۔ Reset دکھائی گئی تاریخ صاف کرتا ہے۔ گراف شروع میں خالی ہوتا ہے۔ کینڈل وقفے کے آخر میں نمودار ہوتی ہے۔ Event time آغاز یا سیشن کی حد، اور Observed at دستیابی کا وقت ہے۔ رفتار صرف نمائش پر اثر ڈالتی ہے۔

</div>

<div dir="rtl">

31 اکتوبر 2025 پر آغاز 13:30 UTC (UTC−04:00) سے 3 نومبر پر 14:30 UTC (UTC−05:00) ہو جاتا ہے۔ 3 نومبر کا 15:00 والا وقفہ 15:30 پر غائب درج ہوتا ہے۔ Thanksgiving پر وقفہ نہیں۔ 28 نومبر کو سات 30 منٹ کی کینڈلز کے بعد 18:00 UTC پر جلد بند ہوتا ہے۔ مثال میں 20 سیشن، 253 کینڈلز اور 294 واقعات ہیں۔ قیمتیں مصنوعی اور اوقات شائع شدہ NYSE اوقات ہیں۔

</div>

<div dir="rtl">

Historical replay → Start split demo کھولیں اور ایک ہی واقعے پر Price basis کو Raw اور Split-adjusted کے درمیان بدلیں۔ 2 کے بدلے 1 تقسیم کا اعلان اور مشاہدہ نفاذ سے پہلے ہوتا ہے۔ اس وقت تک دونوں منظر برابر ہیں۔ نفاذ پر پہلے کی آخری بند قیمت 106.50 خام سے 53.25 ایڈجسٹ ہو جاتی ہے اور حجم دگنا ہوتا ہے۔ بعد کی پہلی کینڈل 53.00 رہتی ہے۔ اپنے ڈیٹا کے لیے منتخب اثاثے کی Corporate actions CSV اور سیشن کیلنڈر دیں اور خام OHLCV کی تصدیق کریں۔ نافذ ہونے پر تازہ ترین مشاہدہ شدہ تناسب لگتا ہے۔ دیر کی رپورٹ اور تصحیح اپنے مشاہدے کے وقت سے منظر بدلتی ہے۔ اصل تاریخ برقرار رہتی ہے۔

</div>

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

<div dir="rtl">

Historical replay → Start dividend demo میں ہر تقسیم کے 100 اہل حصص دیکھیں۔ ایکس تاریخ پر USD 25.00 قابلِ وصول ہوتا ہے۔ ترمیم اسے USD 30.00 تک بڑھاتی ہے اور ادائیگی کی نئی تاریخ کریڈٹ آگے لے جاتی ہے۔ تاخیر کی رپورٹ مشاہدے پر EUR 10.00 درج کرتی ہے۔ ادائیگی کے بعد تصحیح سے USD 28.00 رہ جاتا ہے۔ پرانے بیلنس کے لیے پیچھے جائیں۔ اپنے ڈیٹا کا Cash dividends CSV اپ لوڈ کر کے Entitled shares per distribution درج کریں۔ اصلاحات میں تقسیم کا ID یکساں رکھیں۔ کھاتہ کرنسیاں الگ رکھتا اور پرانی اندراجات اور اصل قیمتیں محفوظ کرتا ہے۔

</div>

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

<div dir="rtl">

Historical replay → Open universe replay → Start universe demo کھولیں۔ 14:05 UTC پر صرف ALFA رکن ہے اور 14:10 پر BETA شامل ہوتا ہے۔ ALFA کا 14:20 کا اخراج 14:25 پر معلوم ہوتا ہے۔ BETA کی 14:30 والی ڈی لسٹنگ 14:35 پر معلوم ہوتی ہے۔ پچھلی رکنیت دیکھنے کے لیے پیچھے جائیں یا Effective time اور Known time الگ دے کر سوال چلائیں۔ اپنا Universe membership CSV اپ لوڈ کریں۔ اصلاحات میں تبدیلی کا ID وہی رکھیں اور ٹکر دوبارہ استعمال ہو تو لسٹنگ کا نیا ID دیں۔

</div>

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

<div dir="rtl">

Universe screen میں Load demo prices منتخب کریں اور 14:00 UTC کو بنیاد رکھیں۔ 14:05 پر ALFA ایک فیصد کے ساتھ اوّل ہے۔ BETA 14:10 پر شامل ہوتا ہے اور 14:12 پر اختتامی قیمت معلوم ہونے تک بے درجہ رہتا ہے۔ مؤثر وقت 14:10 کے لیے معلوم وقت 14:12 اور پھر 14:16 رکھیں۔ BETA کی 12% واپسی نظرثانی کے بعد 1% ہے۔ 14:20 سے مؤثر ALFA کی برطرفی 14:25 پر معلوم ہونے پر وہ نکل جاتا ہے۔ اپنی متعین اوقات کی قیمتیں استعمال کرنے کے لیے لسٹنگ شناخت کے ساتھ Universe prices CSV اپ لوڈ کریں۔ بنیادی یا آخری قیمت غائب ہو تو رکن بے درجہ رہتا ہے۔

</div>

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

<div dir="rtl">

نمونہ قیمتیں لوڈ کرنے کے بعد Sector heatmap میں Load demo sectors منتخب کریں۔ 14:10 UTC پر معلوم وزن کی 60% کوریج ہے۔ 14:12 پر BETA کی قیمت معلوم ہو تو کوریج 100% اور مشاہدہ شدہ حصہ 1.2% سے 6% ہو جاتا ہے۔ 14:16 کی تصحیح BETA کو Financials سے Technology میں منتقل کرتی ہے۔ درجہ، حصہ اور درجہ بندی کے اوقات دیکھنے کے لیے ٹائل کھولیں۔ اپنی رپورٹوں کے لیے Sector and weight CSV اپ لوڈ کریں۔

</div>

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv)

<!-- section:04 -->
## اپنا ڈیٹا درآمد اور دوبارہ چلائیں

<div dir="rtl">

Import CSV میں مارکیٹ اور علامت دے کر مجاز UTF-8 OHLCV منتخب کریں۔ بڑھتے Unix سیکنڈ، UTC تاریخ یا Z پر ختم UTC وقت دیں۔ زیادہ سے زیادہ چھ اعشاری مقامات، غیر منفی حجم اور کھلنے و بند ہونے کو محیط کم و زیادہ قیمتیں دیں۔ ایک غلط قطار تمام درآمد رد کرتی ہے۔ Series details میں وقفہ، ماخذ، اجازت اور ایڈجسٹمنٹ پالیسی لکھیں۔

</div>

<div dir="rtl">

ہر کینڈل پر شروع کا وقت لگائیں۔ Historical replay میں اثاثہ، سیشن CSV اور وقفے کے پورے سیکنڈ (1–86,400) دیں۔ قطار میں صحیح UTC حدود، آغاز کا منٹ فرق اور regular یا early لکھیں۔ گرڈ افتتاح سے شروع ہے اور آخری وقفہ چھوٹا ہو سکتا ہے۔ سیشن یا گرڈ سے باہر کینڈل رد ہوتی ہے۔ خالی وقفہ گھڑی آگے بڑھاتا اور آخری قیمت برقرار رکھتا ہے۔

</div>

<div dir="rtl">

فی فائل پہلے سے حد 1,500,000 بائٹ اور 100,000 کینڈل ہے۔ بلڈ اسے 8 MiB اور 100,000 قطار تک مقرر کر سکتا ہے۔ کیلنڈر کی حد 1 MiB، 10,000 غیر متداخل حصے اور 200,000 واقعات ہے۔ براؤزر کی گنجائش الگ لاگو ہے۔

</div>

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
## بیک اپ، منتقلی اور بحالی

<div dir="rtl">

Workspace backup → Export workspace ورژن والے JSON میں اصل CSV، ماخذ، ظاہر اور پوشیدہ تاریخ، فہرست کی ترتیب، انتخاب اور اشاریے رکھتا ہے۔ منزل کے پروفائل پر Backup file منتخب کریں، شمار دیکھیں اور Restore workspace دبائیں۔ ایک ٹرانزیکشن منزل کا کیٹلاگ بدلتی ہے۔ پرانا کیٹلاگ چاہیے تو اسے پہلے برآمد کریں۔

</div>

<div dir="rtl">

اپ گریڈ میں وہی اسکیم، ہوسٹ، پورٹ اور پروفائل رکھیں۔ 0.1.0 کا ڈیٹا IndexedDB میں منتقل ہو کر دوبارہ پڑھا اور تصدیق کیا جاتا ہے اور اصل برقرار رہتا ہے۔ پرانے ٹیب بند کریں۔ بیک اپ سادہ متن ہے۔ SHA-256 سالمیت چیک کرتا ہے۔ رسائی، ذخیرہ اور مدت کو ڈیٹا کے حق کے مطابق رکھیں۔

</div>

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## ساخت اور حساب کے اصول

<div dir="rtl">

Rust شناخت، UTC اور OHLCV جانچتا، صحیح اعداد کی دس لاکھویں اکائی میں حساب کرتا اور سیشن کے واقعات بناتا ہے۔ React وہی Wasm، گراف کے لیے Canvas، ٹرانزیکشن کے لیے IndexedDB اور کیش کے لیے service worker استعمال کرتا ہے۔ نظرثانی نمبر متوازی تحریر شناخت کرتے ہیں۔ حالت پروفائل اور origin سے جڑی ہے۔

</div>

<div dir="rtl">

SMA ٹھیک چلتا مجموعہ استعمال کرتا ہے۔ EMA پہلی مکمل کھڑکی سے شروع ہوتا اور ہر بار دس لاکھویں تک گول ہوتا ہے، برابر فاصلے پر صفر سے دور۔ ری پلے صرف دکھائی گئی اختتامی قیمتیں لیتا ہے۔ وقفے کا مقررہ اختتام مفروضہ دستیابی ہے۔ فراہم کنندہ کی آمد، تصحیح اور اندرونی وقت الگ ان پٹ ہیں۔ اصل قطاریں محفوظ رہتی ہیں۔

</div>

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## تعیناتی اور آپریشن کا دائرہ

<div dir="rtl">

dist/ کو HTTPS سے دیں یا loopback چلائیں۔ وہی origin ورک اسپیس محفوظ رکھتا ہے۔ دوسرے پورٹ، پروفائل یا نجی ونڈو کا ذخیرہ الگ ہے۔ Tauri کی آزمائش کے لیے ویب بلڈ اور نظامی تقاضے پورے کریں۔ CI Windows Server 2022، macOS 15 اور Ubuntu 24.04 پر بلڈ کرتا اور Linux ونڈو کھولتا ہے۔ موبائل، ARM اور BSD میٹرکس میں ہیں۔ ڈیسک ٹاپ Chromium سے ٹیسٹ کریں۔

</div>

<div dir="rtl">

ہر پروفائل میں ایک مقامی صارف تصور کیا گیا ہے۔ ڈیٹا اور بیک اپ منظور شدہ آلات پر رکھیں۔ شناخت، صارفین کی علیحدگی، نگرانی، مدت اور بازیابی الگ تصدیق شدہ تعیناتی چاہتے ہیں۔ ZIP لائسنس نوٹس اور CycloneDX SBOM رکھتا ہے۔ ریلیز ٹیگ کے طریقے میں تصدیقی سند ہے۔

</div>

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## بیرونی سروس کا مشاہدہ

<div dir="rtl">

TradingBotObserverV1 الگ trading-bot کا runtime، status، account اور portfolio پڑھتا ہے۔ معتبر origin، loopback کے باہر HTTPS اور عمل کی ترتیب سے مجاز ٹوکن لیں۔ ہر اسنیپ شاٹ کا وقت دیکھیں۔ خالی اسنیپ شاٹ اور درست کام کرتی سروس اضافی بیلنس یا پوزیشن نہیں بتاتی۔ اسناد، آرڈر اور عمل درآمد بیرونی سروس کے پاس ہیں۔

</div>

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
## سورس سے بنائیں اور جانچیں

<div dir="rtl">

npm کے ساتھ Node.js 22.12 یا نیا، rust-toolchain.toml میں مقرر Rustup اور Python 3.11 یا نیا استعمال کریں۔ ریپو کی جڑ سے چلائیں۔ Vite کا ترقیاتی URL عموماً 5173 ہے، پروڈکشن 4173۔ جانچ سے پہلے مقرر Chromium نصب کریں۔

</div>

<div dir="rtl">

Rust، Wasm، براؤزر، SDK، مقامی سرور، لائسنس، SBOM اور سکیورٹی نوٹس جانچے جاتے ہیں۔ گھڑی کی تبدیلی، وقفے کی کمی اور جلد بندش سمیت ہر واقعے پر دونوں اوسطوں کو بیچ کے متعلقہ ابتدائی حصے سے ملایا جاتا ہے۔ CI درست ZIP ID کا انتظار اور ڈاؤن لوڈ کا بائٹ موازنہ کرتا ہے۔ موافق ٹیگ سند بناتا ہے۔

</div>

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
## مسئلے کی تشخیص اور تکرار

<div dir="rtl">

اگر پورٹ مصروف ہو تو --port 4174 لیں، اور origins میں ڈیٹا برآمد و بحال کریں۔ آف لائن مسئلے کے لیے پہلے آن لائن پروڈکشن کھول کر Offline ready دیکھیں۔ رد ہونے پر بتائی گئی قطار، وقفے کا آغاز اور درست تاریخ و مارکیٹ کا کیلنڈر دیکھیں۔

</div>

<div dir="rtl">

CSV، کیلنڈر، وقفہ، Git ریویژن، براؤزر اور واقعے کا وقت رکھیں۔ مصنوعی مثال اور پہلا ناکام مرحلہ دیں۔ تصدیقی ریکارڈ میں پلیٹ فارم کا ثبوت اور روڈمیپ میں اگلے اہداف ہیں۔

</div>

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## ریپوزٹری، شراکت اور لائسنس

<div dir="rtl">

انجن اور نمونے crates/core میں، براؤزر اور ٹیسٹ apps/terminal میں، میزبان apps/desktop میں، SDK packages/trading-bot میں اور آلات scripts میں ہیں۔ چھوٹی آزمودہ تبدیلیاں دیں۔ حقوق اور نوٹس برقرار رکھیں، انحصار بدلنے پر فہرست تازہ کریں اور کمزوری نجی طور پر بتائیں۔

</div>

<div dir="rtl">

اصل کوڈ 0BSD کے تحت ہے اور انحصار کے الگ لائسنس ہیں۔ مکمل نسخے Ethnologue 2026 میں پہلی اور دوسری زبان کے مجموعی بولنے والوں کے مطابق ہیں، گول اعداد میں بیسویں مقام پر برابر دونوں زبانوں سمیت۔ منسلک کتابچے اور انٹرفیس انگریزی میں ہو سکتے ہیں۔

</div>

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
