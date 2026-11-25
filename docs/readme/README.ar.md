<!-- MarketWeft README · locale=ar -->

# MarketWeft

**0.3.0 · 0BSD**

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

يتيح الإصدار 0.3.0 إعادة تشغيل سلسلة تاريخية ثابتة وفق جلسات التداول. يتضمن المستودع أيضًا حزمة TypeScript مستقلة للقراءة فقط مع trading-bot وغلاف Tauri تجريبيًا. إجراءات الشركات والتغذيات والأوامر والاستضافة متعددة المستخدمين والمثبتات الموقّعة ضمن الخطة.

</div>

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## تشغيل المحطة المحمولة

<div dir="rtl">

نزّل browser-terminal-attempt-N من تحقق GitHub ناجح وفك MarketWeft-browser-0.3.0.zip. أبقِ dist/ بجوار serve-terminal.mjs ونفّذ الأمر في المجلد نفسه. افتح http://127.0.0.1:4173/ بمتصفح يدعم WebAssembly وCanvas وBigInt وIndexedDB. يتطلب المشغّل Node.js 22.12 أو أحدث ولا يحتاج تثبيت npm. انتظر Offline ready قبل قطع الاتصال.

</div>

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## إعادة تشغيل مثال NYSE

<div dir="rtl">

افتح Historical replay واختر Start demo. ينقلك Next event للأمام وPrevious event للخلف، ويتحكم Play وPause في التشغيل، ويعيد Reset العرض إلى البداية. يبدأ الرسم فارغًا وتظهر الشمعة عند نهاية فترتها. يعني Event time البداية أو حد الجلسة، ويبيّن Observed at وقت الإتاحة. السرعة تغيّر وتيرة العرض فقط.

</div>

<div dir="rtl">

في 31 أكتوبر 2025 يبدأ التداول 13:30 UTC (UTC−04:00)، وفي 3 نوفمبر يبدأ 14:30 UTC (UTC−05:00). تظهر فجوة 15:00 يوم 3 نوفمبر عند 15:30. عطلة عيد الشكر بلا فترات. في 28 نوفمبر ينتهي التداول مبكرًا عند 18:00 UTC بعد سبع شمعات نصف ساعة. المثال 20 جلسة و253 شمعة و294 حدثًا ببيانات اصطناعية وساعات NYSE المنشورة.

</div>

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv)

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
