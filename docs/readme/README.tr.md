<!-- MarketWeft README · locale=tr -->

# MarketWeft

**0.9.0 · 0BSD**

**Belge dilleri**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · **Türkçe**

<!-- section:01 -->
## MarketWeft ne sunar

MarketWeft analistler, geliştiriciler ve operatörler için yerel öncelikli bir araştırma terminalidir. İzinli OHLCV dosyalarını açar, etkileşimli mumları ve hacmi çizer, sabit noktalı SMA ve EMA hesaplar. İzleme listesi, seçili araç ve göstergeler IndexedDB'de tutulur. Kaynaklar önbelleğe alındıktan sonra çevrimdışı çalışır. Hazır fiyat ve hacimler sentetiktir ve sağlayıcı hesabı gerektirmez.

MarketWeft 0.9.0, yıllık finansal rapor sürümleri ve geçmiş tarihli değerleme ekler. MarketWeft 0.7.0, sorgu anında bilinen verilerle fiyat getirisine göre noktasal evren taraması ekler. Seans tabanlı yeniden oynatma hisse bölünmelerini, nakit temettüleri, üyeliği ve kot dışı kalmayı kapsar. Depoda ayrı trading-bot hizmeti için salt okunur bir TypeScript gözlemcisi ve deneysel Tauri sarmalayıcısı da bulunur. Veri akışları, emir iletimi, imzalı kurucular ve çok kullanıcılı barındırma yol haritasındadır.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Taşınabilir terminali başlatın

Başarılı GitHub doğrulamasından browser-terminal-attempt-N çıktısını indirin ve MarketWeft-browser-0.9.0.zip dosyasını çıkarın. dist/ ile serve-terminal.mjs aynı dizinde kalsın ve aşağıdaki komutu orada çalıştırın. WebAssembly, Canvas, BigInt ve IndexedDB destekleyen güncel tarayıcıda http://127.0.0.1:4173/ adresini açın. Node.js 22.12 veya sonrası gerekir. npm kurulumu gerekmez. Bağlantıyı kesmeden Offline ready yazısını bekleyin.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## NYSE örneğini oynatın

Historical replay ekranında Start demo'yu seçin. Next event ilerletir, Previous event geri alır, Play ve Pause oynatır ve duraklatır, Reset görünen geçmişi siler. Grafik başlangıçta boştur, her mum aralığı bitince açığa çıkar. Event time başlangıcı veya seans sınırını, Observed at erişilebilirlik zamanını gösterir. Hız yalnızca ekranın ilerleme temposunu değiştirir.

Açılış 31 Ekim 2025'te 13:30 UTC (UTC−04:00) iken 3 Kasım'da 14:30 UTC (UTC−05:00) olur. 3 Kasım 15:00 aralığının eksikliği 15:30'da görünür. Şükran Günü aralık oluşmaz. 28 Kasım yedi adet 30 dakikalık mum sonunda 18:00 UTC'de erken kapanır. Örnekte 20 seans, 253 mum ve 294 olay bulunur. Fiyat ve hacim sentetik, süreler NYSE'nin yayımladığı saatlere dayanır.

Historical replay → Start split demo ekranını açın ve aynı olayda Price basis seçimini Raw ile Split-adjusted arasında değiştirin. 2’ye 1 bölünme yürürlüğe girmeden duyurulur ve gözlemlenir. O zamana kadar iki görünüm aynıdır. Yürürlüğe girdiğinde bölünme öncesi son kapanış ham 106.50’den düzeltilmiş 53.25’e iner, hacim iki katına çıkar. Sonraki ilk mum 53.00 kalır. Kendi veriniz için aracın Corporate actions CSV dosyasını ve seans takvimini yükleyip OHLCV’nin ham olduğunu onaylayın. En son gözlemlenen oran yürürlükle uygulanır. Gecikmiş bildirim ve düzeltme gözlem anından itibaren görünümü değiştirir. Kaynak geçmiş korunur.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Historical replay → Start dividend demo ile her dağıtım için hak sahibi 100 hisseyi izleyin. Temettüsüz işlem tarihinde USD 25.00 alacak doğar. Tutar düzeltmesi bunu USD 30.00 yapar ve yeni ödeme tarihi nakit girişini erteler. Geç gelen rapor gözlemlendiğinde EUR 10.00 yazılır. Ödeme sonrası düzeltme USD 28.00 bırakır. Önceki bakiyeler için geri alın. Kendi veriniz için Cash dividends CSV yükleyin ve Entitled shares per distribution girin. Düzeltmelerde aynı dağıtım kimliğini kullanın. Defter para birimlerini ayrı tutar, eski kayıtları ve kaynak fiyatları korur.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Historical replay → Open universe replay → Start universe demo ekranını açın. 14:05 UTC’de yalnız ALFA üyedir, BETA 14:10’da katılır. ALFA’nın 14:20 çıkışı 14:25’te öğrenilir. BETA’nın 14:30 kot dışı kalması 14:35’te öğrenilir. Önceki üyeleri görmek için geri alın veya Effective time ve Known time alanlarını ayrı sorgulayın. Kendi veriniz için Universe membership CSV yükleyin. Düzeltmelerde değişiklik kimliğini koruyun. Sembol yeniden kullanılırsa ayrı kot kimliği verin.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Universe screen içinde Load demo prices seçin ve başlangıç zamanını 14:00 UTC olarak bırakın. 14:05’te ALFA %1 ile ilk sıradadır. BETA 14:10’da katılır ve kapanışı 14:12’de öğrenilene kadar sıralamaya girmez. Geçerlilik zamanını 14:10 seçip bilgi zamanını 14:12 ve 14:16 yaparak BETA’nın %12 getirisini düzeltilen %1 ile karşılaştırın. Geçerlilik 14:20 iken ALFA, çıkarılışı 14:25’te öğrenilince listeden düşer. Kendi kapanışlarınız için kot kimliği ve kesin zaman içeren Universe prices CSV yükleyin. Başlangıç veya hedef fiyatı eksik üye sırasız görünür.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

Örnek fiyatları yükledikten sonra Sector heatmap içinde Load demo sectors seçin. 14:10 UTC’de harita bilinen ağırlığın %60’ını kapsar. BETA’nın fiyatı 14:12’de öğrenildiğinde kapsam %100’e, gözlenen katkı %1,2’den %6’ya çıkar. 14:16’daki düzeltme BETA’yı Financials grubundan Technology grubuna taşır. Sıra, katkı ve sınıflandırma zamanları için bir kutucuğu açın. Kendi veriniz için Sector and weight CSV yükleyin.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Historical replay → Open financial statements → Start financial demo yolunu açın. Original filing, F/K oranını 10× gösterir. Aynı değerleme zamanında Restatement observed, F/K oranını 15× yapar ve adi pay özkaynağının eksik olduğunu gösterir. Revised capitalization oranı 20× yapar. Kendi ihraççınızı ve bilgi zamanını sorgulamak için Annual filings CSV ve isteğe bağlı Capitalization CSV yükleyin.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv)

<!-- section:04 -->
## Kendi verinizi içe aktarın ve oynatın

Import CSV ile piyasa ve sembolü girip saklama izniniz olan UTF-8 OHLCV dosyasını seçin. Kesin artan Unix saniyesi, UTC tarihi veya Z ile biten UTC zaman damgası kullanın. En çok altı ondalık basamak, negatif olmayan hacim ve açılışla kapanışı kapsayan en düşük/en yüksek değerler gerekir. Geçersiz bir satır tüm aktarımı reddeder. Series details altında aralık, kaynak, kullanım hakkı ve düzeltme politikasını girin.

Oynatma için damga aralığın başlangıcıdır. Historical replay içinde araç, seans CSV dosyası ve 1–86.400 arası tam saniye seçin. Her satıra tam UTC sınırlarını, açılıştaki dakika farkını ve regular ya da early yazın. Izgara açılıştan başlar ve son aralık kısa olabilir. Seans veya ızgara dışı mum reddedilir. Eksik bir aralık saati ilerletir ve görünen değerleri korur.

Varsayılan sınır 1.500.000 bayt ve 100.000 mumdur. Derleme ayarı en çok 8 MiB ve 100.000 satıra izin verir. Takvim 1 MiB, çakışmayan 10.000 bölüm ve 200.000 olayla sınırlıdır. Tarayıcı depolama kotası ayrıca geçerlidir.

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
## Yedekleyin, taşıyın ve geri yükleyin

Workspace backup → Export workspace ile özgün CSV, veri kaynağı, gizli ve görünür geçmişler, liste sırası, seçim ve göstergeler sürümlü JSON olarak çıkarılır. Hedef profilde Backup file seçin, doğrulanan sayıları inceleyin ve Restore workspace kullanın. Tek işlem hedef kataloğu değiştirir. Gerekliyse önce hedefi dışa aktarın.

Yükseltmede aynı şema, sunucu, port ve profili kullanın. 0.1.0 çalışma alanları IndexedDB'ye taşınır, yazılan veri okunarak doğrulanır ve eski değer korunur. Eski sekmeleri kapatın. Yedek düz metindir. SHA-256 bütünlüğü doğrular. Saklama, erişim ve saklama süresini veri haklarına göre yönetin.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Mimari ve hesaplama kuralları

Rust araçları, UTC ve OHLCV verisini doğrular, milyonda bir tam sayı birimleriyle hesaplama yapar ve olay planını hazırlar. React aynı Wasm motorunu, grafik için Canvas'ı, işlem için IndexedDB'yi ve önbellek için service worker'ı kullanır. Revizyon numarası çakışan yazmaları algılar. Durum profil ve kökene aittir.

SMA kesin kayan toplam kullanır. EMA ilk tam pencereyle başlar, her adımda milyonda bire yuvarlar ve eşit uzaklıkta sıfırdan uzak değeri seçer. Oynatmada yalnızca görülmüş kapanışlar kullanılır. Planlanan aralık bitişi kullanılabilirlik zamanıdır. Sağlayıcı gecikmeleri, düzeltmeler ve mum içi zamanlar ayrı veri gerektirir. Kaynak satırlar korunur.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Dağıtım ve işletim kapsamı

dist/ klasörünü HTTPS üzerinden veya yerel başlatıcıyla sunun. Çalışma alanı için kökeni koruyun. Başka port, profil veya gizli pencere farklı depolama açar. Tauri'yi değerlendirmek için terminali derleyip önkoşulları kurun. CI Windows Server 2022, macOS 15 ve Ubuntu 24.04 üzerinde derler ve Linux penceresini açar. Platform matrisi mobil, ARM ve BSD durumunu gösterir. Kabul testlerinde masaüstü Chromium kullanın.

Mevcut model profil başına bir yerel kullanıcıdır. Veri ve yedekleri onaylı aygıtlarda saklayın. Kimlik, kiracı ayrımı, izleme, saklama ve kurtarma ayrı doğrulanmış bir tasarım gerektirir. ZIP lisans bildirimleri ve CycloneDX SBOM içerir. Sürüm etiketi iş akışında eser doğrulama imzası yer alır.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Harici bir hizmeti gözlemleyin

TradingBotObserverV1, ayrı yapılandırılan trading-bot üzerinden runtime, status, account ve portfolio okur. Güvenilir köken, loopback dışında HTTPS ve süreç ayarından gelen yetkili belirteci kullanın. Her gözlemi kendi zaman damgasıyla değerlendirin. Boş görüntü ve sağlıklı hizmet, bakiye ve pozisyonlar hakkında ek bilgi vermez. Kimlik bilgileri, emir ve yürütme harici hizmete aittir.

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
## Kaynaktan derleyin ve doğrulayın

Node.js 22.12 veya sonrası, npm, rust-toolchain.toml dosyasındaki Rustup aracı ve Python 3.11 veya sonrasını kullanın. Depo kökünden çalıştırın. Vite geliştirme adresini yazar ve genelde 5173'ü kullanır. Üretimde 4173 kullanılır. Tarayıcı testinden önce sabitlenen Chromium'u kurun.

Doğrulama Rust, Wasm, tarayıcı, SDK, yerel sunucu, lisans, SBOM ve güvenlik bildirimlerini kapsar. İki ortalama, saat değişimi, eksik aralık ve erken kapanış dahil her olayda toplu hesabın ilgili önekiyle karşılaştırılır. CI tam eser kimliğini bekler ve indirilen ZIP'i bayt bayt karşılaştırır. Sürümle eşleşen etiket doğrulamayı tetikler.

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
## Sorun giderin ve yeniden üretin

Port doluysa --port 4174 kullanın. Kökenler arasında dışa aktarma ve geri yüklemeyle veri taşıyın. Çevrimdışı açılmıyorsa üretim sürümünü çevrimiçi açıp Offline ready yazısını bekleyin. Veri reddinde belirtilen satırı, aralık başlangıcını, piyasa ve tarih takvimini inceleyin.

CSV, takvim, aralık, Git revizyonu, tarayıcı ve olay saatini kaydedin. Sentetik bir örnek ve ilk başarısız adımla bildirim yapın. Doğrulama kayıtlarında platform kanıtları, yol haritasında sonraki hedefler vardır.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Depo, katkı ve lisans

Motor ve test verileri crates/core, terminal ve testleri apps/terminal, yerel kabuk apps/desktop, SDK packages/trading-bot ve araçlar scripts dizinindedir. Küçük ve test edilmiş değişiklikler yapın. Hakları ve bildirimleri koruyun, bağımlılık değişince envanteri yenileyin ve açıkları özel kanaldan bildirin.

Özgün kod 0BSD lisanslıdır. Bağımlılıkların kendi lisansları vardır. Tam çeviriler, Ethnologue 2026'nın birinci ve ikinci dil konuşurlarının toplamına dayanır ve yuvarlanmış verilerde yirminciliği paylaşan iki dili de kapsar. Bağlantılı kılavuzlar ve arayüz İngilizce olabilir.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
