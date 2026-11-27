<!-- MarketWeft README · locale=arz -->

# MarketWeft

**0.146.0 · 0BSD**

**لغات الدليل**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
**العربي المصري** · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft بيعمل إيه

<div dir="rtl">

MarketWeft محطة بحث بتشتغل محلي للمحللين والمطورين والمشغلين. بتفتح ملفات OHLCV المسموح بيها، وترسم الشموع والحجم، وتحسب SMA وEMA بأرقام عشرية ثابتة، وتحفظ قائمة المتابعة والأداة والمؤشرات في IndexedDB. بعد ما الموارد تتخزن تشتغل من غير إنترنت. الأسعار والأحجام المرفقة مصطنعة ومش محتاجة حساب.

</div>

<div dir="rtl">

MarketWeft 0.146.0 بيضيف رسم لنقط التحول المؤكدة في أسعار القفل، بنافذة لكل لوحة ووقت للنقطة ووقت لتأكيدها۔ MarketWeft 0.7.0 بيضيف ترتيب أعضاء المجموعة حسب عائد السعر بالمعلومات اللي كانت معروفة وقت الاستعلام. إعادة التشغيل حسب الجلسة فيها تجزئة الأسهم والتوزيعات النقدية وتغييرات العضوية والشطب. المستودع فيه كمان مراقب TypeScript للقراءة بس لخدمة trading-bot منفصلة وغلاف Tauri تجريبي. تغذية البيانات والأوامر والمثبّتات الموقّعة والاستضافة لأكتر من مستخدم لسه في خطة الشغل.

</div>

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## شغّل النسخة المحمولة

<div dir="rtl">

نزّل browser-terminal-attempt-N من تشغيل GitHub ناجح. فك MarketWeft-browser-0.146.0.zip وسيب dist/ جنب serve-terminal.mjs وشغّل الأمر جوه نفس المجلد. افتح http://127.0.0.1:4173/ في متصفح حديث فيه WebAssembly وCanvas وBigInt وIndexedDB. استخدم Node.js 22.12 أو أحدث. مش محتاج تثبت npm. استنى Offline ready قبل ما تفصل النت.

</div>

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## شغّل مثال NYSE

<div dir="rtl">

افتح Historical replay واختار Start demo. Next event يقدّم خطوة وPrevious event يرجّع خطوة. Play وPause يشغّلوا ويوقفوا العرض وReset يمسح اللي بان من التاريخ. الرسم يبدأ فاضي. الشمعة بتظهر في نهاية فترتها. Event time بداية الفترة أو حد الجلسة، وObserved at وقت ما تبقى المعلومة متاحة. السرعة بتغير وتيرة العرض بس.

</div>

<div dir="rtl">

افتتاح 31 أكتوبر 2025 كان 13:30 UTC (UTC−04:00)، و3 نوفمبر كان 14:30 UTC (UTC−05:00). الفترة الناقصة من 15:00 بتبان الساعة 15:30. يوم عيد الشكر مفيهوش فترات. 28 نوفمبر قفل بدري 18:00 UTC بعد سبع شمعات نص ساعة. المثال فيه 20 جلسة و253 شمعة و294 حدث، بأسعار مصطنعة ومواعيد منشورة من NYSE.

</div>

<div dir="rtl">

افتح Historical replay → Start split demo وبدّل Price basis بين Raw وSplit-adjusted عند نفس الحدث. تجزئة 2 مقابل 1 بتتعلن وبتتشاف قبل ما تسري. لحد وقت السريان العرضين زي بعض. مع السريان آخر قفل قديم بيتغير من 106.50 خام لـ 53.25 بعد التعديل، والحجم بيتضاعف. أول شمعة بعدها بتفضل 53.00. لبياناتك ارفع Corporate actions CSV للأداة، وأكّد إن OHLCV خام وقدّم تقويم الجلسات. أحدث نسبة شوفتها تتطبق بعد السريان. الخبر المتأخر أو التصحيح يغيّر العرض من وقت ما يوصل. التاريخ الأصلي بيبقى زي ما هو.

</div>

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

<div dir="rtl">

افتح Historical replay → Start dividend demo لمتابعة 100 سهم مستحق لكل توزيع. في تاريخ التداول من غير الحق بيتسجل USD 25.00 مستحق. تعديل المبلغ يرفعه لـ USD 30.00 وتعديل يوم الدفع يأخر القيد. التقرير المتأخر بيضيف EUR 10.00 لما يتشاف، والتصحيح بعد الدفع بيسيب USD 28.00. ارجع عشان تشوف الأرصدة القديمة. لبياناتك ارفع Cash dividends CSV واكتب Entitled shares per distribution. حافظ على نفس ID للتوزيع في التصحيحات. السجل بيفصل العملات ويحافظ على القيود القديمة والأسعار الأصلية.

</div>

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

<div dir="rtl">

افتح Historical replay → Open universe replay → Start universe demo. الساعة 14:05 UTC العضو الوحيد ALFA، وBETA بينضم 14:10. خروج ALFA الساري 14:20 بيتعرف 14:25، وشطب BETA الساري 14:30 بيتعرف 14:35. ارجع عشان تشوف العضوية القديمة أو اعمل استعلام بـ Effective time وKnown time مختلفين. لبياناتك ارفع Universe membership CSV. سيب معرّف التغيير زي ما هو وقت التصحيح، واستعمل معرّف إدراج جديد للرمز اللي بيتكرر.

</div>

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

<div dir="rtl">

في Universe screen اختار Load demo prices وسيب وقت الأساس 14:00 UTC. عند 14:05، ALFA متصدر بعائد 1%. BETA بيدخل عند 14:10 ويفضل من غير ترتيب لحد ما سعر الإغلاق يتعرف عند 14:12. خلّي الوقت الفعلي 14:10 وجرّب وقت المعرفة 14:12 وبعده 14:16 علشان تشوف عائد BETA قبل وبعد التصحيح من 12% لـ1%. ALFA بيخرج في استعلام 14:20 لما إزالته تتعرف عند 14:25. ارفع Universe prices CSV بمعرّفات الإدراج وأسعار إغلاق بأوقات محددة. لو سعر الأساس أو الهدف ناقص، العضو بيظهر من غير ترتيب.

</div>

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

<div dir="rtl">

بعد تحميل أسعار التجربة، اختار Load demo sectors في Sector heatmap. عند 14:10 UTC الخريطة بتغطي 60% من الأوزان المعروفة. لما سعر BETA يتعرف عند 14:12 التغطية بتوصل 100% والمساهمة المرصودة بتطلع من 1.2% لـ6%. تعديل 14:16 بينقل BETA من Financials لـTechnology. افتح المربع علشان تشوف الترتيب والمساهمة وأوقات التصنيف. لبياناتك ارفع Sector and weight CSV.

</div>

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

<div dir="rtl">

افتح Historical replay → Open financial statements → Start financial demo. Original filing بيعرض مضاعف ربحية 10×. في نفس وقت التقييم، Restatement observed بيرفعه لـ15× وبيظهر إن حقوق الملكية العادية ناقصة. Revised capitalization بيرفعه لـ20×. ارفع Annual filings CSV وCapitalization CSV لو عندك، علشان تستعلم عن شركتك والوقت اللي البيانات كانت معروفة فيه.

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

افتح Historical replay → Open economic calendar → Start calendar demo. قبل النشر، التوقع 2.5% والرقم الفعلي لسه مش ظاهر. Actual observed بيعرض 2.7% عند 14:32 UTC. Revised actual بيعرض 2.8% والتعديلين موجودين في Release evidence. ارفع Macro calendar CSV علشان تستخدم بياناتك.

</div>

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

<div dir="rtl">

افتح Historical replay → Open option chain → Start option demo. زوج أبريل بسعر تنفيذ 100 بيبدأ بتقلب ضمني حوالي 20%. Late option quote بيعرض خيار الشراء بسعر تنفيذ 90 وتقلب 25%. Corrected spread بيرجع تقييم خيار بيع. افتح Implied volatility surface علشان تقارن المواعيد. حمّل Underlying CSV وOption quotes CSV لو عندك أسعارك.

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

افتح Historical replay → Open replay alerts → Start alert demo. First crossing بيعرض تنبيه عتبة واحد. Correction observed بيعرض الرصد المتصحح وعبور المتوسط المتحرك. Full alert replay بيعرض تمن تنبيهات. دوس Save to alert inbox مرتين، الأولى تحفظ تمن سجلات والتانية ما تضيفش جديد. حمّل Alert rules CSV وAlert observations CSV لبياناتك.

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

افتح Historical replay → Open paper ledger → Start paper demo. اتحرك من حجز نقد 503 لحد تنفيذ جزئي واحد يسيب 801.6. Final account بيعرض 663.7 نقدًا وربح محقق 13 بعد الإيقاف. حمّل Paper events CSV علشان تعيد تشغيل الأوامر والتنفيذات المحاكية بتاعتك.

</div>

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

<div dir="rtl">

افتح Historical replay → Open bar backtest → Start backtest demo. إشارة 14:05 UTC بتحط أمر شراء. فترة 14:06 الناقصة ما فيهاش تنفيذ. إغلاق 14:07 بينفّذ سهمين. Final backtest بيعرض قيمة 957.8. حمّل CSV للجلسات والشموع علشان تستخدم بياناتك المحلية.

</div>

<div dir="rtl">

في ديمو الاختبار التاريخي شغّل Walk-forward validation بست شمعات تدريب وشمعتين اختبار. أول نافذة كاملة بتظهر الساعة 14:09 UTC. الزوج 1:2 بيكسب التدريب ويفضل ثابت في شمعتين الاختبار اللي بيبدؤوا بحساب جديد.

</div>

<div dir="rtl">

في ديمو الاختبار التاريخي شغّل Seeded scenarios بالبذرة 20250403 و256 مسار وتمان حركات لكل مسار. قيمة الحساب في آخر التشغيل المرجعي 957.8 ووسيط السيناريوهات 997.6. نفس وقت القطع والبيانات والبذرة بيطلعوا نفس جدول المخاطر.

</div>

<div dir="rtl">

في ديمو مجموعة الإدراجات حمّل Delisting proceeds لـ BETA-001 واضبط وقتين القطع على 14:35 UTC. العائد لسه مش متاح. الساعة 14:37 العشرة أسهم ليها 70 USD مستحقة، والمبلغ بيتسجل كاش الساعة 14:50. التصحيحات بعد كده بتسيب النتايج القديمة زي ما هي وبتفصل BETA-002.

</div>

<div dir="rtl">

افتح Start split revisions demo واختار Split-adjusted. يوم 3 يونيو الساعة 14:10 UTC التصحيح بيسحب التعديل القديم. الساعة 14:20 النسبتين بيتحسبوا مع بعض. إلغاء SPLIT-A الساعة 14:30 بيسيب SPLIT-B والشموع الأصلية زي ما هي.

</div>

<div dir="rtl">

افتح Start dividend entitlement demo. استحقاق ALPHA بيبدأ بـ100 سهم ويوصل لـ120 مع تقرير متأخر. BETA بيستخدم 40 سهم. تصحيح ALPHA لـ110 سهم بعد الدفع بيرجّع 3 USD. ارجع علشان تشوف الرصيد القديم.

</div>

<div dir="rtl">

في ديمو مجموعة الإدراجات حمّل Portfolio replay. إغلاق BETA-001 الساعة 14:10 UTC بيظهر لما يتعرف الساعة 14:12. الساعة 14:45، مبلغ 70 USD المستحق منفصل عن 225 EUR قيمة أسهم BETA-002. الساعة 14:50 قيمة الأسهم ونقد الشطب مع بعض 284 USD.

</div>

<div dir="rtl">

اختار Compare charts وحدد أداة للمقارنة. Link by UTC بيحدد نفس اللحظة الظاهرة في اللوحتين. كبّر كل لوحة لوحدها. نسخة مساحة العمل بتحفظ الأداتين والمؤشرات وإعداد الربط.

</div>

<div dir="rtl">

اختار Draw measurement وحدد شمعة موجودة بتوقيت UTC وسعر لكل طرف. لما تكبّر أو تحرّك الشارت، الخط المحفوظ بيترسم تاني بنفس الإحداثيات. النسخة الاحتياطية بتحفظ الإحداثيات. التطبيق بيعرض فرق الوقت بالثواني وتغير السعر ونسبته المئوية.

</div>

<div dir="rtl">

افتح Indicators وحدد فترات SMA وEMA بعدد الشموع لكل لوحة. لو فيه أسعار إغلاق كفاية، الشارت بيعرض قيم الشمعة اللي اخترتها بتوقيت UTC. الفترات بتفضل محفوظة بعد تغيير الأداة أو إعادة التحميل أو استرجاع النسخة الاحتياطية.

</div>

<div dir="rtl">

افتح Export CSV تحت الشارت. نزّل شموع OHLCV عشان تستوردها تاني، أو ضيف المصدر والمتوسطات المتحركة المفعّلة للتحليل. المتوسطات بتفضل فاضية لحد ما يبقى فيه أسعار إغلاق كفاية.

</div>

<div dir="rtl">

اختار Close line من أي لوحة. الخط بيستخدم أسعار الإغلاق المرصودة وبيفضل يعرض الحجم والمؤشرات الشغالة. لو شمعة UTC مش موجودة المؤشر المرتبط مش بيظهر. النسخة الاحتياطية بتحفظ نوع الشارت لكل لوحة.

</div>

<div dir="rtl">

اختار OHLC bars. الخط الرأسي بيعرض أعلى وأقل سعر، والعلامة على الشمال للفتح وعلى اليمين للإغلاق. كل لوحة بتحتفظ بالنوع بتاعها والمؤشر المرتبط بيتبع العمود حسب وقت UTC بالضبط.

</div>

<div dir="rtl">

افتح Timeframe في أي لوحة واكتب فترة المصدر والهدف بالثواني. الشارت وملف CSV للتحليل بيعرضوا تغطية البيانات. النسخة الاحتياطية بتحفظ السلسلة الأصلية.

</div>

<div dir="rtl">

ضيف CSV لتقويم الجلسات في Timeframe. الفترات بتبدأ من وقت فتح كل جلسة، وآخر فترة بتقف عند الإغلاق المكتوب. ملف CSV للتحليل بيسجل التقويم وتغطية بيانات المصدر.

</div>

<div dir="rtl">

افتح Recorded tick bars واختار عدد الصفقات ووقت قطع الرصد. الشارت بيحافظ على ترتيب تسجيل الصفقات اللي في نفس الوقت، وبيعلّم الأعمدة الناقصة وبيصدّر أرقام التسلسل بدقة.

</div>

<div dir="rtl">

في Portfolio replay حمّل مثال التوزيعات أو ضيف CSV. الاستعلام بيستخدم الحيازة قبل تاريخ الاستبعاد، وبيسوّي عند يوم الدفع، وبيطبق التعديلات وقت رصدها.

</div>

بعد تحميل الأسعار افتح Relative returns في Universe screen. اختار معرّفين للإدراج ووقت أساس دقيق بتوقيت UTC. غيّر أوقات الاستعلام علشان تشوف أسعار الإقفال الناقصة والتعديلات، ونزّل المقارنة كلها في ملف CSV.

افتح Recorded market depth وحمّل ملف CSV لعمق السوق للأداة اللي اخترتها. اتحرك بين أوقات الرصد علشان تشوف مستويات الشرا والبيع وفجوة التسلسل والرجوع عند اللقطة الجاية. نزّل كل المستويات في CSV.

افتح Recorded footprint وحمّل صفقات الأداة المختارة. حدّد فترة التنفيذ وآخر وقت للرصد علشان تشوف حجم الشرا والبيع والاتجاه المجهول في كل نطاق سعر. نزّل البصمة وفرق الحجم التراكمي بالكامل في CSV.

بعد ما تعمل استعلام في Recorded footprint افتح Price profiles. قارن الحجم في كل نطاق سعر بعدد الفترات اللي حصل فيها تداول في النطاق. حدّد نسبة منطقة القيمة المطلوبة ونزّل البروفايلات كاملة في CSV.

افتح Rolling risk تحت Relative returns. ظبّط فاصل UTC وطول الفترة ومقياس التذبذب علشان تشوف العوائد المتاحة لكل إدراج وعدد العينات المزدوجة. نزّل الدراسة كاملة في CSV.

بعد تحميل الأسعار في Universe screen افتح Correlated portfolio scenarios. ظبّط الأوزان والبذرة ورسوم إعادة التوازن وراجع تغطية العوائد الكاملة والمئينات، ونزّل كل المسارات في CSV.

من Universe screen افتح Cross-sectional paper replay وحمّل تقرير السيولة. اضبط وقت أول قرار وإعدادات الترتيب وبعدها شوف الاختيارات والأوامر والكاش وقيمة التداول أو نزّل المحاكاة كاملة بصيغة CSV.

من Cross-sectional paper replay افتح Corporate cash reports وحمّل ملفات CSV المناسبة. شغّل المحاكاة وشوف الاستحقاق وتعديلات الدفع والمراكز اللي رجعت وإيصالات الكاش. نزّل سجل الكاش بصيغة CSV.

من Bar backtest افتح Recorded trade execution وحمّل CSV الصفقات. اضبط وقت التنفيذ ووقت المعرفة عشان تراجع التنفيذ الجزئي المتأخر وأرقام التسجيل والكاش وقيمة الحساب. نزّل السجل الكامل بصيغة CSV.

بعد محاكاة الترتيب افتح Cross-sectional walk-forward. قارن فترات الرجوع وعدد الأسهم، وراجع الاختبارات المنفصلة والتقييمات الناقصة، وبعدها صدّر الدرجات والمصادر بصيغة CSV.

اختار رسم وافتح Time-series formulas. اكتب تعبير OHLCV وآخر وقت للرصد وشوف القيم الدقيقة والصفوف اللي قيمها مش موجودة. صدّر الصيغة والمصدر وإصدار اللغة والنتايج بصيغة CSV.

حمّل تاريخ الشموع وافتح Formula paper backtest. اضبط صيغ الدخول والخروج والحدين الزمنيين. قارن التنفيذ بحجم الشموع والصفقات المسجلة، وصدّر الإيصالات كاملة بصيغة CSV.

نزّل حزمة الاستراتيجية من اختبار صيغ اتقبل. حمّلها في مساحة تانية عشان ترجع الصيغتين وطريقة التنفيذ وإعدادات الحساب بالظبط. استخدم نفس البيانات والحدود الزمنية عشان تكرر النتيجة.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Local REST](../local-rest-research.md) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings)

<!-- section:04 -->
## استورد بياناتك وشغّلها

<div dir="rtl">

في Import CSV اكتب السوق والرمز واختار OHLCV بصيغة UTF-8 وعندك إذن تخزنه. استخدم ثواني Unix أو تواريخ UTC أو وقت UTC آخره Z بترتيب متزايد. الحد ست خانات عشرية، والحجم مش سالب، وأعلى وأقل سعر لازم يضموا الفتح والقفل. صف غلط بيرفض الاستيراد كله. سجّل الفترة والمصدر وحق الاستخدام وطريقة التعديل في Series details.

</div>

<div dir="rtl">

حط وقت بداية الفترة في كل شمعة. في Historical replay اختار الأداة وتقويم CSV واكتب عدد ثواني صحيح (1–86,400). كل صف فيه حدود UTC بالدقة، فرق الدقايق عند الفتح، وregular أو early. الشبكة تبدأ مع الفتح، وآخر فترة ممكن تقصر لحد القفل. الشموع اللي بره الجلسة أو الشبكة بتترفض. الفترة الناقصة بتحرك الساعة وتحافظ على القيم اللي ظهرت.

</div>

<div dir="rtl">

الحد الأساسي 1,500,000 بايت و100,000 شمعة للملف. إعداد البناء يسمح لحد 8 MiB و100,000 صف. التقويم يقبل 1 MiB و10,000 جزء من غير تداخل و200,000 حدث. حصة المتصفح مستقلة.

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
## اعمل نسخة وانقلها واسترجعها

<div dir="rtl">

Workspace backup → Export workspace بيحفظ JSON بإصدار، فيه CSV الأصلي والمصدر والسلاسل الظاهرة والمخفية وترتيب القائمة والاختيار والمؤشرات. في البروفايل الهدف اختار Backup file، راجع الأعداد واضغط Restore workspace. معاملة واحدة بتبدّل كتالوج الهدف. لو محتاج القديم صدّره الأول.

</div>

<div dir="rtl">

استعمل نفس البروتوكول والهوست والبورت والبروفايل لما تحدّث. بيانات 0.1.0 بتتنقل لـ IndexedDB، وتترجع للقراية عشان تتأكد وتتساب القيمة الأصلية. اقفل التابات القديمة. النسخة نص واضح وSHA-256 بيتأكد من سلامتها. خزن واسمح بالوصول والاحتفاظ حسب حقوق البيانات.

</div>

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## التركيب وقواعد الحساب

<div dir="rtl">

Rust بيتحقق من الرمز وUTC وOHLCV، وبيحسب بأجزاء من المليون كأعداد صحيحة ويبني خطة أحداث الجلسة. React بيستعمل نفس Wasm، وCanvas للرسم، ومعاملات IndexedDB، وservice worker للتخزين المؤقت. رقم المراجعة بيكتشف الكتابات المتزامنة. الحالة مربوطة بالبروفايل والأصل.

</div>

<div dir="rtl">

SMA بيجمع نافذة متحركة بدقة. EMA بيبدأ بأول نافذة كاملة وبيقرّب كل خطوة لجزء من مليون، وفي حالة التعادل بعيد عن الصفر. الإعادة بتاخد القفلات اللي ظهرت بس. نهاية الفترة هي وقت الإتاحة في النموذج. وصول بيانات المورد وتصحيحاته والأوقات داخل الشمعة عايزة مدخلات تانية. صفوف المصدر بتفضل زي ما هي.

</div>

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## النشر ونطاق التشغيل

<div dir="rtl">

قدّم dist/ على HTTPS أو شغّل مشغّل loopback. نفس الأصل بيحافظ على مساحة الشغل. بورت أو بروفايل أو نافذة خصوصية تانية تستخدم مساحة مختلفة. عشان تجرب Tauri، ابني الويب وثبّت متطلبات النظام. CI بيبني على Windows Server 2022 وmacOS 15 وUbuntu 24.04 وبيفتح نافذة Linux. شوف جدول المحمول وARM وBSD. شغّل الاختبار على Chromium للكمبيوتر.

</div>

<div dir="rtl">

دلوقتي النموذج مستخدم محلي واحد لكل بروفايل. خلي البيانات والنسخ على أجهزة معتمدة. التحقق من الهوية، العزل، المراقبة، الاحتفاظ والتعافي محتاجين تصميم نشر متحقق منه. ZIP فيه إشعارات التراخيص وCycloneDX SBOM. سير عمل وسم الإصدار فيه إثبات مصدر الأثر.

</div>

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## راقب خدمة خارجية

<div dir="rtl">

TradingBotObserverV1 بيقرا runtime وstatus وaccount وportfolio من trading-bot متضبط لوحده. استخدم أصل موثوق وHTTPS بره loopback، وتوكن مسموح بيه من إعداد العملية. بص على التوقيت بتاع كل لقطة. لقطة فاضية أو خدمة سليمة مش بتثبت رصيد أو مراكز زيادة. بيانات الدخول والأوامر والتنفيذ عند الخدمة الخارجية.

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
## ابنِ من المصدر واتأكد

<div dir="rtl">

استخدم Node.js 22.12 أو أحدث مع npm، وRustup المحدد في rust-toolchain.toml، وPython 3.11 أو أحدث. شغّل من جذر المستودع. Vite بيطبع عنوان التطوير، غالبًا على 5173. الإنتاج على 4173. ثبّت إصدار Chromium المحدد قبل الاختبار.

</div>

<div dir="rtl">

التحقق بيغطي Rust وWasm والمتصفح وSDK والسيرفر المحلي والتراخيص وSBOM والتنبيهات. بعد كل حدث، المتوسطين نفس بداية حساب الدفعة الموافقة، بما فيها تغيير الساعة والفجوة والقفل البدري. CI بيستنى ID الصحيح للـ ZIP وبيقارن البايتات اللي اتنزّلت. وسم الإصدار المطابق بيفعّل الإثبات.

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
## حل المشاكل وكرّرها

<div dir="rtl">

لو البورت مشغول استخدم --port 4174 وانقل البيانات بالتصدير والاسترجاع. لو التشغيل من غير نت مش شغال افتح نسخة الإنتاج بالنت واستنى Offline ready. لو الملف اترفض، راجع الصف المذكور وبداية الفترة وتقويم السوق والتواريخ الصحيحة.

</div>

<div dir="rtl">

احتفظ بـ CSV والتقويم والفترة ومراجعة Git وإصدار المتصفح وتوقيت الحدث. بلّغ بمثال مصطنع وأول خطوة فشلت. سجل التحقق فيه أدلة المنصات والخطة فيها الأهداف الجاية.

</div>

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## المستودع والمساهمة والترخيص

<div dir="rtl">

المحرك والعينات في crates/core، والتطبيق والاختبارات في apps/terminal، والغلاف في apps/desktop، والـ SDK في packages/trading-bot والأدوات في scripts. اعمل تغييرات صغيرة ومختبرة. حافظ على الحقوق والإشعارات، وجدّد الجرد لما التبعيات تتغير، وبلّغ عن الثغرات بشكل خاص.

</div>

<div dir="rtl">

الكود الأصلي 0BSD والتبعيات بتحتفظ بتراخيصها. كل النسخ كاملة حسب مجموع اللي بيتكلموا اللغة الأولى والتانية في Ethnologue 2026، وفيها اللغتين اللي اتعادلوا بعد التقريب على المركز العشرين. الكتيبات المرتبطة والواجهة ممكن تكون بالإنجليزي.

</div>

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
