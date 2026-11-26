<!-- MarketWeft README · locale=ha -->

# MarketWeft

**0.5.0 · 0BSD**

**Harsunan wannan jagora**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · **Hausa** · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Abin da MarketWeft ke yi

MarketWeft tashar bincike ce da ke aiki a na’urar mai amfani. Tana buɗe OHLCV da aka ba da izini, tana nuna sandunan farashi da ƙarar ciniki, tana lissafin SMA da EMA da tsayayyun guraben goma, kuma tana ajiye jerin sa ido, kadara da alamomi a IndexedDB. Bayan an adana kayan aiki za ta yi aiki ba tare da intanet ba. Farashi da ƙarar da ke tare da ita na kwaikwayo ne, ba sai an buɗe asusun mai bayarwa ba.

MarketWeft 0.5.0 yana ƙara rabon riba na kuɗi bisa bayanan da aka sani a kowane lokaci tare da raba hannun jari a sake kunnawar zama. Akwai SDK na TypeScript mai karanta trading-bot mai zaman kansa da garkuwar Tauri ta gwaji. Ware kamfani, ciyarwar bayanai, umarni, masaukin mutane da yawa da masu girkawa masu sa hannu suna cikin shirin gaba.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Kunna tashar ɗaukuwa

Sauke browser-terminal-attempt-N daga gwajin GitHub da ya yi nasara. Cire MarketWeft-browser-0.5.0.zip, bar dist/ kusa da serve-terminal.mjs sannan gudanar da umarnin a can. Buɗe http://127.0.0.1:4173/ a burauza mai WebAssembly, Canvas, BigInt da IndexedDB. Ana buƙatar Node.js 22.12 ko sabo. Ba a buƙatar shigar da npm. Jira Offline ready kafin katse intanet.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## Sake kunna misalin NYSE

A Historical replay zaɓi Start demo. Next event yana gaba, Previous event yana baya, Play da Pause suna sarrafa kunnawa, Reset yana share abin da aka nuna. Zane ya fara babu komai. Sandar farashi tana bayyana a ƙarshen lokacinta. Event time farkon lokacin ne ko iyakar zama. Observed at lokacin samuwar bayani ne. Sauri yana canza yadda ake nuna abubuwa.

31 Oktoba 2025 an buɗe 13:30 UTC (UTC−04:00), 3 Nuwamba 14:30 UTC (UTC−05:00). Ana gane gibin 15:00 na 3 Nuwamba da 15:30. Thanksgiving ba shi da lokutan ciniki. 28 Nuwamba an rufe da wuri 18:00 UTC bayan sanduna bakwai na minti 30. Akwai zama 20, sanduna 253 da al’amura 294, da farashin kwaikwayo bisa lokutan NYSE da aka wallafa.

Buɗe Historical replay → Start split demo sannan canza Price basis tsakanin Raw da Split-adjusted a al’amari ɗaya. Ana sanar da rabon 2 ga 1 kuma ana ganinsa kafin ya fara aiki. Ra’ayoyin biyu suna daidai har zuwa lokacin. Bayan fara aiki, farashin rufewa na ƙarshe kafin rabon ya koma 53.25 daga ɗanyen 106.50. Ƙarar ciniki ta ninka. Sandar farko bayan rabon tana 53.00. Don bayananka, loda Corporate actions CSV na kadarar da kalanda, sannan ka tabbatar da ɗanyen OHLCV. Ana amfani da ƙimar da aka gani ta ƙarshe idan ta fara aiki. Rahoton da ya makara da gyara suna aiki daga lokacin ganinsu. Asalin tarihin yana nan.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Buɗe Historical replay → Start dividend demo don bin hannun jari 100 masu cancanta ga kowane rabo. Ranar ex ta samar da USD 25.00 da za a karɓa. Gyaran adadi ya kai USD 30.00, sabuwar ranar biya ta jinkirta shigar kuɗin. Rahoton da ya makara ya rubuta EUR 10.00 lokacin ganinsa. Gyaran bayan biya ya bar USD 28.00. Koma baya don ganin tsoffin ma’auni. Don bayananka loda Cash dividends CSV kuma saka Entitled shares per distribution. Yi amfani da ID ɗaya don gyare-gyaren rabo. Littafin ya ware kudade kuma ya kiyaye tsoffin shigarwa da asalin farashi.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv)

<!-- section:04 -->
## Shigo da bayananka ka sake kunna su

A Import CSV shigar da kasuwa da alama, sannan zaɓi OHLCV na UTF-8 da ka samu izinin adanawa. Yi amfani da daƙiƙun Unix, ranakun UTC ko lokacin UTC mai ƙarewa da Z, duk suna ƙaruwa a jere. A yi amfani da guraben goma shida, ƙara marar korau da iyakokin sama da ƙasa da suka ƙunshi buɗewa da rufewa. Layin kuskure yana hana duk shigo da fayil. A Series details saka tazara, tushe, haƙƙi da tsarin daidaitawa.

Yi wa sanda alamar lokacin farawa. A Historical replay zaɓi kadara, CSV na jadawalin zama da cikakkun daƙiƙu 1–86,400. Kowane layi ya ƙunshi iyakokin UTC daidai, bambancin minti a buɗewa da regular ko early. Grid yana farawa a buɗewa kuma tazara ta ƙarshe na iya gajarta. Ana ƙin sanda a wajen zama ko grid. Gibi yana motsa agogo yana barin farashin da aka nuna.

Iyaka ta al'ada ita ce baiti 1,500,000 da sanduna 100,000. Saitin gini na iya kai 8 MiB da layi 100,000. Jadawali ya karɓi 1 MiB, sassa 10,000 marasa haɗuwa da al’amura 200,000. Ƙa’idar sararin burauza dabam take.

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
## Yi kwafi, ka ƙaura ka dawo da shi

Workspace backup → Export workspace yana ajiye JSON mai siga, asalin CSV, tushe, tarihin bayyane da ɓoye, jerin sa ido, zaɓi da alamomi. A bayanin martabar inda za a kai, zaɓi Backup file, duba ƙididdiga sannan Restore workspace. Mu’amala guda ta maye gurbin kundin wurin. Fitar da tsohon kundin da farko idan kana buƙatarsa.

Lokacin sabuntawa riƙe tsari, uwar garke, tashar haɗi da bayanin martaba ɗaya. Ana ƙaura bayanan 0.1.0 zuwa IndexedDB, a sake karantawa don tabbatarwa kuma a bar asali. Rufe tsofaffin shafuka. Kwafin rubutu ne a bayyane. SHA-256 yana duba inganci. Ka bi haƙƙin bayanai wajen adanawa, samun dama da tsawon lokaci.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Tsarin gini da lissafi

Rust yana tantance shaida, UTC da OHLCV, yana lissafi da cikakkun kashi miliyan kuma yana gina jerin zaman kasuwa. React na amfani da injin Wasm ɗaya, Canvas don zane, IndexedDB don mu’amala da service worker don adana kayan shafi. Lambar sabuntawa tana gano rubuce-rubucen da suka yi karo. Yanayi yana da alaƙa da bayanin martaba da adireshin asali.

SMA yana amfani da jimlar taga mai zamiya daidai. EMA yana farawa da tagar farko cikakkiya, a zagaye kowane mataki zuwa kashi ɗaya cikin miliyan, nesa da sifili idan sun yi kunnen doki. Replay yana amfani da farashin rufewa da aka nuna. Ƙarshen lokacin shi ne lokacin samuwa. Zuwan mai bayarwa, gyara da lokaci a cikin sanda suna buƙatar shigarwa dabam. Asalin layi yana nan.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Tura tsarin da iyakar aiki

Bayar da dist/ ta HTTPS ko yi amfani da mai ƙaddamar da loopback. Riƙe adireshin asali don riƙe filin aiki. Sabuwar tasha, bayanin martaba ko tagar sirri suna da ma’ajiyar dabam. Don gwada Tauri, gina shafin ka girka buƙatun tsarin. CI yana gina Windows Server 2022, macOS 15 da Ubuntu 24.04, kuma yana buɗe tagar Linux. Duba jadawalin waya, ARM da BSD. Yi gwaji da Chromium na kwamfuta.

Tsarin yanzu mutum ɗaya ne kan kowane bayanin martaba. Ajiye bayanai da kwafi a na’urorin da aka yarda. Tabbatar da mai amfani, warewa, sa ido, lokacin riƙewa da burin dawo da bayanai suna buƙatar wani ingantaccen tsarin turawa. ZIP ya ƙunshi sanarwar lasisi da CycloneDX SBOM. Alamar siga tana kunna tabbatar da kunshin.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Kula da sabis na waje

TradingBotObserverV1 yana karanta runtime, status, account da portfolio daga trading-bot mai saitin dabam. Yi amfani da tushe amintacce, HTTPS a wajen loopback da token da aka amince da shi ta saitin tsari. Duba lokacin kowane hoto. Hoto fanko ko lafiyar sabis ba ya ba da ƙarin ma’auni ko matsayin jari. Shaidar shiga, umarni da aiwatarwa suna hannun sabis na waje.

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
## Gina da gwada daga lambar tushe

Yi amfani da Node.js 22.12 ko sabo da npm, Rustup da rust-toolchain.toml ya kayyade, da Python 3.11 ko sabo. Gudanar daga tushen ma’ajiya. Vite yana nuna adireshin haɓakawa, yawanci 5173. Nau’in samarwa yana amfani da 4173. Girkawa Chromium da aka kayyade kafin gwajin burauza.

Ana gwada Rust, Wasm, burauza, SDK, uwar garke, lasisi, SBOM da sanarwar tsaro. Bayan kowane al’amari matsakaita biyu suna daidai da sashen farko na lissafin rukuni, har da canjin agogo, gibi da rufewa da wuri. CI yana jira sahihin ID na ZIP kuma yana kwatanta baitin da aka sauke. Alamar sakin da ta dace da siga tana kunna tabbatarwa.

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
## Gano matsala ka maimaita ta

Idan tashar haɗi tana aiki, yi amfani da --port 4174 sannan ka fitar ka dawo da bayanai. Idan an samu matsalar amfani babu intanet, fara buɗe sigar samarwa da intanet, jira Offline ready. Idan an ƙi fayil, duba layin kuskure, lokacin farawa da jadawalin kasuwa da kwanan wata.

Adana CSV, jadawali, tazara, sigar Git, burauza da lokacin al’amari. Bayar da misalin kwaikwayo da matakin farko da ya kasa. Tarihin gwaji yana nuna shaidar dandali, shirin gaba yana nuna manufofi na gaba.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Ma’ajiya, gudummawa da lasisi

Injin da samfura suna crates/core, tashar burauza da gwaje-gwaje apps/terminal, masauki apps/desktop, SDK packages/trading-bot, sannan kayan aiki scripts. Yi ƙananan gyare-gyare da aka gwada. Kiyaye haƙƙi da sanarwa, sabunta jerin dogaro idan sun canza, kuma ka sanar da raunin tsaro a ɓoye.

Asalin lamba tana da 0BSD, dogaro suna da nasu lasisi. Cikakkun jagorori suna bin Ethnologue 2026 bisa jimillar masu magana da harshe na farko da na biyu, har da harsuna biyu da suka yi daidai a matsayi 20 bayan zagayawa. Manhaja da takardun da aka haɗa na iya amfani da Turanci.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
