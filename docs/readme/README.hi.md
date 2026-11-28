<!-- MarketWeft README · locale=hi -->

# MarketWeft

**0.263.0 · 0BSD**

**दस्तावेज़ की भाषाएँ**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · **हिन्दी** · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft की क्षमताएँ

MarketWeft विश्लेषकों, डेवलपरों और संचालकों के लिए स्थानीय शोध टर्मिनल है। यह अधिकृत OHLCV फ़ाइलें खोलता है, कैंडल और मात्रा दिखाता है, स्थिर दशमलव में SMA और EMA निकालता है और निगरानी सूची, चयन तथा संकेतक IndexedDB में रखता है। संसाधनों की कैशिंग के बाद ऑफ़लाइन चलता है। शामिल भाव और मात्राएँ कृत्रिम हैं और खाता नहीं चाहिए।

MarketWeft 0.263.0 सटीक UTC समय और मूल्य एंकर वाली संपादन योग्य साइन रेखा जोड़ता है। MarketWeft 0.7.0 किसी समय पर उपलब्ध जानकारी से मूल्य प्रतिफल के अनुसार यूनिवर्स स्क्रीनिंग जोड़ता है। सत्र-आधारित रीप्ले में शेयर विभाजन, नकद लाभांश, सदस्यता और डीलिस्टिंग हैं। रिपॉज़िटरी में अलग trading-bot सेवा के लिए केवल-पठन TypeScript ऑब्ज़र्वर और प्रायोगिक Tauri रैपर भी हैं। प्रदाता फ़ीड, ऑर्डर, हस्ताक्षरित इंस्टॉलर और बहु-उपयोगकर्ता होस्टिंग रोडमैप में हैं।

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md) · [Sine line](../chart-workspace.md#sine-line)

<!-- section:02 -->
## पोर्टेबल टर्मिनल शुरू करें

सफल GitHub सत्यापन से browser-terminal-attempt-N डाउनलोड करें। MarketWeft-browser-0.263.0.zip खोलें, dist/ को serve-terminal.mjs के साथ रखें और उसी फ़ोल्डर में आदेश चलाएँ। WebAssembly, Canvas, BigInt और IndexedDB वाले आधुनिक ब्राउज़र में http://127.0.0.1:4173/ खोलें। Node.js 22.12 या नया चाहिए। npm इंस्टॉल नहीं चाहिए। नेटवर्क बंद करने से पहले Offline ready देखें।

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md) · [Linux native verification](../../docs/platforms.md#linux-native-verification) · [Ubuntu desktop package](../../docs/platforms.md#ubuntu-desktop-package) · [Ubuntu upgrade verification](../../docs/platforms.md#verify-an-ubuntu-package-upgrade) · [Ubuntu package provenance](../../docs/platforms.md#verify-ubuntu-package-provenance)

<!-- section:03 -->
## NYSE का उदाहरण चलाएँ

Historical replay में Start demo चुनें। Next event से आगे, Previous event से पीछे, Play और Pause से चालू और विराम, Reset से दिखाई देने वाला इतिहास साफ़ करें। ग्राफ़ खाली शुरू होता है। कैंडल अंतराल समाप्त होने पर दिखती है। Event time आरंभ या सत्र की सीमा है। Observed at उपलब्धता का समय है। गति केवल प्रदर्शन की चाल बदलती है।

31 अक्टूबर 2025 को खुलना 13:30 UTC (UTC−04:00) है, 3 नवंबर को 14:30 UTC (UTC−05:00)। 3 नवंबर का 15:00 अंतराल 15:30 पर अनुपस्थित दिखता है। थैंक्सगिविंग पर स्लॉट नहीं हैं। 28 नवंबर को सात 30-मिनट कैंडल के बाद 18:00 UTC पर जल्दी बंद होता है। उदाहरण में 20 सत्र, 253 कैंडल और 294 घटनाएँ हैं। भाव कृत्रिम हैं और समय NYSE के प्रकाशित तथ्यों पर हैं।

Historical replay → Start split demo खोलें और उसी घटना पर Price basis में Raw और Split-adjusted बदलें। 2-के-बदले-1 विभाजन लागू होने से पहले घोषित और देखा जाता है। तब तक दोनों दृश्य समान हैं। लागू होने पर पिछली कैंडल का मूल बंद भाव 106.50 से समायोजित 53.25 होता है और मात्रा दोगुनी होती है। पहली बाद की कैंडल 53.00 रहती है। अपने डेटा के लिए चुने गए प्रतीक की Corporate actions CSV और सत्र कैलेंडर दें तथा मूल असमायोजित OHLCV की पुष्टि करें। प्रभावी होने पर नवीनतम देखा अनुपात लगता है। देर की सूचना और सुधार अपने अवलोकन समय से दृश्य बदलाते हैं। मूल इतिहास सुरक्षित है।

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Historical replay → Start dividend demo में प्रत्येक वितरण के 100 पात्र शेयर देखें। एक्स-तिथि पर USD 25.00 प्राप्य होता है। संशोधित राशि इसे USD 30.00 करती है और नई भुगतान तिथि जमा का समय बदलती है। देर की EUR रिपोर्ट अवलोकन पर EUR 10.00 जमा करती है। भुगतान के बाद सुधार से USD 28.00 बचता है। पिछले शेष देखने के लिए पीछे जाएँ। अपना Cash dividends CSV अपलोड कर Entitled shares per distribution भरें। संशोधनों में वितरण ID समान रखें। मुद्राएँ अलग रहती हैं और पुराने लेखे तथा मूल भाव सुरक्षित हैं।

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Historical replay → Open universe replay → Start universe demo खोलें। 14:05 UTC पर सिर्फ़ ALFA सदस्य है और 14:10 पर BETA जुड़ता है। ALFA का 14:20 पर प्रभावी हटना 14:25 पर ज्ञात होता है। BETA का 14:30 का डीलिस्ट होना 14:35 पर दिखता है। पुरानी सदस्यता देखने को पीछे जाएँ या अलग Effective time और Known time से प्रश्न चलाएँ। अपना Universe membership CSV अपलोड करें। संशोधन में वही बदलाव ID और टिकर दोबारा चलने पर अलग लिस्टिंग ID रखें।

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Universe screen में Load demo prices चुनें और 14:00 UTC को आधार रखें। 14:05 पर ALFA 1% के साथ आगे है। 14:10 पर BETA जुड़ता है और 14:12 पर उसका बंद भाव ज्ञात होने तक बिना रैंक रहता है। प्रभावी समय 14:10 रखकर ज्ञात समय 14:12 और 14:16 की तुलना करें। BETA का 12% संशोधित होकर 1% हो जाता है। 14:20 से प्रभावी ALFA का निष्कासन 14:25 पर ज्ञात होने पर वह रैंकिंग से हटता है। अपने निश्चित समय के बंद भाव के लिए सूचीकरण आईडी वाला Universe prices CSV अपलोड करें। आधार या लक्ष्य भाव अनुपलब्ध होने पर सदस्य बिना रैंक दिखता है।

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

डेमो कीमतें लोड करने के बाद Sector heatmap में Load demo sectors चुनें। 14:10 UTC पर ज्ञात भार का 60% शामिल है। 14:12 पर BETA का भाव ज्ञात होते ही कवरेज 100% और देखा गया योगदान 1.2% से 6% हो जाता है। 14:16 पर सेक्टर संशोधन BETA को Financials से Technology में ले जाता है। रैंक, योगदान और वर्गीकरण समय के लिए टाइल खोलें। अपने डेटा के लिए Sector and weight CSV अपलोड करें।

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Historical replay → Open financial statements → Start financial demo खोलें। Original filing में P/E 10× है। उसी मूल्यांकन समय पर Restatement observed में P/E 15× और सामान्य इक्विटी अनुपलब्ध है। Revised capitalization में P/E 20× होता है। अपने जारीकर्ता और ज्ञात-समय पर जाँचने के लिए Annual filings CSV और वैकल्पिक Capitalization CSV अपलोड करें।

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Historical replay → Open economic calendar → Start calendar demo खोलें। रिलीज़ से पहले अनुमान 2.5 प्रतिशत है और वास्तविक मान उपलब्ध नहीं है। Actual observed में 14:32 UTC पर 2.7 प्रतिशत दिखता है। Revised actual में 2.8 प्रतिशत है और दोनों संशोधन Release evidence में मिलते हैं। अपने रिलीज़ डेटा के लिए Macro calendar CSV अपलोड करें।

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Historical replay → Open option chain → Start option demo खोलें। अप्रैल में 100 स्ट्राइक वाले विकल्पों की IV करीब 20% है। Late option quote पर 90 स्ट्राइक का कॉल 25% IV के साथ दिखता है, और Corrected spread से पुट की गणना संभव होती है। Implied volatility surface में अलग-अलग समाप्तियाँ देखें। अपने समयबद्ध भावों के लिए Underlying CSV और Option quotes CSV लोड करें।

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Historical replay → Open replay alerts → Start alert demo खोलें। First crossing में एक सीमा अलर्ट है। Correction observed संशोधित नमूना और चल औसत की क्रॉसिंग दिखाता है। Full alert replay में आठ अलर्ट हैं। Save to alert inbox दो बार दबाएँ। पहली बार आठ रिकॉर्ड और दूसरी बार कोई नया रिकॉर्ड नहीं जुड़ता। अपने डेटा के लिए Alert rules CSV और Alert observations CSV लोड करें।

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Historical replay → Open paper ledger → Start paper demo खोलें। 503 की नकदी रोक से आगे बढ़ें। एक आंशिक फ़िल के बाद नकदी 801.6 है। बाद के रोक आदेश के बाद Final account में नकदी 663.7 और साकार लाभ 13 है। अपने नकली ऑर्डर और फ़िल के लिए Paper events CSV लोड करें।

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Historical replay → Open bar backtest → Start backtest demo खोलें। 14:05 UTC का संकेत खरीद आदेश देता है। 14:06 का अंतराल गायब है, इसलिए कोई फ़िल नहीं। 14:07 के बंद पर दो शेयर फ़िल होते हैं। Final backtest इक्विटी 957.8 दिखाता है। स्थानीय डेटा पर चलाने के लिए सत्र और बार CSV लोड करें।

बैकटेस्ट डेमो में छह प्रशिक्षण बार और दो परीक्षण बार के साथ Walk-forward validation चलाएँ। पहला पूरा खंड 14:09 UTC पर दिखता है। प्रशिक्षण में 1:2 चुना जाता है और नए खाते से शुरू होने वाले दोनों परीक्षण बार में वही जोड़ी रहती है।

बार बैकटेस्ट डेमो में सीड 20250403, 256 पथ और प्रति पथ आठ बदलाव के साथ Seeded scenarios चलाएँ। आधार की अंतिम इक्विटी 957.8 है और परिदृश्यों की माध्यिका 997.6 है। समान कटऑफ़, इनपुट और सीड पर जोखिम तालिका दोहराई जा सकती है।

यूनिवर्स डेमो में BETA-001 के लिए Delisting proceeds लोड करें और दोनों कटऑफ़ 14:35 UTC पर रखें। उस समय राशि अनुपलब्ध है। 14:37 पर दस शेयरों के लिए 70 USD की प्राप्ति देय है और 14:50 पर पहली नकद प्रविष्टि होती है। बाद के सुधार पहले के दृश्य को सुरक्षित रखते हैं और BETA-002 अलग रहता है।

Start split revisions demo खोलें और Split-adjusted चुनें। 3 जून को 14:10 UTC पर बदले हुए प्रभावी समय से पुराना समायोजन हटता है। 14:20 पर दोनों आईडी का गुणक साथ लागू होता है। 14:30 पर SPLIT-A रद्द होने के बाद SPLIT-B और मूल कैंडल बने रहते हैं।

Start dividend entitlement demo खोलें। ALPHA के लिए पहले 100 शेयर पात्र हैं और देर से आई रिपोर्ट पर 120 होते हैं। BETA के लिए 40 शेयर हैं। भुगतान के बाद ALPHA के 110 शेयरों की पुष्टि से 3 USD की वापसी दर्ज होती है। पिछला शेष देखने के लिए पीछे जाएँ।

यूनिवर्स डेमो में Portfolio replay लोड करें। BETA-001 का 14:10 UTC बंद भाव 14:12 के ज्ञान कटऑफ़ पर दिखता है। 14:45 पर उसका 70 USD देय और BETA-002 का 225 EUR शेयर मूल्य अलग हैं। 14:50 पर शेयर मूल्य और डीलिस्टिंग नकद 284 USD हैं।

Compare charts चुनकर तुलना का इंस्ट्रूमेंट चुनें। Link by UTC दोनों पैन में वही दिखाई देने वाला समय दिखाता है। दोनों पैन अलग-अलग ज़ूम हो सकते हैं। वर्कस्पेस बैकअप दोनों इंस्ट्रूमेंट, ओवरले और लिंक सेटिंग रखता है।

Draw measurement चुनें और दोनों सिरों के लिए मौजूदा UTC बार और मूल्य तय करें। ज़ूम या पैन पर सहेजी गई रेखा नए दृश्य में दिखती है। वर्कस्पेस बैकअप उसके निर्देशांक रखता है। ऐप बीते सेकंड और मूल्य में बदलाव रकम व प्रतिशत में दिखाता है।

Indicators खोलकर हर पैन के SMA और EMA पीरियड बारों में तय करें। पर्याप्त बंद भाव मिलने पर चार्ट चुने हुए UTC बार के मान दिखाता है। इंस्ट्रूमेंट बदलने, दोबारा लोड करने और बैकअप से बहाली पर पीरियड बने रहते हैं।

चार्ट के नीचे Export CSV खोलें। दोबारा आयात के लिए OHLCV बार डाउनलोड करें या शोध के लिए स्रोत जानकारी और चालू मूविंग एवरेज शामिल करें। पर्याप्त बंद भाव मिलने तक एवरेज खाली रहते हैं।

किसी भी पैन के चार्ट प्रकार में Close line चुनें। रेखा देखे गए बंद भाव इस्तेमाल करती है और वॉल्यूम व चालू इंडिकेटर बने रहते हैं। जिस UTC बार का डेटा नहीं है, वहाँ लिंक किया क्रॉसहेयर नहीं दिखता। वर्कस्पेस बैकअप प्रकार सहेजता है।

OHLC bars चुनें। खड़ी रेखा उच्च और निम्न भाव दिखाती है, बाईं टिक खुला भाव और दाईं टिक बंद भाव दिखाती है। हर पैन अपना प्रकार रखता है और जुड़ा कर्सर सटीक UTC बार का अनुसरण करता है।

किसी भी पैन में Timeframe खोलकर स्रोत और लक्ष्य अवधि सेकंड में भरें। चार्ट और शोध CSV दिखाते हैं कि कितने स्रोत बार मिले। बैकअप मूल सीरीज़ रखता है।

Timeframe में सत्र कैलेंडर CSV जोड़ें। हर सत्र की शुरुआत से लक्ष्य बार बनते हैं। अंतिम बार तय बंद समय पर रुकता है। शोध CSV कैलेंडर और स्रोत बारों की कवरेज दर्ज करता है।

Recorded tick bars खोलकर प्रति बार ट्रेड संख्या और अवलोकन की अंतिम सीमा तय करें। समान समय वाले ट्रेड रिकॉर्ड क्रम में रहते हैं। चार्ट अधूरे बार दिखाता है और उनके सटीक क्रमांक निर्यात करता है।

Portfolio replay में लाभांश आय का डेमो चलाएँ या पोर्टफ़ोलियो लाभांश CSV जोड़ें। क्वेरी एक्स-तिथि से पहले की होल्डिंग लेती है, भुगतान तिथि पर निपटान करती है और संशोधन उनके अवलोकन समय पर लागू करती है।

भाव लोड करने के बाद Universe screen में Relative returns खोलें। दो लिस्टिंग आईडी और सटीक UTC आधार समय चुनें। यूनिवर्स कटऑफ़ बदलकर अनुपलब्ध बंद भाव और संशोधन देखें, फिर पूरी तुलना CSV में डाउनलोड करें।

Recorded market depth खोलें और चुने गए इंस्ट्रूमेंट की डेप्थ CSV लोड करें। अवलोकन कटऑफ़ पर खरीद और बिक्री स्तर, क्रम में छूटा अपडेट और अगले स्नैपशॉट से बहाली देखें। सभी स्तर CSV में डाउनलोड करें।

Recorded footprint खोलें और चुने गए इंस्ट्रूमेंट के सौदे लोड करें। निष्पादन अवधि और अवलोकन कटऑफ़ चुनकर हर मूल्य खंड में खरीद, बिक्री और अज्ञात वॉल्यूम देखें। पूरा फ़ुटप्रिंट और संचयी डेल्टा CSV में डाउनलोड करें।

Recorded footprint में क्वेरी चलाकर Price profiles खोलें। हर मूल्य खंड का वॉल्यूम और उसमें सौदे वाले समय खंडों की संख्या देखें। वैल्यू एरिया का लक्ष्य चुनें और पूरी प्रोफ़ाइल CSV में डाउनलोड करें।

Relative returns के नीचे Rolling risk खोलें। UTC अंतराल, विंडो की लंबाई और अस्थिरता का पैमाना चुनकर हर लिस्टिंग के उपलब्ध प्रतिफल और युग्मित नमूने देखें। पूरा रोलिंग अध्ययन CSV में डाउनलोड करें।

भाव लोड करके Universe screen में Correlated portfolio scenarios खोलें। लिस्टिंग भार, सीड और पुनर्संतुलन शुल्क चुनें। पूर्ण प्रतिफल कवरेज और पथ प्रतिशतक देखें, फिर हर पथ CSV में डाउनलोड करें।

Universe screen में Cross-sectional paper replay खोलकर लिक्विडिटी रिपोर्ट लोड करें। पहला निर्णय और रैंकिंग सेट करें, फिर चयन, ऑर्डर, नकदी और कारोबार देखें या पूरा रीप्ले CSV में डाउनलोड करें।

Cross-sectional paper replay में Corporate cash reports खोलकर संबंधित CSV लोड करें। रीप्ले में पात्र शेयर, भुगतान संशोधन, बहाल पोज़िशन और नकद रसीदें जाँचें। नकदी का रिकॉर्ड CSV में डाउनलोड करें।

Bar backtest में Recorded trade execution खोलकर ट्रेड CSV लोड करें। प्रभावी और ज्ञात समय सीमाएँ चुनकर विलंबित आंशिक सौदे, सटीक कैप्चर आईडी, नकदी और इक्विटी देखें। पूरी रसीद और मूल्यांकन शृंखला CSV में डाउनलोड करें।

रैंकिंग रीप्ले के बाद Cross-sectional walk-forward खोलें। लुकबैक और लिस्टिंग संख्या के विकल्पों की तुलना करें। अलग परीक्षणों और अनुपलब्ध मूल्यांकन को देखें, फिर स्कोर और स्रोत CSV में निर्यात करें।

चार्ट चुनकर Time-series formulas खोलें। OHLCV अभिव्यक्ति और अवलोकन की समय-सीमा दें। सटीक मान और अनुपलब्ध पंक्तियाँ देखें, फिर फ़ॉर्मूला, स्रोत, भाषा संस्करण और परिणाम CSV में भेजें।

बार इतिहास लोड करके Formula paper backtest खोलें। प्रवेश और निकास की अभिव्यक्तियाँ तथा दोनों समय सीमाएँ चुनें। बार वॉल्यूम और दर्ज ट्रेडों के निष्पादन की तुलना करें और सभी रसीदें CSV में निर्यात करें।

स्वीकृत फ़ॉर्मूला बैकटेस्ट से रणनीति पैकेज डाउनलोड करें। दूसरे कार्यक्षेत्र में उसे लोड करके दोनों फ़ॉर्मूले, निष्पादन मोड और पेपर खाते की सटीक सेटिंग लौटाएँ। समान डेटा और समय सीमा के साथ परिणाम दोहराएँ।

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Fibonacci time zones](../chart-workspace.md#fibonacci-time-zones) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

<!-- section:04 -->
## अपना डेटा आयात और पुनर्चालित करें

Import CSV में बाज़ार और प्रतीक भरें और अधिकृत UTF-8 OHLCV चुनें। बढ़ते Unix सेकंड, UTC तारीखें या Z पर समाप्त UTC समय दें। छह दशमलव तक, गैर-ऋणात्मक मात्रा और खुलने-बंद होने के भाव समेटने वाले उच्च व निम्न रखें। एक गलत पंक्ति आयात रोकती है। Series details में अंतराल, स्रोत, उपयोग अधिकार और समायोजन नीति लिखें।

शुरू के समय से कैंडल चिह्नित करें। Historical replay में प्रतीक, सत्र CSV और 1–86,400 के बीच पूरे सेकंड चुनें। हर पंक्ति में ठीक UTC सीमाएँ, खुलने का मिनट ऑफ़सेट और regular या early दें। ग्रिड खुलने से शुरू होता है और अंतिम अंतराल छोटा हो सकता है। बाहर या ग्रिड से अलग कैंडल अस्वीकार होती है। अनुपस्थिति घड़ी बढ़ाती है और दृश्य भाव बचाती है।

डिफ़ॉल्ट प्रति फ़ाइल 1,500,000 बाइट और 100,000 कैंडल हैं। बिल्ड सेटिंग 8 MiB और 100,000 पंक्तियों तक जा सकती है। कैलेंडर 1 MiB, 10,000 गैर-ओवरलैप खंड और 200,000 घटनाओं तक है। ब्राउज़र कोटा अलग है।

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
## बैकअप, माइग्रेशन और पुनर्स्थापन

Workspace backup → Export workspace संस्करणित JSON में मूल CSV, स्रोत, दृश्य व छिपे इतिहास, सूची क्रम, चयन व संकेतक सहेजता है। लक्ष्य प्रोफ़ाइल में Backup file चुनें, गिनतियाँ देखें और Restore workspace दबाएँ। एक लेनदेन लक्ष्य कैटलॉग बदलता है। लक्ष्य बचाना हो तो पहले उसे निर्यात करें।

उसी स्कीम, होस्ट, पोर्ट और प्रोफ़ाइल पर अपग्रेड करें। 0.1.0 का डेटा IndexedDB में जाकर दोबारा पढ़कर सत्यापित होता है और मूल मान बचता है। पुराने टैब बंद करें। बैकअप सादा पाठ है। SHA-256 अखंडता जाँचता है। डेटा-अधिकार के अनुसार पहुँच, भंडारण और अवधि तय करें।

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## संरचना और गणना

Rust पहचान, UTC और OHLCV की जाँच करता है, पूर्णांक दस लाखवें में गणना करता है और सत्र योजना बनाता है। React वही Wasm, चित्र के लिए Canvas, लेनदेन के लिए IndexedDB और संसाधनों के लिए service worker उपयोग करता है। संशोधन संख्या समानांतर लेखन पहचानती है। स्थिति प्रोफ़ाइल और मूल पते से जुड़ी है।

SMA सटीक चलता योग लेता है। EMA पहली पूरी अवधि से शुरू होकर हर चरण दस लाखवें तक गोल करता है, बराबरी पर शून्य से दूर। पुनर्चालन केवल दिख चुके बंद भाव उपयोग करता है। नियत अंतराल का अंत उपलब्धता है। वास्तविक फ़ीड आगमन, सुधार और अंतराल के भीतर के समय अलग इनपुट हैं। मूल पंक्तियाँ बनी रहती हैं।

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## तैनाती और संचालन

dist/ को HTTPS पर परोसें या loopback लॉन्चर चलाएँ। वही मूल पता कार्यक्षेत्र रखता है। अलग पोर्ट, प्रोफ़ाइल या निजी विंडो का भंडारण अलग है। Tauri के लिए वेब बिल्ड और सिस्टम आवश्यकताएँ पूरी करें। CI Windows Server 2022, macOS 15 और Ubuntu 24.04 पर बनाता है और Linux विंडो खोलता है। मोबाइल, ARM और BSD की स्थिति मैट्रिक्स में है। परीक्षण डेस्कटॉप Chromium पर चलाएँ।

अभी हर प्रोफ़ाइल में एक स्थानीय उपयोगकर्ता है। डेटा अनुमोदित उपकरणों पर रखें। प्रमाणीकरण, उपयोगकर्ता पृथक्करण, निगरानी, प्रतिधारण और पुनर्प्राप्ति लक्ष्य अलग सत्यापित तैनाती माँगते हैं। ZIP में लाइसेंस नोटिस और CycloneDX SBOM हैं। रिलीज़ टैग कार्यप्रवाह में साक्ष्य प्रमाणीकरण है।

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## बाहरी सेवा देखें

TradingBotObserverV1 अलग trading-bot से runtime, status, account और portfolio पढ़ता है। भरोसेमंद पता, loopback के बाहर HTTPS और प्रक्रिया से दिया अधिकृत टोकन उपयोग करें। हर स्नैपशॉट का अपना समय पढ़ें। खाली स्नैपशॉट या स्वस्थ सेवा से अतिरिक्त शेष अथवा पोज़िशन पता नहीं चलती। पहचान-पत्र, ऑर्डर और निष्पादन बाहरी सेवा के पास हैं।

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
## स्रोत से बनाएँ और सत्यापित करें

Node.js 22.12 या नया, npm, rust-toolchain.toml में तय Rustup और Python 3.11 या नया उपयोग करें। रिपॉज़िटरी की जड़ में चलाएँ। Vite आम तौर पर 5173 पर विकास URL दिखाता है। उत्पादन 4173 पर चलता है। टेस्ट से पहले तय Chromium स्थापित करें।

जाँच में Rust, Wasm, ब्राउज़र, SDK, स्थानीय सर्वर, लाइसेंस, SBOM और सुरक्षा सूचनाएँ हैं। DST, अनुपस्थिति और जल्दी बंद सहित हर घटना पर दोनों औसत बैच के उसी शुरुआती हिस्से से मिलते हैं। CI सटीक आर्टिफ़ैक्ट ID की प्रतीक्षा करता है और ZIP के डाउनलोड किए बाइट मिलाता है। मेल खाता रिलीज़ टैग प्रमाणीकरण चलाता है।

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
## समस्या समझें और दोहराएँ

पोर्ट व्यस्त हो तो --port 4174 चलाएँ और मूल पतों के बीच निर्यात व पुनर्स्थापन करें। ऑफ़लाइन समस्या पर पहले ऑनलाइन उत्पादन बिल्ड खोलें और Offline ready देखें। अस्वीकृति पर त्रुटि पंक्ति, अंतराल का आरंभ और बाज़ार/तारीख का कैलेंडर जाँचें।

CSV, कैलेंडर, अंतराल, Git संशोधन, ब्राउज़र और घटना का समय रखें। प्रथम असफल चरण के साथ कृत्रिम उदाहरण दें। सत्यापन रिकॉर्ड में प्लेटफ़ॉर्म साक्ष्य और रोडमैप में अगले लक्ष्य हैं।

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## रिपॉज़िटरी, योगदान और लाइसेंस

इंजन और नमूने crates/core में, ब्राउज़र व परीक्षण apps/terminal में, होस्ट apps/desktop में, SDK packages/trading-bot में और उपकरण scripts में हैं। छोटे परीक्षित बदलाव दें। अधिकार व नोटिस रखें, निर्भरता बदलने पर सूची अद्यतन करें और कमज़ोरी निजी रूप से बताएँ।

मूल कोड 0BSD है और निर्भरताओं के अपने लाइसेंस हैं। पूर्ण संस्करण Ethnologue 2026 में प्रथम और द्वितीय भाषा के कुल वक्ताओं के अनुसार हैं, जिनमें गोलाई पर बीसवें स्थान की दोनों भाषाएँ शामिल हैं। जुड़े मैन्युअल और इंटरफ़ेस अंग्रेज़ी में हो सकते हैं।

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
