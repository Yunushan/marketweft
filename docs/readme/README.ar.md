<!-- MarketWeft README · locale=ar -->

# MarketWeft

**0.168.0 · 0BSD**

**لغات التوثيق**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · **العربية الفصحى** · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## ما الذي يقدمه MarketWeft

<div dir="rtl">

MarketWeft محطة بحث محلية للمحللين والمطورين والمشغّلين. تفتح ملفات OHLCV المصرح بها وتعرض الشموع والحجم وتحسب SMA وEMA بالفاصلة الثابتة. تحفظ قائمة المتابعة والأداة والمؤشرات في IndexedDB، وتعمل دون اتصال بعد تخزين الأصول مؤقتًا. الأسعار والأحجام المرفقة اصطناعية ولا تتطلب حساب مزوّد.

</div>

<div dir="rtl">

يضيف MarketWeft 0.168.0 مثبّتًا لكل مستخدم لنظام Windows ARM64 ويتحقق منه على Windows 11 ARM64. يضيف MarketWeft 0.7.0 فرز أعضاء الكون حسب عائد السعر وفق البيانات المعروفة عند وقت الاستعلام. تشمل إعادة التشغيل وفق الجلسات تجزئات الأسهم والتوزيعات النقدية وتغير العضوية والشطب. يتضمن المستودع أيضًا مراقب TypeScript للقراءة فقط لخدمة trading-bot مستقلة وغلاف Tauri تجريبيًا. لا تزال تغذيات البيانات وإدخال الأوامر والمثبّتات الموقّعة والاستضافة متعددة المستخدمين على خارطة الطريق.

</div>

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## تشغيل المحطة المحمولة

<div dir="rtl">

نزّل browser-terminal-attempt-N من تحقق GitHub ناجح وفك MarketWeft-browser-0.168.0.zip. أبقِ dist/ بجوار serve-terminal.mjs ونفّذ الأمر في المجلد نفسه. افتح http://127.0.0.1:4173/ بمتصفح يدعم WebAssembly وCanvas وBigInt وIndexedDB. يتطلب المشغّل Node.js 22.12 أو أحدث ولا يحتاج تثبيت npm. انتظر Offline ready قبل قطع الاتصال.

</div>

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md) · [Linux native verification](../../docs/platforms.md#linux-native-verification) · [Ubuntu desktop package](../../docs/platforms.md#ubuntu-desktop-package) · [Ubuntu upgrade verification](../../docs/platforms.md#verify-an-ubuntu-package-upgrade) · [Ubuntu package provenance](../../docs/platforms.md#verify-ubuntu-package-provenance)

<!-- section:03 -->
## إعادة تشغيل مثال NYSE

<div dir="rtl">

افتح Historical replay واختر Start demo. ينقلك Next event للأمام وPrevious event للخلف، ويتحكم Play وPause في التشغيل، ويعيد Reset العرض إلى البداية. يبدأ الرسم فارغًا وتظهر الشمعة عند نهاية فترتها. يعني Event time البداية أو حد الجلسة، ويبيّن Observed at وقت الإتاحة. السرعة تغيّر وتيرة العرض فقط.

</div>

<div dir="rtl">

في 31 أكتوبر 2025 يبدأ التداول 13:30 UTC (UTC−04:00)، وفي 3 نوفمبر يبدأ 14:30 UTC (UTC−05:00). تظهر فجوة 15:00 يوم 3 نوفمبر عند 15:30. عطلة عيد الشكر بلا فترات. في 28 نوفمبر ينتهي التداول مبكرًا عند 18:00 UTC بعد سبع شمعات نصف ساعة. المثال 20 جلسة و253 شمعة و294 حدثًا ببيانات اصطناعية وساعات NYSE المنشورة.

</div>

<div dir="rtl">

افتح Historical replay → Start split demo وبدّل Price basis بين Raw وSplit-adjusted عند الحدث نفسه. تُعلن تجزئة 2 مقابل 1 وتُرصد قبل سريانها، ويتطابق العرضان حتى ذلك الحين. عند السريان يتغير آخر إغلاق سابق من 106.50 خام إلى 53.25 معدل ويتضاعف الحجم. تبقى أول شمعة لاحقة عند 53.00. لاستخدام بياناتك، حمّل Corporate actions CSV للأداة المحددة وأكد أن OHLCV خام وأضف تقويم الجلسات. تطبق أحدث نسبة مرصودة بعد السريان. تبدأ التقارير المتأخرة والتصحيحات بتغيير العرض عند رصدها. يبقى التاريخ الأصلي سليمًا.

</div>

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

<div dir="rtl">

افتح Historical replay → Start dividend demo لمتابعة 100 سهم مستحق لكل توزيع. في تاريخ التداول دون الحق ينشأ مبلغ مستحق قدره USD 25.00. ترفعه مراجعة المبلغ إلى USD 30.00 وتؤجل مراجعة موعد الدفع القيد. يضيف التقرير المتأخر EUR 10.00 عند رصده، ويترك التصحيح بعد الدفع USD 28.00. ارجع لرؤية الأرصدة السابقة. لبياناتك، حمّل Cash dividends CSV وأدخل Entitled shares per distribution. استخدم معرّف التوزيع نفسه في المراجعات. يبقي السجل العملات منفصلة ويحفظ القيود السابقة والأسعار الأصلية.

</div>

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

<div dir="rtl">

افتح Historical replay → Open universe replay → Start universe demo. عند 14:05 UTC وحده ALFA عضو، وينضم BETA عند 14:10. تصبح إزالة ALFA الفعالة عند 14:20 معروفة عند 14:25. ويصبح شطب BETA عند 14:30 معروفًا عند 14:35. ارجع لاستعادة العضوية السابقة أو استعلم بحدين مستقلين Effective time وKnown time. حمّل Universe membership CSV لبياناتك. ثبّت معرّف التغيير عند المراجعة وافصل معرّفات الإدراج عند إعادة استخدام الرمز.

</div>

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

<div dir="rtl">

في Universe screen اختر Load demo prices وأبقِ وقت الأساس 14:00 UTC. يتصدر ALFA بعائد 1% عند 14:05. ينضم BETA عند 14:10 ويبقى بلا ترتيب حتى يُعرف إغلاقه عند 14:12. استعلم عن الوقت الفعلي 14:10 بوقتي معرفة 14:12 ثم 14:16 لمقارنة عائد BETA البالغ 12% بعائده المصحح البالغ 1%. يخرج ALFA عند الاستعلام عن 14:20 بعد معرفة إزالته عند 14:25. حمّل Universe prices CSV بمعرّفات الإدراج لاستخدام إغلاقات من أوقات محددة. يبقى العضو بلا ترتيب إذا غاب سعر الأساس أو الهدف.

</div>

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

<div dir="rtl">

بعد تحميل الأسعار التجريبية، اختر Load demo sectors في Sector heatmap. عند 14:10 UTC تُغطّى 60% من الأوزان المعروفة. وعند معرفة سعر BETA في 14:12 ترتفع التغطية إلى 100% والمساهمة المرصودة من 1.2% إلى 6%. ينقل تصحيح القطاع عند 14:16 سهم BETA من Financials إلى Technology. افتح الخانة لرؤية الرتبة والمساهمة وأوقات التصنيف. لبياناتك حمّل Sector and weight CSV.

</div>

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

<div dir="rtl">

افتح Historical replay → Open financial statements → Start financial demo. يعرض Original filing مضاعف ربحية 10×. وفي وقت التقييم نفسه يعرض Restatement observed مضاعفًا 15× وغياب حقوق الملكية العادية. يرفع Revised capitalization المضاعف إلى 20×. حمّل Annual filings CSV وCapitalization CSV الاختياري للاستعلام عن مصدرك وحدّ المعرفة.

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

افتح Historical replay → Open economic calendar → Start calendar demo. قبل الإصدار يكون التوقع 2.5% والقيمة الفعلية غير متاحة. يعرض Actual observed قيمة 2.7% عند 14:32 UTC. يعرض Revised actual قيمة 2.8% ويمكن تتبع التصحيحين في Release evidence. حمّل Macro calendar CSV لاستخدام سجلات النشر الخاصة بك.

</div>

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

<div dir="rtl">

افتح Historical replay → Open option chain → Start option demo. يبدأ زوج أبريل بسعر تنفيذ 100 عند تقلب ضمني يقارب 20%. يعرض Late option quote خيار شراء بسعر تنفيذ 90 وتقلب 25%. يصحح Corrected spread عرض خيار بيع كان غير متاح للتقييم. افتح Implied volatility surface لمقارنة آجال الانتهاء. حمّل Underlying CSV وOption quotes CSV لبياناتك.

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

افتح Historical replay → Open replay alerts → Start alert demo. يعرض First crossing تنبيه عتبة واحدًا. يعرض Correction observed الرصد المصحح وعبور المتوسط المتحرك. يعرض Full alert replay ثمانية تنبيهات. اضغط Save to alert inbox مرتين للتحقق من حفظ ثمانية سجلات ثم عدم إضافة سجلات جديدة. حمّل Alert rules CSV وAlert observations CSV لاستخدام بياناتك.

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

افتح Historical replay → Open paper ledger → Start paper demo. انتقل من حجز 503 إلى تنفيذ جزئي واحد يترك 801.6 نقدًا. يعرض Final account بعد الإيقاف 663.7 نقدًا وربحًا محققًا قدره 13. حمّل Paper events CSV لإعادة تشغيل أوامرك وتنفيذاتك وعناصر تحكمك المحاكية.

</div>

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

<div dir="rtl">

افتح Historical replay → Open bar backtest → Start backtest demo. تضع إشارة 14:05 UTC أمر شراء. لا تحدث تعبئة في فترة 14:06 المفقودة. يتيح إغلاق 14:07 تنفيذ سهمين. يعرض Final backtest قيمة حقوق قدرها 957.8. حمّل ملفات CSV للجلسات والشموع لاستخدام سجلك المحلي.

</div>

<div dir="rtl">

في عرض الاختبار التاريخي شغّل Walk-forward validation بست شموع للتدريب وشمعتين للاختبار. تظهر أول نافذة مكتملة عند 14:09 UTC. يفوز الزوج 1:2 في التدريب ويظل ثابتًا خلال شمعتَي الاختبار اللتين تبدآن من حساب جديد.

</div>

<div dir="rtl">

في عرض الاختبار التاريخي شغّل Seeded scenarios بالبذرة 20250403 و256 مسارًا وثماني حركات لكل مسار. قيمة حقوق الملكية النهائية في الحالة المرجعية 957.8 ووسيط السيناريوهات 997.6. تعطي المهلة والمدخلات والبذرة نفسها جدول المخاطر نفسه.

</div>

<div dir="rtl">

في عرض مجموعة الإدراجات حمّل Delisting proceeds لـ BETA-001 واضبط وقتَي القطع على 14:35 UTC لرؤية غياب العائدات. عند 14:37 يصبح لعشرة أسهم مبلغ مستحق قدره 70 USD، ويُقيد نقدًا عند 14:50. تبقى اللقطات السابقة محفوظة ويظل BETA-002 منفصلًا.

</div>

<div dir="rtl">

افتح Start split revisions demo واختر Split-adjusted. في 3 يونيو عند 14:10 UTC يسحب وقت السريان المعدّل الأثر السابق. عند 14:20 يتراكم أثر معرّفين. عند إلغاء SPLIT-A في 14:30 يظل أثر SPLIT-B وتبقى الشموع الأصلية كما هي.

</div>

<div dir="rtl">

افتح Start dividend entitlement demo. يبدأ استحقاق ALPHA بمئة سهم ثم يرتفع إلى 120 عند وصول تقرير متأخر. يستخدم BETA أربعين سهمًا. بعد الدفع يعكس التصحيح إلى 110 أسهم في ALPHA مبلغ 3 USD. ارجع لعرض الرصيد السابق.

</div>

<div dir="rtl">

في عرض مجموعة الإدراجات حمّل Portfolio replay. يظهر إغلاق BETA-001 عند 14:10 UTC حين يصبح معلومًا عند 14:12. عند 14:45 يبقى مبلغ 70 USD مستحقًا منفصلًا عن قيمة أسهم BETA-002 البالغة 225 EUR. عند 14:50 يبلغ مجموع قيمة الأسهم ونقد الشطب 284 USD.

</div>

<div dir="rtl">

اختر Compare charts وحدد أداة للمقارنة. يحدد Link by UTC اللحظة المرئية نفسها في اللوحتين. يمكنك تكبير كل لوحة على حدة. تحفظ نسخة مساحة العمل الأداتين والمؤشرات وإعداد الربط.

</div>

<div dir="rtl">

اختر Draw measurement وحدد عمودًا موجودًا بتوقيت UTC وسعرًا لكل طرف. يعيد الرسم إظهار الخط المحفوظ عند التكبير أو التحريك. تحفظ نسخة مساحة العمل الإحداثيات ويعرض التطبيق الزمن بالثواني وتغير السعر وقيمته المئوية.

</div>

<div dir="rtl">

افتح Indicators واضبط فترات SMA وEMA بعدد الشموع لكل لوحة. يعرض الرسم قيم الشمعة المختارة بتوقيت UTC عند توافر أسعار إغلاق كافية. تبقى الفترات عند تبديل الأداة أو إعادة التحميل أو الاستعادة من النسخة الاحتياطية.

</div>

<div dir="rtl">

افتح Export CSV أسفل الرسم. نزّل أعمدة OHLCV لإعادة الاستيراد، أو أضف بيانات المصدر والمتوسطات المتحركة المفعلة لأغراض البحث. تظل قيم المتوسطات فارغة حتى تتوفر أسعار إغلاق كافية.

</div>

<div dir="rtl">

اختر Close line من قائمة نوع الرسم في أي لوحة. يستخدم الخط أسعار الإغلاق المرصودة ويحافظ على الحجم والمؤشرات المفعلة. لا يظهر مؤشر تقاطع مرتبط لشمعة UTC غير مرصودة. تحفظ نسخة مساحة العمل أنواع الرسوم.

</div>

<div dir="rtl">

اختر OHLC bars لعرض أعلى سعر وأدناه على خط رأسي، والافتتاح يسارًا والإغلاق يمينًا. تحتفظ كل لوحة بنوع الرسم الخاص بها، ويظل مؤشر التقاطع مرتبطًا بالوقت الدقيق للعمود بتوقيت UTC.

</div>

<div dir="rtl">

افتح Timeframe في أي لوحة وأدخل مدتي المصدر والهدف بالثواني. يعرض الرسم وملف CSV البحثي تغطية المصدر المرصودة. تحفظ نسخة مساحة العمل السلسلة الأصلية.

</div>

<div dir="rtl">

أضف ملف CSV لتقويم الجلسات في Timeframe. تبدأ الفترات من افتتاح كل جلسة وتنتهي الفترة الأخيرة عند الإغلاق المدرج. يسجل CSV البحثي التقويم وتغطية البيانات المصدرية.

</div>

<div dir="rtl">

افتح Recorded tick bars واختر عدد الصفقات ووقت قطع الرصد. يحافظ الرسم على ترتيب التسجيل للصفقات ذات الوقت نفسه، ويميز الأعمدة غير المكتملة، ويصدر أرقام تسلسلها الدقيقة.

</div>

<div dir="rtl">

في Portfolio replay حمّل عرض دخل التوزيعات أو أضف CSV لتوزيعات المحفظة. يستخدم الاستعلام الحيازات قبل تاريخ الاستبعاد، ويسوّي عند تاريخ الدفع، ويطبق المراجعات في وقت رصدها.

</div>

بعد تحميل الأسعار، افتح Relative returns في Universe screen. اختر معرّفي إدراج ووقت أساس دقيقًا بتوقيت UTC. غيّر أوقات الاستعلام لمراجعة أسعار الإغلاق المفقودة والتعديلات، ثم نزّل المقارنة الكاملة بصيغة CSV.

افتح Recorded market depth وحمّل ملف عمق السوق بصيغة CSV للأداة المختارة. تنقّل بين أوقات الرصد لمراجعة مستويات الشراء والبيع وفجوة التسلسل والاستعادة عند اللقطة التالية. نزّل كل المستويات بصيغة CSV.

افتح Recorded footprint وحمّل صفقات الأداة المختارة. حدّد نافذة التنفيذ ووقت الرصد لمعاينة حجم الشراء والبيع والاتجاه المجهول في كل نطاق سعري. نزّل البصمة والفرق التراكمي كاملين بصيغة CSV.

بعد تشغيل استعلام في Recorded footprint، افتح Price profiles. قارن الحجم حسب السعر بعدد الفترات الزمنية التي شهدت صفقات عند كل نطاق سعري. حدّد النسبة المستهدفة لمنطقة القيمة ونزّل الملفات الكاملة بصيغة CSV.

افتح Rolling risk أسفل Relative returns. اضبط الفاصل الزمني UTC وطول النافذة ومقياس التقلب لمراجعة العوائد المتاحة لكل إدراج وعدد العينات المزدوجة. نزّل الدراسة المتحركة كاملة بصيغة CSV.

بعد تحميل الأسعار في Universe screen، افتح Correlated portfolio scenarios. اضبط أوزان الإدراجات والبذرة ورسوم إعادة التوازن، وراجع تغطية العوائد الكاملة والمئينات، ثم نزّل جميع المسارات بصيغة CSV.

في Universe screen افتح Cross-sectional paper replay وحمّل تقرير السيولة. حدّد وقت القرار الأول وإعدادات الترتيب، ثم راجع الاختيارات والأوامر والنقد وقيمة الصفقات أو نزّل سجل المحاكاة الكامل بصيغة CSV.

في Cross-sectional paper replay افتح Corporate cash reports وحمّل ملفات CSV المعنية. شغّل المحاكاة وراجع الاستحقاق وتعديلات الدفع والمراكز المستعادة وإيصالات النقد، ثم نزّل سجل التدفقات بصيغة CSV.

في Bar backtest افتح Recorded trade execution وحمّل ملف الصفقات بصيغة CSV. اضبط حدود وقت التنفيذ ووقت المعرفة لفحص التنفيذ الجزئي المتأخر ومعرّفات التسجيل والنقد والقيمة، ثم نزّل السجل الكامل.

بعد تشغيل محاكاة الترتيب افتح Cross-sectional walk-forward. قارن مدد الاسترجاع وأعداد الأدوات، وراجع نتائج الاختبارات المستقلة والتقييمات غير المتاحة، ثم صدّر الدرجات والمصادر بصيغة CSV.

اختر رسمًا وافتح Time-series formulas. أدخل تعبير OHLCV ووقت انتهاء الرصد، ثم افحص القيم الدقيقة والصفوف غير المتاحة وصدّر الصيغة والمصدر وإصدار اللغة والنتائج بصيغة CSV.

حمّل سجل الأعمدة وافتح Formula paper backtest. أدخل تعبيري الدخول والخروج وحددي الوقت، وقارن التنفيذ بحجم الأعمدة أو الصفقات المسجلة، ثم صدّر الإيصالات بصيغة CSV.

نزّل حزمة استراتيجية من اختبار صيغ مقبول. حمّلها في مساحة عمل أخرى لاستعادة الصيغتين ووضع التنفيذ وإعدادات الحساب الورقي الدقيقة، ثم كرّر النتيجة باستخدام البيانات وحدود الوقت نفسها.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Fibonacci time zones](../chart-workspace.md#fibonacci-time-zones) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

<!-- section:04 -->
## استيراد بياناتك وإعادة تشغيلها

<div dir="rtl">

في Import CSV أدخل السوق والرمز واختر OHLCV بصيغة UTF-8 مع حق التخزين. استخدم ثواني Unix أو تواريخ UTC أو أوقات UTC تنتهي بـ Z وبترتيب تصاعدي دقيق. ست خانات عشرية كحد أقصى، وحجم غير سالب، وأعلى وأدنى سعر يحيطان بالفتح والإغلاق. يرفض صف خاطئ الاستيراد كله. في Series details دوّن الفترة والمصدر وحق الاستخدام وسياسة التعديل.

</div>

<div dir="rtl">

ضع وقت بداية الفترة لكل شمعة. في Historical replay اختر الأداة وتقويم CSV وأدخل عدد ثوانٍ صحيحًا من 1 إلى 86,400. اكتب حدود UTC الدقيقة وفارق الدقائق عند الفتح وregular أو early. تبدأ الشبكة عند الفتح وقد تقصر الفترة الأخيرة. تُرفض الشموع خارج الجلسة أو الشبكة. تقدّم الفجوة الساعة وتحفظ القيم السابقة.

</div>

<div dir="rtl">

الحد الافتراضي للملف 1,500,000 بايت و100,000 شمعة. يسمح إعداد البناء بحد أقصى 8 MiB و100,000 صف. حدود التقويم 1 MiB و10,000 مقطع غير متداخل و200,000 حدث. تبقى حصة المتصفح مستقلة.

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
## النسخ الاحتياطي والترحيل والاستعادة

<div dir="rtl">

يحفظ Workspace backup → Export workspace ملف JSON بإصدار يتضمن CSV الأصلي والمصدر والسلاسل الظاهرة والمخفية وترتيب القائمة والاختيار والمؤشرات. في الملف الشخصي الهدف اختر Backup file وراجع الأعداد ثم اضغط Restore workspace. تستبدل معاملة واحدة فهرس الهدف. صدّر بيانات الهدف أولًا إذا أردت حفظها.

</div>

<div dir="rtl">

استخدم المخطط والمضيف والمنفذ والملف الشخصي نفسها عند الترقية. يُرحّل 0.1.0 إلى IndexedDB مع إعادة القراءة للتحقق وحفظ القيمة الأصلية. أغلق علامات التبويب القديمة. النسخة نص واضح، ويحقق SHA-256 سلامتها. طبّق حقوق البيانات على التخزين والوصول والاحتفاظ.

</div>

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## البنية وقواعد الحساب

<div dir="rtl">

يتحقق Rust من الهوية وUTC وOHLCV، ويحسب بمليونيات صحيحة ويضع خطة أحداث الجلسات. يستعمل React المحرك ذاته في Wasm وCanvas للرسم وIndexedDB للمعاملات وعامل خدمة للذاكرة المؤقتة. تكتشف المراجعات الكتابة المتزامنة. الحالة مرتبطة بالملف الشخصي والأصل.

</div>

<div dir="rtl">

يستخدم SMA مجموعًا متحركًا دقيقًا. يبدأ EMA بأول نافذة كاملة ويقرّب كل خطوة إلى جزء من مليون، بعيدًا عن الصفر عند التعادل. تعمل الإعادة على أسعار الإغلاق المشاهدة وحدها. نهاية الفترة هي وقت الإتاحة المفترض. وصول المزود والتصحيحات والأزمنة داخل الشمعة تتطلب مدخلات مستقلة. تبقى صفوف المصدر سليمة.

</div>

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## النشر ونطاق التشغيل

<div dir="rtl">

قدّم dist/ عبر HTTPS أو شغّل خادم loopback. أبقِ الأصل للحفاظ على مساحة العمل. المنفذ أو الملف الشخصي أو النافذة الخاصة الأخرى لها تخزين مختلف. لتجربة Tauri ابنِ الواجهة وثبّت متطلبات النظام. يبني CI على Windows Server 2022 وmacOS 15 وUbuntu 24.04 ويختبر نافذة Linux. راجع مصفوفة المحمول وARM وBSD. استخدم Chromium المكتبي للاختبار.

</div>

<div dir="rtl">

النموذج الحالي مستخدم محلي واحد لكل ملف شخصي. خزّن البيانات والنسخ على أجهزة معتمدة. تحتاج المصادقة والعزل والرصد والاحتفاظ وأهداف التعافي إلى نشر متحقق منه. يحتوي ZIP إشعارات التراخيص وSBOM وفق CycloneDX. يتضمن مسار وسوم الإصدار إثبات المصدر.

</div>

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## مراقبة خدمة خارجية

<div dir="rtl">

يقرأ TradingBotObserverV1 عمليات runtime وstatus وaccount وportfolio من trading-bot مضبوط مستقلًا. استخدم أصلًا موثوقًا وHTTPS خارج loopback ورمزًا معتمدًا من إعداد العملية. فسّر كل لقطة وفق وقتها. لا تثبت لقطة فارغة أو حالة صحية أرصدة أو مراكز إضافية. بيانات الاعتماد والأوامر والتنفيذ لدى الخدمة الخارجية.

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
## البناء والتحقق من المصدر

<div dir="rtl">

استخدم Node.js 22.12 أو أحدث مع npm وسلسلة Rustup المثبتة في rust-toolchain.toml وPython 3.11 أو أحدث. نفّذ من جذر المستودع. يعلن Vite عنوان التطوير على 5173 غالبًا، بينما الإنتاج على 4173. ثبّت Chromium المثبت بالإصدار قبل الاختبارات.

</div>

<div dir="rtl">

يتحقق المسار من Rust وWasm والمتصفح وSDK والخادم والترخيص وSBOM والنشرات. يُقارن المتوسطان بجزء البداية المطابق من نتيجة الدفعة عند كل حدث، بما فيه تغيير التوقيت والفجوة والإغلاق المبكر. ينتظر CI معرّف ZIP المحدد ويقارن بايتات التنزيل. الوسم المطابق وحده يطلق إثبات الإصدار.

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
## استكشاف المشكلات وإعادة إنتاجها

<div dir="rtl">

إذا كان المنفذ مشغولًا استخدم --port 4174 وانقل البيانات بالتصدير والاستعادة. لمشكلة العمل دون اتصال افتح حزمة الإنتاج أولًا عبر الشبكة وانتظر Offline ready. عند الرفض افحص السطر المذكور وبداية الفترة وتقويم السوق والتواريخ.

</div>

<div dir="rtl">

احتفظ بـ CSV والتقويم والفترة ومراجعة Git وإصدار المتصفح ووقت الحدث. أرسل مثالًا اصطناعيًا وأول خطوة فاشلة. يسجل التحقق أدلة المنصات وتوضح خارطة الطريق الأهداف التالية.

</div>

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## المستودع والمساهمة والترخيص

<div dir="rtl">

المحرك والعينات في crates/core، والمتصفح واختباراته في apps/terminal، والغلاف في apps/desktop، والحزمة في packages/trading-bot، والأدوات في scripts. اجعل التغييرات صغيرة ومختبرة. احترم حقوق البيانات والإشعارات، وحدّث الجرد بعد تغييرات التبعيات وأبلغ عن الثغرات سرًا.

</div>

<div dir="rtl">

الكود الأصلي تحت 0BSD وتحتفظ التبعيات بتراخيصها. تتبع الإصدارات الكاملة Ethnologue 2026 بمجموع متحدثي اللغة الأولى والثانية، وتشمل اللغتين المتعادلتين بعد التقريب في المرتبة العشرين. قد تكون الواجهة والأدلة المرتبطة بالإنجليزية.

</div>

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
