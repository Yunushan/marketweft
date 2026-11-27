<!-- MarketWeft README · locale=ur -->

# MarketWeft

**0.142.0 · 0BSD**

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

MarketWeft 0.142.0 حجم کے مطابق چوڑائی والی کینڈلز شامل کرتا ہے جن کے جسم اصل قیمت کی بتی پر مرکوز رہتے ہیں۔ MarketWeft 0.7.0 کسی وقت پر دستیاب معلومات کے مطابق قیمت کی واپسی سے یونیورس کی درجہ بندی شامل کرتا ہے۔ سیشن پر مبنی ری پلے میں اسٹاک اسپلٹ، نقد منافع، رکنیت اور ڈی لسٹنگ شامل ہیں۔ مخزن میں الگ trading-bot سروس کے لیے صرف پڑھنے والا TypeScript آبزرور اور تجرباتی Tauri ریپر بھی ہے۔ ڈیٹا فیڈز، آرڈرز، دستخط شدہ انسٹالر اور کثیر صارف ہوسٹنگ روڈمیپ میں ہیں۔

</div>

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## پورٹیبل ٹرمینل چلائیں

<div dir="rtl">

کامیاب GitHub رن سے browser-terminal-attempt-N حاصل کریں۔ MarketWeft-browser-0.142.0.zip کھولیں، dist/ کو serve-terminal.mjs کے ساتھ رکھیں اور اسی فولڈر میں کمانڈ چلائیں۔ WebAssembly، Canvas، BigInt اور IndexedDB والے براؤزر میں http://127.0.0.1:4173/ کھولیں۔ Node.js 22.12 یا نیا چاہیے۔ npm کی تنصیب درکار نہیں۔ نیٹ بند کرنے سے پہلے Offline ready دیکھیں۔

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

<div dir="rtl">

Historical replay → Open financial statements → Start financial demo کھولیں۔ Original filing میں P/E 10× ہے۔ اسی قدر پیمائی کے وقت Restatement observed سے P/E 15× اور عام حصص کا ایکویٹی غائب دکھتا ہے۔ Revised capitalization میں P/E 20× ہے۔ اپنے جاری کنندہ اور معلوم وقت کی جانچ کے لیے Annual filings CSV اور اختیاری Capitalization CSV اپ لوڈ کریں۔

</div>

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

<div dir="rtl">

Historical replay → Open economic calendar → Start calendar demo کھولیں۔ اجرا سے پہلے اندازہ 2.5 فیصد ہے اور اصل عدد دستیاب نہیں۔ Actual observed میں 14:32 UTC پر 2.7 فیصد دکھتا ہے۔ Revised actual میں 2.8 فیصد ہے اور دونوں ترامیم Release evidence میں ہیں۔ اپنے اعداد کے لیے Macro calendar CSV اپ لوڈ کریں۔

</div>

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

<div dir="rtl">

Historical replay → Open option chain → Start option demo کھولیں۔ اپریل کے 100 اسٹرائیک جوڑے کی IV تقریباً 20 فیصد ہے۔ Late option quote سے 90 اسٹرائیک کال کی IV 25 فیصد دکھتی ہے، اور Corrected spread سے پٹ کی قدر نکلتی ہے۔ مختلف میعاد کے لیے Implied volatility surface دیکھیں۔ اپنے نرخوں کے لیے Underlying CSV اور Option quotes CSV لوڈ کریں۔

</div>

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

<div dir="rtl">

Historical replay → Open replay alerts → Start alert demo کھولیں۔ First crossing ایک حد کا الرٹ دکھاتا ہے۔ Correction observed میں درست شدہ نمونہ اور متحرک اوسط کی کراسنگ ہے۔ Full alert replay آٹھ الرٹس دکھاتا ہے۔ Save to alert inbox دو بار دبائیں۔ پہلی بار آٹھ اور دوسری بار صفر نئے ریکارڈ محفوظ ہوں گے۔ اپنے اعداد کے لیے Alert rules CSV اور Alert observations CSV لوڈ کریں۔

</div>

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

<div dir="rtl">

Historical replay → Open paper ledger → Start paper demo کھولیں۔ 503 نقد ریزرو سے ایک جزوی تکمیل تک جائیں جس کے بعد 801.6 باقی ہے۔ روک کے بعد Final account میں 663.7 نقد اور 13 حاصل شدہ منافع ہے۔ اپنی فرضی تجارت کے لیے Paper events CSV لوڈ کریں۔

</div>

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

<div dir="rtl">

Historical replay → Open bar backtest → Start backtest demo کھولیں۔ 14:05 UTC کا سگنل خرید آرڈر لگاتا ہے۔ 14:06 کا وقفہ غائب ہے اور تکمیل نہیں ہوتی۔ 14:07 کے اختتام پر دو حصص بھر جاتے ہیں۔ Final backtest میں ایکویٹی 957.8 ہے۔ مقامی تاریخ کے لیے سیشن اور بار CSV لوڈ کریں۔

</div>

<div dir="rtl">

بیک ٹیسٹ ڈیمو میں چھ تربیتی بار اور دو آزمائشی بار کے ساتھ Walk-forward validation چلائیں۔ پہلا مکمل دور 14:09 UTC پر ظاہر ہوتا ہے۔ تربیت میں 1:2 منتخب ہوتا ہے اور نئے اکاؤنٹ سے شروع ہونے والے دونوں آزمائشی بار میں یہی جوڑا رہتا ہے۔

</div>

<div dir="rtl">

بار بیک ٹیسٹ ڈیمو میں سیڈ 20250403، 256 راستوں اور فی راستہ آٹھ تبدیلیوں کے ساتھ Seeded scenarios چلائیں۔ بنیادی آخری ایکویٹی 957.8 اور منظرناموں کا میڈین 997.6 ہے۔ ایک ہی کٹ آف، ان پٹ اور سیڈ سے خطرے کی وہی جدول بنتی ہے۔

</div>

<div dir="rtl">

یونیورس ڈیمو میں BETA-001 کے لیے Delisting proceeds لوڈ کریں اور دونوں کٹ آف 14:35 UTC پر رکھیں۔ اس وقت رقم دستیاب نہیں۔ 14:37 پر دس حصص کے لیے 70 USD وصول طلب ہیں اور 14:50 پر نقد اندراج ہوتا ہے۔ بعد کی اصلاحات پہلے کے نتائج محفوظ رکھتی ہیں اور BETA-002 الگ رہتا ہے۔

</div>

<div dir="rtl">

Start split revisions demo کھولیں اور Split-adjusted منتخب کریں۔ 3 جون کو 14:10 UTC پر مؤثر وقت کی تبدیلی پچھلی ایڈجسٹمنٹ ہٹاتی ہے۔ 14:20 پر دونوں شناختوں کی نسبتیں اکٹھی لاگو ہوتی ہیں۔ 14:30 پر SPLIT-A کی منسوخی کے بعد SPLIT-B اور خام کینڈل برقرار رہتی ہیں۔

</div>

<div dir="rtl">

Start dividend entitlement demo کھولیں۔ ALPHA میں پہلے 100 حصص اہل ہیں اور تاخیر سے رپورٹ آنے پر 120 ہو جاتے ہیں۔ BETA میں 40 حصص ہیں۔ ادائیگی کے بعد ALPHA کی 110 حصص تک اصلاح 3 USD واپس کرتی ہے۔ پچھلا بیلنس دیکھنے کے لیے پیچھے جائیں۔

</div>

<div dir="rtl">

یونیورس ڈیمو میں Portfolio replay لوڈ کریں۔ BETA-001 کی 14:10 UTC بند قیمت 14:12 کے مشاہدے پر ظاہر ہوتی ہے۔ 14:45 پر اس کے 70 USD وصول طلب، BETA-002 کے 225 EUR شیئرز سے الگ ہیں۔ 14:50 پر حصص اور ڈی لسٹنگ نقدی کا مجموعہ 284 USD ہے۔

</div>

<div dir="rtl">

Compare charts منتخب کریں اور دوسرا انسٹرومنٹ چنیں۔ Link by UTC دونوں پین میں ایک ہی نظر آنے والا وقت دکھاتا ہے۔ ہر پین کا زوم الگ کریں۔ ورک اسپیس بیک اپ دونوں انسٹرومنٹ، اوورلے اور لنک کی ترتیب محفوظ کرتا ہے۔

</div>

<div dir="rtl">

Draw measurement منتخب کریں اور ہر سرے کے لیے موجودہ UTC بار اور قیمت چنیں۔ زوم یا پین کرنے پر چارٹ اسی محفوظ لائن کو نئے منظر میں دکھاتا ہے۔ ورک اسپیس بیک اپ نقاط محفوظ کرتا ہے اور ایپ وقت کا فرق سیکنڈوں میں اور قیمت کی تبدیلی رقم اور فیصد میں دکھاتی ہے۔

</div>

<div dir="rtl">

Indicators کھولیں اور ہر پین کے SMA اور EMA ادوار بارز کی تعداد میں مقرر کریں۔ کافی اختتامی قیمتیں ملنے پر چارٹ منتخب UTC بار کی قدریں دکھاتا ہے۔ انسٹرومنٹ بدلنے، دوبارہ لوڈ کرنے اور بیک اپ سے بحالی پر ادوار محفوظ رہتے ہیں۔

</div>

<div dir="rtl">

چارٹ کے نیچے Export CSV کھولیں۔ دوبارہ درآمد کے لیے OHLCV بارز ڈاؤن لوڈ کریں، یا تحقیق کے لیے ماخذ اور فعال موونگ ایوریجز شامل کریں۔ کافی اختتامی قیمتیں دستیاب ہونے تک اوسط کے خانے خالی رہتے ہیں۔

</div>

<div dir="rtl">

کسی بھی پین میں چارٹ کی قسم سے Close line چنیں۔ لائن مشاہدہ شدہ اختتامی قیمتیں دکھاتی ہے اور والیوم اور فعال انڈیکیٹر برقرار رکھتی ہے۔ غیر موجود UTC بار پر منسلک کراس ہیئر دکھائی نہیں دیتا۔ بیک اپ منتخب اقسام محفوظ کرتا ہے۔

</div>

<div dir="rtl">

OHLC bars منتخب کریں۔ عمودی لکیر بلند اور کم قیمت، بائیں نشان آغاز اور دائیں نشان اختتام دکھاتا ہے۔ ہر پین اپنی قسم محفوظ رکھتا ہے اور منسلک کرسر درست UTC بار کی پیروی کرتا ہے۔

</div>

<div dir="rtl">

کسی پین میں Timeframe کھول کر ماخذ اور مطلوبہ وقفے سیکنڈ میں لکھیں۔ چارٹ اور تحقیقی CSV موصولہ بارز کی تعداد دکھاتے ہیں۔ بیک اپ اصل سیریز محفوظ کرتا ہے۔

</div>

<div dir="rtl">

Timeframe میں سیشن کیلنڈر CSV شامل کریں۔ وقفے سیشن کے آغاز سے بنتے ہیں اور آخری وقفہ درج اختتامی وقت پر رکتا ہے۔ تحقیقی CSV کیلنڈر اور ماخذ بارز کی کوریج محفوظ کرتا ہے۔

</div>

<div dir="rtl">

Recorded tick bars کھول کر سودوں کی تعداد اور مشاہدے کی آخری حد مقرر کریں۔ ایک ہی وقت والے سودوں کی ریکارڈنگ ترتیب برقرار رہتی ہے۔ چارٹ نامکمل بار دکھاتا ہے اور درست سلسلہ نمبر برآمد کرتا ہے۔

</div>

<div dir="rtl">

Portfolio replay میں منافع کی ڈیمو لوڈ کریں یا CSV شامل کریں۔ استفسار ایکس تاریخ سے پہلے کی ہولڈنگ استعمال کرتا ہے، ادائیگی کی تاریخ پر تصفیہ کرتا ہے اور مشاہدے کے وقت ترامیم لاگو کرتا ہے۔

</div>

قیمتیں لوڈ کرنے کے بعد Universe screen میں Relative returns کھولیں۔ دو لسٹنگ آئی ڈی اور عین UTC بنیادی وقت منتخب کریں۔ گم شدہ اختتامی قیمتیں اور ترامیم دیکھنے کے لیے یونیورس کی وقت کی حد بدلیں، پھر مکمل موازنہ CSV میں ڈاؤن لوڈ کریں۔

Recorded market depth کھولیں اور منتخب انسٹرومنٹ کی مارکیٹ ڈیپتھ CSV لوڈ کریں۔ مشاہدے کے اوقات میں آگے بڑھ کر خرید و فروخت کی سطحیں، ترتیب کا خلا اور اگلے اسنیپ شاٹ پر بحالی دیکھیں۔ تمام سطحیں CSV میں ڈاؤن لوڈ کریں۔

Recorded footprint کھولیں اور منتخب انسٹرومنٹ کے سودے لوڈ کریں۔ عمل درآمد کی مدت اور مشاہدے کی آخری حد طے کر کے ہر قیمتی وقفے میں خرید، فروخت اور نامعلوم حجم دیکھیں۔ مکمل فٹ پرنٹ اور مجموعی فرق CSV میں ڈاؤن لوڈ کریں۔

Recorded footprint میں استفسار چلانے کے بعد Price profiles کھولیں۔ ہر قیمتی وقفے کا حجم ان زمانی وقفوں کی تعداد سے ملائیں جن میں وہاں سودا ہوا۔ ویلیو ایریا کا ہدف مقرر کر کے مکمل پروفائل CSV میں ڈاؤن لوڈ کریں۔

Relative returns کے نیچے Rolling risk کھولیں۔ ہر لسٹنگ کی دستیاب واپسی اور جوڑی دار نمونوں کی تعداد دیکھنے کے لیے UTC وقفہ، مدت کی لمبائی اور اتار چڑھاؤ کا پیمانہ طے کریں۔ مکمل مطالعہ CSV میں ڈاؤن لوڈ کریں۔

قیمتیں لوڈ کرنے کے بعد Universe screen میں Correlated portfolio scenarios کھولیں۔ وزن، سیڈ اور دوبارہ توازن کی فیس طے کریں۔ مکمل واپسی کی کوریج اور راستوں کے پرسنٹائل دیکھ کر ہر راستہ CSV میں ڈاؤن لوڈ کریں۔

Universe screen میں Cross-sectional paper replay کھولیں اور لیکویڈیٹی رپورٹ لوڈ کریں۔ پہلا فیصلہ اور درجہ بندی کی ترتیبات طے کریں، پھر منتخب اثاثے، آرڈرز، نقدی اور سودوں کی مالیت دیکھیں یا مکمل ری پلے CSV میں ڈاؤن لوڈ کریں۔

Cross-sectional paper replay میں Corporate cash reports کھولیں اور متعلقہ CSV فائلیں لوڈ کریں۔ استحقاق، ادائیگی کی ترامیم، بحال شدہ پوزیشنز اور نقد رسیدیں دیکھیں، پھر نقدی کا ریکارڈ CSV میں ڈاؤن لوڈ کریں۔

Bar backtest میں Recorded trade execution کھول کر سودوں کی CSV لوڈ کریں۔ مؤثر اور معلوم وقت کی حد سے تاخیر سے ہونے والے جزوی سودے، درست ریکارڈ آئی ڈی، نقدی اور ایکویٹی دیکھیں۔ مکمل ریکارڈ CSV میں ڈاؤن لوڈ کریں۔

درجہ بندی کا ری پلے چلانے کے بعد Cross-sectional walk-forward کھولیں۔ مدت اور اثاثوں کی تعداد کا موازنہ کریں، الگ نتائج اور نامکمل قیمتیں دیکھیں، پھر اسکور اور ذرائع CSV میں برآمد کریں۔

چارٹ منتخب کریں اور Time-series formulas کھولیں۔ OHLCV اظہار اور مشاہدے کی آخری حد درج کرکے درست اقدار اور غیر دستیاب قطاریں دیکھیں۔ فارمولا، ماخذ، زبان کا ورژن اور نتائج CSV میں برآمد کریں۔

بار کا ریکارڈ لوڈ کرکے Formula paper backtest کھولیں۔ داخلے اور اخراج کے فارمولے اور دونوں وقت کی حدیں دیں۔ بار کے حجم اور ریکارڈ شدہ سودوں کا موازنہ کریں، پھر رسیدیں CSV میں برآمد کریں۔

قبول شدہ فارمولہ بیک ٹیسٹ سے حکمت عملی کا پیکج ڈاؤن لوڈ کریں۔ دوسرے ورک اسپیس میں دونوں فارمولے، عمل درآمد کا طریقہ اور درست فرضی کھاتے کی ترتیبات بحال کریں۔ یکساں ڈیٹا اور وقت کی حدود سے نتیجہ دہرائیں۔

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Local REST](../local-rest-research.md) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles)

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
