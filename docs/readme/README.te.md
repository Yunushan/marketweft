<!-- MarketWeft README · locale=te -->

# MarketWeft

**0.4.0 · 0BSD**

**పత్రాల భాషలు**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · **తెలుగు** · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft ఏమి చేస్తుంది

MarketWeft విశ్లేషకులు, డెవలపర్లు, నిర్వాహకుల కోసం స్థానిక పరిశోధన టెర్మినల్. అనుమతి ఉన్న OHLCV ఫైళ్లను తెరుస్తుంది, క్యాండిళ్లు మరియు పరిమాణం చూపిస్తుంది, స్థిర దశాంశంతో SMA, EMA లెక్కిస్తుంది. గమనిక జాబితా, ఎంచుకున్న సాధనం, సూచికలు IndexedDBలో ఉంటాయి. వనరులు కాష్ అయిన తర్వాత ఆఫ్‌లైన్‌లో పనిచేస్తుంది. అందించిన ధరలు, పరిమాణం కృత్రిమమైనవి. ఖాతా అవసరం లేదు.

MarketWeft 0.4.0 మార్పులేని చరిత్రను సెషన్ ప్రకారం నడిపేటప్పుడు అప్పటికి తెలిసిన షేరు విభజనలను కలుపుతుంది. ప్రత్యేక trading-bot చదివే TypeScript SDK, ప్రయోగాత్మక Tauri హోస్ట్ కూడా ఉన్నాయి. నగదు డివిడెండ్లు, సంస్థ విభజనలు, ఫీడ్లు, ఆర్డర్లు, బహుళ వినియోగదారుల హోస్టింగ్, సంతకం ఉన్న ఇన్‌స్టాలర్లు ప్రణాళికలో ఉన్నాయి.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## పోర్టబుల్ టెర్మినల్ ప్రారంభించండి

విజయవంతమైన GitHub పరీక్ష నుంచి browser-terminal-attempt-N దిగుమతి చేసుకోండి. MarketWeft-browser-0.4.0.zip విడదీసి dist/ ను serve-terminal.mjs పక్కన ఉంచండి. అక్కడే ఆదేశాన్ని నడపండి. WebAssembly, Canvas, BigInt, IndexedDB ఉన్న బ్రౌజర్‌లో http://127.0.0.1:4173/ తెరవండి. Node.js 22.12 లేదా కొత్తది కావాలి. npm స్థాపన అక్కరలేదు. కనెక్షన్ ఆపేముందు Offline ready కోసం వేచి ఉండండి.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## NYSE ఉదాహరణను నడపండి

Historical replay లో Start demo ఎంచుకోండి. Next event ముందుకు, Previous event వెనక్కి. Play మరియు Pause చలనాన్ని నియంత్రిస్తాయి. Reset చూపిన చరిత్రను తొలగిస్తుంది. చార్ట్ ఖాళీగా మొదలవుతుంది. వ్యవధి చివర్లో క్యాండిల్ కనిపిస్తుంది. Event time ప్రారంభం లేదా సెషన్ సరిహద్దు. Observed at అందుబాటు సమయం. వేగం తెరపై నడకనే మారుస్తుంది.

అక్టోబర్ 31, 2025న ప్రారంభం 13:30 UTC (UTC−04:00), నవంబర్ 3న 14:30 UTC (UTC−05:00). నవంబర్ 3న 15:00 వ్యవధి లేనిది 15:30కి తెలుస్తుంది. Thanksgiving రోజున వ్యవధులు లేవు. నవంబర్ 28న ఏడు 30-నిమిషాల క్యాండిళ్ల తర్వాత 18:00 UTCకి ముందే ముగుస్తుంది. 20 సెషన్లు, 253 క్యాండిళ్లు, 294 సంఘటనలు ఉన్నాయి. ధరలు కృత్రిమం, సమయం NYSE ప్రచురిత షెడ్యూల్‌ది.

Historical replay → Start split demo తెరిచి అదే సంఘటనలో Price basis ను Raw, Split-adjusted మధ్య మార్చండి. 2-కి-1 విభజన అమలుకు ముందు ప్రకటించి పరిశీలించబడుతుంది. అప్పటివరకు రెండు వీక్షణలు సమానం. అమల్లోకి రాగానే ముందు చివరి ముగింపు ధర ముడి 106.50 నుంచి సర్దుబాటు చేసిన 53.25 అవుతుంది, పరిమాణం రెట్టింపవుతుంది. తర్వాతి తొలి క్యాండిల్ 53.00గానే ఉంటుంది. మీ డేటాకు సాధనపు Corporate actions CSV, సెషన్ క్యాలెండర్ ఇచ్చి OHLCV ముడిదని నిర్ధారించండి. అమలయ్యాక తెలిసిన తాజా నిష్పత్తి వర్తిస్తుంది. ఆలస్య నివేదికలు, సవరణలు చూసిన సమయం నుంచే వీక్షణను మారుస్తాయి. మూల చరిత్ర అలాగే ఉంటుంది.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv)

<!-- section:04 -->
## మీ డేటాను దిగుమతి చేసి పునరావృతం చేయండి

Import CSV లో మార్కెట్, చిహ్నం ఇచ్చి అధీకృత UTF-8 OHLCV ఎంచుకోండి. ఖచ్చితంగా పెరుగుతున్న Unix సెకన్లు, UTC తేదీలు లేదా Zతో ముగిసే UTC సమయం వాడండి. గరిష్ఠం ఆరు దశాంశాలు, ఋణాత్మకం కాని పరిమాణం, ప్రారంభ ముగింపు ధరలను చుట్టే కనిష్ఠం, గరిష్ఠం ఇవ్వండి. తప్పు వరుస మొత్తం దిగుమతిని ఆపుతుంది. Series details లో వ్యవధి, మూలం, హక్కు, సర్దుబాటు విధానం రాయండి.

క్యాండిల్‌కు వ్యవధి ప్రారంభ సమయం ఇవ్వండి. Historical replay లో సాధనం, సెషన్ CSV, 1–86,400 పూర్తి సెకన్లు ఎంచుకోండి. వరుసకు ఖచ్చితమైన UTC సరిహద్దులు, ప్రారంభ నిమిషాల ఆఫ్‌సెట్, regular లేదా early ఇవ్వండి. గ్రిడ్ ప్రారంభం నుంచి ఉంటుంది, చివరి వ్యవధి చిన్నది కావచ్చు. సెషన్ లేదా గ్రిడ్ బయట క్యాండిల్ తిరస్కరించబడుతుంది. లోటు గడియారాన్ని ముందుకు జరిపి కనిపించిన ధరలను ఉంచుతుంది.

ఫైలు మూల పరిమితి 1,500,000 బైట్లు, 100,000 క్యాండిళ్లు. బిల్డ్ సెట్టింగ్ 8 MiB, 100,000 వరుసల వరకు. క్యాలెండర్ 1 MiB, అతిక్రమించని 10,000 భాగాలు, 200,000 సంఘటనలు స్వీకరిస్తుంది. బ్రౌజర్ కోటా వేరుగా వర్తిస్తుంది.

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
## బ్యాకప్, తరలింపు, పునరుద్ధరణ

Workspace backup → Export workspace మూల CSV, మూల సమాచారం, కనిపించే మరియు దాచిన చరిత్ర, జాబితా క్రమం, ఎంపిక మరియు సూచికలను వెర్షన్ ఉన్న JSONలో ఉంచుతుంది. లక్ష్య ప్రొఫైల్‌లో Backup file ఎంచుకుని సంఖ్యలు చూసి Restore workspace నొక్కండి. ఒక లావాదేవీ లక్ష్య సూచిని మారుస్తుంది. దాన్ని ఉంచాలంటే మొదట ఎగుమతి చేయండి.

అప్‌గ్రేడ్‌లో అదే స్కీమ్, హోస్ట్, పోర్ట్, ప్రొఫైల్ ఉంచండి. 0.1.0 కార్యస్థలం IndexedDBకి తరలి తిరిగి చదివి ధృవీకరించబడుతుంది, మూల విలువ ఉంటుంది. పాత ట్యాబ్‌లు మూసేయండి. బ్యాకప్ సాధారణ పాఠ్యం. SHA-256 సమగ్రతను పరీక్షిస్తుంది. హక్కుల ప్రకారం నిల్వ, ప్రాప్యత, గడువు నిర్ణయించండి.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## నిర్మాణం మరియు గణన నియమాలు

Rust చిహ్నం, UTC మరియు OHLCV ధృవీకరించి పది లక్షలవ వంతును పూర్ణాంకంగా లెక్కిస్తుంది, సెషన్ ప్రణాళిక సిద్ధం చేస్తుంది. React అదే Wasm, చార్ట్‌కు Canvas, లావాదేవీలకు IndexedDB, కాష్‌కు service worker ఉపయోగిస్తుంది. సవరణ సంఖ్యలు సమాంతర రాతలను గుర్తిస్తాయి. స్థితి ప్రొఫైల్ మరియు మూల చిరునామాకు చెందుతుంది.

SMA ఖచ్చితమైన జారే మొత్తాన్ని వాడుతుంది. EMA మొదటి పూర్తి కిటికీ వద్ద మొదలై ప్రతి దశలో పది లక్షలవ భాగానికి రౌండ్ అవుతుంది, సమాన దూరంలో సున్నాకు దూరంగా. పునరావృతం చూసిన ముగింపు ధరలనే వాడుతుంది. వ్యవధి ముగింపు అందుబాటు సమయం. ప్రొవైడర్ చేరిక, సవరణలు, క్యాండిల్ లోపలి సమయానికి వేరే సమాచారం కావాలి. మూల వరుసలు అలాగే ఉంటాయి.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## అమలు మరియు ఆపరేషన్ పరిధి

dist/ ని HTTPS ద్వారా అందించండి లేదా loopback లాంచర్ వాడండి. కార్యస్థలం కోసం అదే మూల చిరునామా ఉంచండి. వేరే పోర్టు, ప్రొఫైల్, ప్రైవేట్ కిటికీలో వేరే నిల్వ ఉంటుంది. Tauri పరీక్షకు వెబ్ నిర్మాణం, వ్యవస్థ అవసరాలు పూర్తి చేయండి. CI Windows Server 2022, macOS 15, Ubuntu 24.04లో నిర్మించి Linux విండో తెరుస్తుంది. మొబైల్, ARM, BSD పట్టిక చూడండి. డెస్క్‌టాప్ Chromiumతో పరీక్షించండి.

ప్రస్తుతం ఒక్క ప్రొఫైల్‌కు ఒక్క స్థానిక వినియోగదారు. డేటా, బ్యాకప్ ఆమోదిత పరికరాల్లో ఉంచండి. ధ్రువీకరణ, వినియోగదారుల వేరుచేయడం, పర్యవేక్షణ, నిల్వ గడువు, రికవరీకి వేరే ధృవీకరించిన అమలు అవసరం. ZIPలో లైసెన్స్ నోటీసులు, CycloneDX SBOM ఉన్నాయి. విడుదల ట్యాగ్ ధృవీకరణను నడుపుతుంది.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## బాహ్య సేవను గమనించండి

TradingBotObserverV1 వేరుగా అమర్చిన trading-botలో runtime, status, account, portfolio చదువుతుంది. నమ్మకమైన మూలం, loopback బయట HTTPS, ప్రక్రియ కాన్ఫిగరేషన్ నుంచి అధీకృత టోకెన్ వాడండి. ప్రతి స్నాప్‌షాట్ సమయం గమనించండి. ఖాళీ స్నాప్‌షాట్ లేదా ఆరోగ్యకర సేవ అదనపు నిల్వలు, పొజిషన్లు చెప్పదు. ఆధారాలు, ఆర్డర్లు, అమలు బాహ్య సేవలో ఉంటాయి.

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
## సోర్స్ నుంచి నిర్మించి పరీక్షించండి

Node.js 22.12 లేదా కొత్తది, npm, rust-toolchain.toml లోని Rustup, Python 3.11 లేదా కొత్తది వాడండి. రిపోజిటరీ మూలం నుంచి నడపండి. Vite సాధారణంగా 5173 అభివృద్ధి URL చూపిస్తుంది. ఉత్పత్తి లాంచర్ 4173. పరీక్ష ముందు నిర్దిష్ట Chromium స్థాపించండి.

Rust, Wasm, బ్రౌజర్, SDK, స్థానిక సర్వర్, లైసెన్సులు, SBOM, భద్రతా సూచనలు పరీక్షిస్తారు. కాల మార్పు, లోటు, ముందస్తు ముగింపుతో సహా ప్రతి సంఘటనకు రెండు సగటులు బ్యాచ్‌లోని అదే మొదటి భాగంతో సరిపోతాయి. CI సరైన ZIP ID కోసం చూస్తుంది, దిగుమతి బైట్లను పోలుస్తుంది. సరిపోయే విడుదల ట్యాగ్ ధృవీకరణ చేస్తుంది.

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
## లోపాలను గుర్తించి మళ్లీ చూపండి

పోర్ట్ బిజీగా ఉంటే --port 4174 వాడి ఎగుమతి, పునరుద్ధరణతో డేటా తరలించండి. ఆఫ్‌లైన్ సమస్యైతే ఉత్పత్తి బిల్డ్ ముందుగా ఆన్‌లైన్‌లో తెరిచి Offline ready చూడండి. ఫైలు తిరస్కరిస్తే చెప్పిన వరుస, వ్యవధి మొదలు, మార్కెట్ మరియు తేదీల క్యాలెండర్ పరీక్షించండి.

CSV, క్యాలెండర్, వ్యవధి, Git సవరణ, బ్రౌజర్, సంఘటన సమయం ఉంచండి. కృత్రిమ ఉదాహరణతో మొదటి విఫల దశను నివేదించండి. ధృవీకరణలో ప్లాట్‌ఫాం సాక్ష్యం, ప్రణాళికలో తదుపరి లక్ష్యాలు ఉంటాయి.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## రిపోజిటరీ, సహకారం, లైసెన్స్

ఇంజిన్, నమూనాలు crates/coreలో, టెర్మినల్, పరీక్షలు apps/terminalలో, హోస్ట్ apps/desktopలో, SDK packages/trading-botలో, సాధనాలు scriptsలో ఉన్నాయి. చిన్న పరీక్షించిన మార్పులు చేయండి. హక్కులు, నోటీసులు కాపాడండి, ఆధారాలు మారితే జాబితా మార్చండి, దుర్బలతలను గోప్యంగా తెలపండి.

మూల కోడ్ 0BSD, ఆధారాలకు స్వంత లైసెన్సులు. పూర్తి సంచికలు Ethnologue 2026లో మొదటి, రెండో భాష మాట్లాడేవారి మొత్తం ఆధారంగా ఉన్నాయి. రౌండింగ్‌లో ఇరవయ్యవ స్థానాన్ని పంచుకున్న రెండు భాషలూ ఉన్నాయి. అనుసంధాన మార్గదర్శకాలు, యాప్ తెర ఆంగ్లంలో ఉండవచ్చు.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
