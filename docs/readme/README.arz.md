<!-- MarketWeft README · locale=arz -->

# MarketWeft

**0.3.0 · 0BSD**

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

إصدار 0.3.0 بيعيد تشغيل سلسلة تاريخية ثابتة حسب جلسات السوق. فيه كمان SDK TypeScript مستقل للقراية بس من trading-bot، وغلاف Tauri تجريبي. إجراءات الشركات، وتغذية السوق، والأوامر، والاستضافة لأكتر من مستخدم، والمثبتات الموقعة في الخطة.

</div>

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## شغّل النسخة المحمولة

<div dir="rtl">

نزّل browser-terminal-attempt-N من تشغيل GitHub ناجح. فك MarketWeft-browser-0.3.0.zip وسيب dist/ جنب serve-terminal.mjs وشغّل الأمر جوه نفس المجلد. افتح http://127.0.0.1:4173/ في متصفح حديث فيه WebAssembly وCanvas وBigInt وIndexedDB. استخدم Node.js 22.12 أو أحدث. مش محتاج تثبت npm. استنى Offline ready قبل ما تفصل النت.

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

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv)

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
