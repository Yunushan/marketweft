<!-- MarketWeft README · locale=mr -->

# MarketWeft

**0.17.0 · 0BSD**

**दस्तऐवजाच्या भाषा**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · **मराठी** · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft काय करते

MarketWeft विश्लेषक, विकासक आणि संचालकांसाठी स्थानिक संशोधन टर्मिनल आहे. ते परवानगीचे OHLCV उघडते, कँडल व व्यवहाराचे प्रमाण दाखवते, स्थिर दशांश एककांत SMA व EMA मोजते आणि निरीक्षण यादी, निवड व निर्देशक IndexedDB मध्ये ठेवते. संसाधने कॅश झाल्यावर ऑफलाइन चालते. सोबतचे भाव व प्रमाण कृत्रिम आहेत आणि खाते लागत नाही.

MarketWeft 0.17.0 मध्ये त्या वेळेपर्यंत ज्ञात असलेली सूचीबाह्य रक्कम आणि रोख दुरुस्त्या जोडल्या आहेत. MarketWeft 0.7.0 ठरावीक वेळी माहीत असलेल्या भावांवरून किंमत परताव्यानुसार युनिव्हर्सची क्रमवारी लावते. सत्रनिहाय रीप्लेमध्ये शेअर विभाजन, रोख लाभांश, सदस्यत्व आणि सूचीमधून वगळणे समाविष्ट आहे. स्वतंत्र trading-bot सेवेसाठी केवळ-वाचन TypeScript निरीक्षक आणि प्रायोगिक Tauri आवरणही आहे. डेटा फीड, ऑर्डर, स्वाक्षरी केलेले इन्स्टॉलर आणि बहुवापरकर्ता होस्टिंग पुढील योजनेत आहेत.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## वाहून नेता येणारे टर्मिनल सुरू करा

यशस्वी GitHub पडताळणीतून browser-terminal-attempt-N घ्या आणि MarketWeft-browser-0.17.0.zip उघडा. dist/ आणि serve-terminal.mjs शेजारी ठेवून आदेश त्याच संचिकेत चालवा. WebAssembly, Canvas, BigInt व IndexedDB असलेल्या ब्राउझरमध्ये http://127.0.0.1:4173/ उघडा. Node.js 22.12 किंवा नवे आवश्यक आहे. npm स्थापना लागत नाही. जाळे बंद करण्याआधी Offline ready दिसू द्या.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## NYSE उदाहरण पुन्हा चालवा

Historical replay मध्ये Start demo निवडा. Next event पुढे, Previous event मागे, Play आणि Pause चालू किंवा थांबवतात, Reset दिसलेला इतिहास रिकामा करते. सुरुवातीला आलेख रिकामा असतो. कँडल कालखंड संपल्यावर दिसते. Event time सुरुवात किंवा सत्रसीमा, Observed at उपलब्धतेची वेळ दाखवते. गती फक्त प्रदर्शनाची चाल बदलते.

३१ ऑक्टोबर २०२५ ला 13:30 UTC (UTC−04:00), आणि ३ नोव्हेंबरला 14:30 UTC (UTC−05:00) खुले होते. ३ नोव्हेंबरचा 15:00 चा हरवलेला कालखंड 15:30 ला दिसतो. Thanksgiving ला कालखंड नाही. २८ नोव्हेंबरला सात ३०-मिनिट कँडलनंतर 18:00 UTC ला लवकर बंद. २० सत्रे, २५३ कँडल आणि २९४ घटना, कृत्रिम भाव व प्रकाशित NYSE वेळा.

Historical replay → Start split demo उघडा व त्याच घटनेवर Price basis मधील Raw आणि Split-adjusted बदला. २-फॉर-१ विभाजन लागू होण्याआधी जाहीर व पाहिले जाते. तोवर दोन्ही दृश्ये सारखी. लागू झाल्यावर आधीचा शेवटचा मूळ बंद भाव 106.50 वरून समायोजित 53.25 होतो आणि प्रमाण दुप्पट होते. नंतरची पहिली कँडल 53.00 राहते. स्वतःच्या माहितीसाठी निवडलेल्या साधनाचा Corporate actions CSV व सत्र दिनदर्शिका द्या आणि OHLCV असमायोजित असल्याची पुष्टी करा. लागू झाल्यावर नवीनतम पाहिलेले गुणोत्तर वापरले जाते. उशिराची नोंद व सुधारणा दिसल्यापासून परिणाम करतात. मूळ इतिहास जपला जातो.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Historical replay → Start dividend demo उघडून प्रत्येक वाटपासाठी १०० पात्र शेअर्स पहा. एक्स-तारखेला USD 25.00 येणे निर्माण होते. सुधारणा ते USD 30.00 करते आणि नवीन भरणा तारीख जमा पुढे नेते. उशिराचा अहवाल दिसल्यावर EUR 10.00 जमा होते. नंतरच्या दुरुस्तीने USD 28.00 राहतात. मागे जाऊन आधीची शिल्लक पहा. स्वतःसाठी Cash dividends CSV द्या आणि Entitled shares per distribution भरा. सुधारणेत तोच वाटप ID ठेवा. नोंदवही चलने वेगळी ठेवते आणि आधीच्या नोंदी व मूळ भाव जपते.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Historical replay → Open universe replay → Start universe demo उघडा. 14:05 UTC ला फक्त ALFA सदस्य आहे, 14:10 ला BETA येतो. 14:20 चा ALFA काढण्याचा बदल 14:25 ला समजतो. 14:30 ची BETA सूचीमधून वगळणी 14:35 ला कळते. जुने सदस्यत्व पहायला मागे जा किंवा Effective time व Known time वेगळे द्या. स्वतःचा Universe membership CSV चढवा. सुधारणेत बदल ID तोच ठेवा आणि टिकर पुन्हा वापरल्यास वेगळा सूची ID द्या.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Universe screen मध्ये Load demo prices निवडा आणि आधार 14:00 UTC ठेवा. 14:05 ला ALFA 1% सह पुढे आहे. BETA 14:10 ला येतो, पण बंद भाव 14:12 ला कळेपर्यंत त्याला क्रमांक मिळत नाही. प्रभावी वेळ 14:10 ठेवून ज्ञात वेळ 14:12 आणि 14:16 तपासा. BETA चा 12% परतावा दुरुस्तीनंतर 1% होतो. ALFA चे 14:20 पासूनचे वगळणे 14:25 ला समजल्यावर तो यादीबाहेर जातो. स्वतःचे नेमक्या वेळचे बंद भाव वापरण्यासाठी सूचीकरण आयडीसह Universe prices CSV अपलोड करा. आधार किंवा लक्ष्य भाव नसेल तर सदस्याला क्रमांक मिळत नाही.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

डेमो भाव घेतल्यावर Sector heatmap मध्ये Load demo sectors निवडा. 14:10 UTC ला ज्ञात वजनापैकी 60% समाविष्ट आहे. 14:12 ला BETA चा भाव कळल्यावर व्याप्ती 100% होते आणि दिसलेले योगदान 1.2% वरून 6% होते. 14:16 च्या दुरुस्तीने BETA Financials मधून Technology मध्ये जातो. क्रमांक, योगदान आणि वर्गीकरणाच्या वेळा पाहण्यासाठी टाइल उघडा. स्वतःच्या नोंदींसाठी Sector and weight CSV अपलोड करा.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Historical replay → Open financial statements → Start financial demo उघडा. Original filing मध्ये P/E 10× आहे. त्याच मूल्यांकन वेळेला Restatement observed मध्ये P/E 15× आणि सामान्य भागधारकांचे भांडवल अनुपलब्ध दिसते. Revised capitalization मध्ये P/E 20× होते. स्वतःच्या जारीकर्त्याचा डेटा तपासण्यासाठी Annual filings CSV आणि ऐच्छिक Capitalization CSV अपलोड करा.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Historical replay → Open economic calendar → Start calendar demo उघडा. प्रकाशनापूर्वी अंदाज 2.5 टक्के आहे आणि प्रत्यक्ष आकडा उपलब्ध नाही. Actual observed मध्ये 14:32 UTC ला 2.7 टक्के दिसतो. Revised actual मध्ये 2.8 टक्के आणि Release evidence मध्ये दोन्ही सुधारणा दिसतात. स्वतःच्या नोंदींसाठी Macro calendar CSV अपलोड करा.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Historical replay → Open option chain → Start option demo उघडा. एप्रिलच्या 100 स्ट्राइक जोडीची IV अंदाजे 20% आहे. Late option quote मध्ये 90 स्ट्राइकचा कॉल 25% IV सह दिसतो. Corrected spread मध्ये पुटचे मूल्यांकन पुन्हा होते. मुदतींची तुलना करण्यासाठी Implied volatility surface उघडा. स्वतःचे भाव वापरण्यासाठी Underlying CSV आणि Option quotes CSV लोड करा.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Historical replay → Open replay alerts → Start alert demo उघडा. First crossing मध्ये एक मर्यादा सूचना आहे. Correction observed मध्ये दुरुस्त नमुना आणि सरकत्या सरासरीचे क्रॉसिंग आहे. Full alert replay मध्ये आठ सूचना आहेत. Save to alert inbox दोनदा वापरा. पहिल्यांदा आठ नोंदी आणि दुसऱ्यांदा शून्य नवीन नोंदी येतात. स्वतःच्या डेटासाठी Alert rules CSV आणि Alert observations CSV लोड करा.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Historical replay → Open paper ledger → Start paper demo उघडा. 503 राखीव रोखीपासून एकाच अंशतः पूर्ततेपर्यंत जा. त्यानंतर रोख 801.6 आहे. थांबवल्यावर Final account मध्ये रोख 663.7 व प्रत्यक्ष नफा 13 दिसतो. स्वतःच्या सराव नोंदींसाठी Paper events CSV लोड करा.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Historical replay → Open bar backtest → Start backtest demo उघडा. 14:05 UTC च्या संकेताने खरेदीचा आदेश नोंदतो. 14:06 चा कालखंड नसल्याने पूर्तता होत नाही. 14:07 च्या बंद भावावर दोन शेअर्स भरतात. Final backtest मध्ये इक्विटी 957.8 आहे. स्थानिक डेटासाठी सत्र आणि बार CSV लोड करा.

बॅकटेस्ट डेमोमध्ये सहा प्रशिक्षण बार आणि दोन चाचणी बारसह Walk-forward validation चालवा. पहिला पूर्ण टप्पा 14:09 UTC ला दिसतो. प्रशिक्षणात 1:2 निवडले जाते आणि नव्या खात्यातून सुरू होणाऱ्या दोन्ही चाचणी बारमध्ये तीच जोडी वापरली जाते.

बार बॅकटेस्ट डेमोमध्ये 20250403 बीज, 256 मार्ग आणि प्रत्येक मार्गाला आठ बदल वापरून Seeded scenarios चालवा. संदर्भातील अंतिम इक्विटी 957.8 आणि परिदृश्यांचा मध्यक 997.6 आहे. तीच वेळमर्यादा, डेटा आणि बीज वापरल्यास तीच जोखीम सारणी मिळते.

युनिव्हर्स डेमोमध्ये BETA-001 साठी Delisting proceeds लोड करा आणि दोन्ही वेळमर्यादा 14:35 UTC ठेवा. रक्कम अद्याप उपलब्ध नसते. 14:37 ला दहा शेअर्ससाठी 70 USD येणे होते आणि 14:50 ला रोख नोंद होते. नंतरच्या दुरुस्त्या आधीचे निकाल कायम ठेवतात आणि BETA-002 वेगळे राहते.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md)

<!-- section:04 -->
## स्वतःची माहिती आयात करा व चालवा

Import CSV मध्ये बाजार आणि चिन्ह भरून अधिकृत UTF-8 OHLCV निवडा. काटेकोर वाढते Unix सेकंद, UTC दिनांक किंवा Z ने संपणारे UTC वेळचिन्ह वापरा. सहा दशांश, ऋण नसलेले प्रमाण आणि उघडणे व बंद भाव सामावणारे उच्च/नीच द्या. चुकीची ओळ सर्व आयात थांबवते. Series details मध्ये कालखंड, स्रोत, वापरहक्क आणि समायोजन धोरण द्या.

वेळचिन्ह सुरुवातीचे ठेवा. Historical replay मध्ये साधन, सत्र CSV व पूर्ण सेकंद (१–८६,४००) निवडा. पंक्तीत अचूक UTC मर्यादा, उघडतानाचा मिनिट फरक व regular किंवा early द्या. जाळी उघडण्यापासून सुरू होते, शेवटचा भाग कमी असू शकतो. सत्र किंवा जाळीबाहेर कँडल नाकारली जाते. उणीव घड्याळ पुढे करते आणि दिसलेले भाव राखते.

मूळ मर्यादा १,५००,००० बाइट व १००,००० कँडल. बिल्डमध्ये 8 MiB व १००,००० पंक्तीपर्यंत बदलता येते. दिनदर्शिकेला 1 MiB, १०,००० न जुळणारे भाग व २००,००० घटना. ब्राउझर कोटा वेगळा.

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
## बॅकअप, स्थलांतर आणि पुनर्स्थापना

Workspace backup → Export workspace आवृत्तीचा JSON तयार करते. मूळ CSV, उगम, दिसणारे व लपलेले इतिहास, यादीक्रम, निवड आणि निर्देशक त्यात आहेत. गंतव्य प्रोफाइलवर Backup file निवडा, पडताळलेली संख्या पाहा आणि Restore workspace दाबा. एक व्यवहार गंतव्य सूची बदलतो. गंतव्य जपायचे असेल तर आधी निर्यात करा.

सुधारित आवृत्तीसाठी तोच प्रोटोकॉल, होस्ट, पोर्ट व प्रोफाइल वापरा. 0.1.0 ची जागा IndexedDB मध्ये स्थलांतरित होते, लिहिलेला मजकूर पुन्हा वाचून तपासला जातो आणि मूळ मूल्य जपले जाते. जुने टॅब बंद करा. बॅकअप साधा मजकूर आहे. SHA-256 अखंडता तपासतो. डेटा हक्कांप्रमाणे साठवण, प्रवेश व कालावधी ठरवा.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## रचना आणि गणना

Rust ओळख, UTC व OHLCV तपासतो, पूर्णांक दशलक्षांशात मोजतो आणि सत्र योजना बनवतो. React तोच Wasm, आलेखासाठी Canvas, लेनदेनासाठी IndexedDB आणि कॅशसाठी service worker वापरतो. आवृत्ती क्रमांक एकत्र लेखन ओळखतात. स्थिती प्रोफाइल आणि उगमाशी जोडलेली आहे.

SMA अचूक सरकती बेरीज वापरतो. EMA पहिल्या पूर्ण खिडकीपासून सुरू होतो आणि प्रत्येक पाऊल दशलक्षांशापर्यंत गोल करतो, समान अंतरावर शून्यापासून दूर. पुनर्चालन दिसलेले बंद भावच घेते. कालखंडाचा शेवट उपलब्धतेचा आधार आहे. पुरवठादाराची प्राप्ती, सुधारणा व कँडलमधल्या वेळांना निराळे इनपुट लागतात. मूळ ओळी राहतात.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## तैनाती आणि कार्यमर्यादा

dist/ HTTPS वर सेवा द्या किंवा loopback सुरू करा. कार्यक्षेत्रासाठी उगम कायम ठेवा. वेगळा पोर्ट, प्रोफाइल किंवा खाजगी खिडकी वेगळे साठवण देते. Tauri तपासताना वेब बिल्ड व सिस्टम अटी पूर्ण करा. CI Windows Server 2022, macOS 15 व Ubuntu 24.04 वर बिल्ड करतो आणि Linux विंडो उघडतो. मोबाइल, ARM व BSD सारणी पहा. चाचणीसाठी डेस्कटॉप Chromium वापरा.

सध्याचे स्वरूप एका प्रोफाइलला एक स्थानिक वापरकर्ता आहे. माहिती मंजूर उपकरणांवर ठेवा. प्रमाणीकरण, विलगीकरण, देखरेख, धारणा व पुनर्प्राप्ती ध्येये स्वतंत्र पडताळलेल्या तैनातीची मागणी करतात. ZIP मध्ये परवाना सूचना व CycloneDX SBOM आहे. आवृत्ती टॅग कार्यप्रवाहात सत्यापन प्रमाण असते.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## बाह्य सेवा पाहा

TradingBotObserverV1 स्वतंत्र trading-bot कडून runtime, status, account व portfolio वाचतो. विश्वासू उगम, loopback बाहेर HTTPS आणि प्रक्रियेच्या कॉन्फिगरेशनमधील अधिकृत टोकन वापरा. प्रत्येक निरीक्षणाची वेळ पाहा. रिकामा स्नॅपशॉट किंवा निरोगी सेवा अतिरिक्त शिल्लक वा स्थानांची माहिती देत नाही. क्रेडेन्शियल, ऑर्डर व अंमलबजावणी बाह्य सेवेकडे आहेत.

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
## स्रोतापासून तयार करा व पडताळा

npm सोबत Node.js 22.12 किंवा नवे, rust-toolchain.toml मध्ये निश्चित Rustup आणि Python 3.11 किंवा नवे वापरा. मुळातून आदेश द्या. Vite विकास URL सहसा 5173 वर, उत्पादन 4173 वर आहे. चाचणीपूर्वी निश्चित Chromium बसवा.

Rust, Wasm, ब्राउझर, SDK, स्थानिक सेवा, परवाने, SBOM व सूचना तपासतात. वेळ बदल, उणीव आणि लवकर बंद यांसह प्रत्येक घटनेवर दोन्ही सरासऱ्या बॅचच्या योग्य प्रारंभिक भागाशी जुळतात. CI अचूक ZIP ID येईपर्यंत थांबतो आणि डाउनलोड बाइट जुळवतो. जुळत्या आवृत्तीच्या टॅगवर प्रमाणन होते.

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
## अडचणी शोधा व पुनरुत्पादित करा

पोर्ट व्यस्त असेल तर --port 4174 वापरा आणि निर्यात व पुनर्स्थापनेने डेटा हलवा. ऑफलाइन अडचणीत उत्पादन बिल्ड आधी ऑनलाइन उघडून Offline ready पहा. नकार मिळाला तर त्रुटीतील ओळ, अंतराची सुरुवात व बाजार-दिनांकासाठी कॅलेंडर तपासा.

CSV, दिनदर्शिका, कालखंड, Git आवृत्ती, ब्राउझर व घटनेची वेळ जपा. कृत्रिम उदाहरण आणि पहिली अपयशी पायरी द्या. पडताळणी नोंदीत प्लॅटफॉर्म पुरावे व आराखड्यात पुढील लक्ष्ये आहेत.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## संग्रह, योगदान आणि परवाना

इंजिन व नमुने crates/core, ब्राउझर व चाचण्या apps/terminal, होस्ट apps/desktop, SDK packages/trading-bot आणि साधने scripts मध्ये आहेत. छोटे तपासलेले बदल करा. हक्क आणि सूचना ठेवा, अवलंबित्व बदलल्यास यादी अद्ययावत करा व त्रुटी गोपनीयपणे कळवा.

मूळ कोड 0BSD आहे आणि अवलंबित्वांचे परवाने स्वतंत्र आहेत. पूर्ण आवृत्त्या Ethnologue 2026 मधील पहिली व दुसरी भाषा बोलणाऱ्यांच्या बेरजेनुसार आहेत, गोलाईमुळे विसाव्या स्थानी समान असलेल्या दोन्ही भाषांसह. जोडलेली मार्गदर्शके व इंटरफेस इंग्रजीत असू शकतात.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
