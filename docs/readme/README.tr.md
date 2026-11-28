<!-- MarketWeft README · locale=tr -->

# MarketWeft

**0.234.0 · 0BSD**

**Belge dilleri**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · **Türkçe**

<!-- section:01 -->
## MarketWeft ne sunar

MarketWeft analistler, geliştiriciler ve operatörler için yerel öncelikli bir araştırma terminalidir. İzinli OHLCV dosyalarını açar, etkileşimli mumları ve hacmi çizer, sabit noktalı SMA ve EMA hesaplar. İzleme listesi, seçili araç ve göstergeler IndexedDB'de tutulur. Kaynaklar önbelleğe alındıktan sonra çevrimdışı çalışır. Hazır fiyat ve hacimler sentetiktir ve sağlayıcı hesabı gerektirmez.

MarketWeft 0.234.0, kesin önceki kapanış ve işaretli fiyatlarla belirli bir zamana ait açılış farkı grafikleri ekler. MarketWeft 0.7.0, sorgu anında bilinen verilerle fiyat getirisine göre noktasal evren taraması ekler. Seans tabanlı yeniden oynatma hisse bölünmelerini, nakit temettüleri, üyeliği ve kot dışı kalmayı kapsar. Depoda ayrı trading-bot hizmeti için salt okunur bir TypeScript gözlemcisi ve deneysel Tauri sarmalayıcısı da bulunur. Veri akışları, emir iletimi, imzalı kurucular ve çok kullanıcılı barındırma yol haritasındadır.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md) · [Opening gaps](../chart-workspace.md#opening-gaps)

<!-- section:02 -->
## Taşınabilir terminali başlatın

Başarılı GitHub doğrulamasından browser-terminal-attempt-N çıktısını indirin ve MarketWeft-browser-0.234.0.zip dosyasını çıkarın. dist/ ile serve-terminal.mjs aynı dizinde kalsın ve aşağıdaki komutu orada çalıştırın. WebAssembly, Canvas, BigInt ve IndexedDB destekleyen güncel tarayıcıda http://127.0.0.1:4173/ adresini açın. Node.js 22.12 veya sonrası gerekir. npm kurulumu gerekmez. Bağlantıyı kesmeden Offline ready yazısını bekleyin.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md) · [Linux native verification](../../docs/platforms.md#linux-native-verification) · [Ubuntu desktop package](../../docs/platforms.md#ubuntu-desktop-package) · [Ubuntu upgrade verification](../../docs/platforms.md#verify-an-ubuntu-package-upgrade) · [Ubuntu package provenance](../../docs/platforms.md#verify-ubuntu-package-provenance)

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

Historical replay → Open economic calendar → Start calendar demo yolunu açın. Yayın öncesi beklenti %2,5’tir ve gerçekleşme henüz görünmez. Actual observed, 14:32 UTC’de %2,7 gösterir. Revised actual %2,8 gösterir ve iki düzeltme Release evidence bölümünde izlenebilir. Kendi tarihli açıklamalarınız için Macro calendar CSV yükleyin.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Historical replay → Open option chain → Start option demo yolunu açın. Nisan vadeli 100 kullanım fiyatlı çift yaklaşık %20 IV ile başlar. Late option quote, 90 kullanım fiyatlı alım opsiyonunu %25 IV ile gösterir. Corrected spread bir satım opsiyonunun değerlemesini geri getirir. Vadeleri karşılaştırmak için Implied volatility surface bölümünü açın. Kendi kotasyonlarınız için Underlying CSV ve Option quotes CSV yükleyin.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Historical replay → Open replay alerts → Start alert demo yolunu açın. First crossing bir eşik uyarısı gösterir. Correction observed, düzeltilen örneği ve hareketli ortalama kesişimini gösterir. Full alert replay sekiz uyarı gösterir. Save to alert inbox düğmesine iki kez basın. İlkinde sekiz, ikincisinde sıfır yeni kayıt eklenir. Kendi verileriniz için Alert rules CSV ve Alert observations CSV yükleyin.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Historical replay → Open paper ledger → Start paper demo yolunu açın. 503 nakit rezervinden, 801,6 bakiye bırakan bir kısmi gerçekleşmeye ilerleyin. Durdurma sonrası Final account, 663,7 nakit ve 13 gerçekleşen kâr gösterir. Kendi simülasyonunuz için Paper events CSV yükleyin.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Historical replay → Open bar backtest → Start backtest demo yolunu açın. 14:05 UTC sinyali alım emri oluşturur. Eksik 14:06 aralığı emri doldurmaz. 14:07 kapanışında iki hisse gerçekleşir. Final backtest özkaynağı 957,8 gösterir. Kendi geçmişiniz için seans ve bar CSV dosyalarını yükleyin.

Geçmişe dönük test demosunda altı eğitim ve iki test çubuğuyla Walk-forward validation çalıştırın. İlk tamamlanan pencere 14:09 UTC’de görünür. Eğitimde 1:2 çifti seçilir ve yeni bir hesapla başlayan iki test çubuğunda sabit kalır.

Geçmişe dönük test demosunda 20250403 tohumuyla, 256 yol ve yol başına sekiz hareket seçerek Seeded scenarios çalıştırın. Referans son portföy değeri 957,8, senaryoların medyanı 997,6’dır. Aynı kesim zamanı, veri ve tohum risk tablosunu yeniden üretir.

Evren demosunda BETA-001 için Delisting proceeds yükleyin ve iki kesim zamanını da 14:35 UTC yapın. Bedel henüz bilinmiyor. 14:37’de on hisse için 70 USD alacak oluşur ve 14:50’de nakit kaydedilir. Sonraki düzeltmeler önceki kesitleri korur ve BETA-002’yi ayrı tutar.

Start split revisions demo’yu açıp Split-adjusted seçin. 3 Haziran 14:10 UTC’de yürürlük zamanı değişince önceki düzeltme geri alınır. 14:20’de iki oran birleşir. 14:30’da SPLIT-A iptal edilince SPLIT-B geçerli kalır ve ham mumlar korunur.

Start dividend entitlement demo’yu açın. ALPHA 100 hak sahibi hisseyle başlar, geç gelen raporla 120’ye çıkar. BETA için 40 hisse kullanılır. Ödeme sonrası ALPHA’nın 110 hisseye düzeltilmesi 3 USD’yi geri alır. Önceki bakiyeyi görmek için geri sarın.

Evren demosunda Portfolio replay yükleyin. BETA-001’in 14:10 UTC kapanışı 14:12’de bilinir. 14:45’te 70 USD alacağı BETA-002’nin 225 EUR hisse değerinden ayrı görünür. 14:50’de hisse değeri ve kot dışı kalma nakdi toplamı 284 USD’dir.

Compare charts seçip karşılaştırma enstrümanını belirleyin. Link by UTC iki panelde de aynı görünür zamanı işaretler. Panelleri ayrı ayrı yakınlaştırın. Çalışma alanı yedeği enstrümanları, göstergeleri ve bağlantı ayarını saklar.

Draw measurement seçip her uç için mevcut bir UTC mumu ve fiyat belirleyin. Grafiği yakınlaştırınca veya kaydırınca çizgi kayıtlı koordinatlarla yeniden çizilir. Çalışma alanı yedeği koordinatları saklar. Uygulama geçen süreyi saniye, fiyat değişimini tutar ve yüzde olarak gösterir.

Indicators menüsünü açıp her panel için SMA ve EMA periyotlarını mum sayısı olarak ayarlayın. Yeterli kapanış verisi geldiğinde seçili UTC mumunun değerleri gösterilir. Enstrüman değiştirildiğinde, sayfa yeniden yüklendiğinde ve yedekten geri yüklemede periyotlar korunur.

Grafiğin altındaki Export CSV menüsünü açın. Yeniden içe aktarmak için OHLCV mumlarını indirin veya araştırma için kaynak bilgilerini ve etkin hareketli ortalamaları ekleyin. Yeterli kapanış verisi oluşana kadar ortalama değerleri boş kalır.

Herhangi bir panelde grafik türü olarak Close line seçin. Çizgi gözlemlenen kapanışları kullanır, hacmi ve etkin göstergeleri korur. Eksik bir UTC mumunda bağlı artı imleç görünmez. Çalışma alanı yedekleri seçilen grafik türlerini saklar.

OHLC bars seçin. Dikey çizgi en yüksek ve en düşük fiyatı, sol çizgi açılışı, sağ çizgi kapanışı gösterir. Paneller kendi grafik türlerini saklar ve bağlı imleç yalnızca UTC zamanı tam eşleşen çubukları izler.

Herhangi bir panelde Timeframe menüsünü açıp kaynak ve hedef aralıkları saniye olarak girin. Grafik ve araştırma CSV’si gözlemlenen kaynak kapsamını gösterir. Çalışma alanı yedeği özgün seriyi saklar.

Timeframe menüsünde bir seans takvimi CSV’si ekleyin. Aralıklar her seansın açılışına göre başlar ve son aralık belirtilen kapanışta biter. Araştırma CSV’si takvimi ve kaynak kapsamını kaydeder.

Recorded tick bars menüsünü açıp işlem sayısını ve gözlem sınırını girin. Grafik aynı zamandaki işlemlerin kayıt sırasını korur, eksik çubukları işaretler ve tam sıra numaralarını dışa aktarır.

Portfolio replay içinde temettü demosunu yükleyin veya bir CSV ekleyin. Sorgu hak kullanım tarihinden önceki pozisyonları kullanır, ödeme tarihinde nakde geçirir ve düzeltmeleri gözlem zamanında uygular.

Fiyatları yükledikten sonra Universe screen içinde Relative returns bölümünü açın. İki kotasyon kimliği ve kesin bir UTC başlangıç zamanı seçin. Eksik kapanışları ve düzeltmeleri görmek için evren kesitlerini değiştirin, ardından karşılaştırmanın tamamını CSV olarak indirin.

Recorded market depth bölümünü açın ve seçili enstrüman için bir derinlik CSV’si yükleyin. Alış ve satış kademelerini, sıra boşluğunu ve sonraki anlık görüntüdeki toparlanmayı görmek için gözlem kesitlerinde ilerleyin. Tüm kademeleri CSV olarak indirin.

Recorded footprint bölümünü açın ve seçili enstrümanın işlemlerini yükleyin. Her fiyat aralığında alış, satış ve yönü bilinmeyen hacmi görmek için gerçekleşme aralığını ve gözlem kesitini ayarlayın. Tüm footprint ve kümülatif deltayı CSV olarak indirin.

Recorded footprint bölümünde sorguyu çalıştırdıktan sonra Price profiles bölümünü açın. Her fiyat aralığındaki hacmi orada işlem yapılan zaman dilimi sayısıyla karşılaştırın. Değer alanı hedefini belirleyin ve tüm profilleri CSV olarak indirin.

Relative returns bölümünün altında Rolling risk seçeneğini açın. Her kotasyonun mevcut getirilerini ve eşleştirilen örnek sayısını görmek için UTC aralığını, pencere uzunluğunu ve oynaklık ölçeğini belirleyin. Çalışmanın tamamını CSV olarak indirin.

Fiyatları yükledikten sonra Universe screen bölümünde Correlated portfolio scenarios seçeneğini açın. Kotasyon ağırlıklarını, tohumu ve yeniden dengeleme ücretini belirleyin. Tam getiri kapsamını ve yol yüzdeliklerini inceleyip tüm yolları CSV olarak indirin.

Universe screen içinde Cross-sectional paper replay bölümünü açın ve likidite raporunu yükleyin. İlk karar zamanını ve sıralama ayarlarını belirleyin. Seçimleri, emirleri, nakdi ve işlem tutarını inceleyin ya da tüm oynatımı CSV olarak indirin.

Cross-sectional paper replay içinde Corporate cash reports bölümünü açıp ilgili CSV dosyalarını yükleyin. Hak edişi, ödeme düzeltmelerini, geri yüklenen pozisyonları ve nakit fişlerini inceleyin. Nakit kaydını CSV olarak indirin.

Bar backtest içinde Recorded trade execution bölümünü açıp işlem CSV dosyasını yükleyin. Etkinlik ve bilgi kesimlerini belirleyin. Gecikmeli kısmi gerçekleşmeleri, tam kayıt sıralarını, nakdi ve portföy değerini inceleyip tüm geçmişi CSV olarak indirin.

Sıralama oynatımından sonra Cross-sectional walk-forward bölümünü açın. Geriye bakış süresini ve varlık sayısını karşılaştırın, ayrık testleri ve eksik değerlemeleri inceleyin, sonuçları ve kaynakları CSV olarak dışa aktarın.

Grafiği seçip Time-series formulas bölümünü açın. OHLCV ifadesi ve gözlem sınırı girerek kesin değerleri ve eksik satırları inceleyin. Formülü, kaynağı, dil sürümünü ve sonuçları CSV olarak dışa aktarın.

Çubuk geçmişini yükleyip Formula paper backtest bölümünü açın. Giriş, çıkış ifadelerini ve iki kesim zamanını belirleyin. Çubuk hacmiyle kaydedilmiş işlemleri karşılaştırıp fişleri CSV olarak dışa aktarın.

Kabul edilen formül testinden strateji paketini indirin. İki formülü, yürütme biçimini ve hesap ayarlarını başka bir çalışma alanında geri yükleyin. Aynı veri ve kesim zamanlarıyla sonucu yeniden üretin.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Fibonacci time zones](../chart-workspace.md#fibonacci-time-zones) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

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
