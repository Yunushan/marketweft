<!-- MarketWeft README · locale=te -->

# MarketWeft

**0.200.0 · 0BSD**

**పత్రాల భాషలు**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · **తెలుగు** · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft ఏమి చేస్తుంది

MarketWeft విశ్లేషకులు, డెవలపర్లు, నిర్వాహకుల కోసం స్థానిక పరిశోధన టెర్మినల్. అనుమతి ఉన్న OHLCV ఫైళ్లను తెరుస్తుంది, క్యాండిళ్లు మరియు పరిమాణం చూపిస్తుంది, స్థిర దశాంశంతో SMA, EMA లెక్కిస్తుంది. గమనిక జాబితా, ఎంచుకున్న సాధనం, సూచికలు IndexedDBలో ఉంటాయి. వనరులు కాష్ అయిన తర్వాత ఆఫ్‌లైన్‌లో పనిచేస్తుంది. అందించిన ధరలు, పరిమాణం కృత్రిమమైనవి. ఖాతా అవసరం లేదు.

MarketWeft 0.200.0 రెండు కటాఫ్ సమయాల్లో మూలధన వాపసును పోల్చి, ఒక్కో కరెన్సీలో నగదు, రావలసిన మొత్తాలు, వ్యయ ఆధారంలో కచ్చితమైన మార్పులను చూపుతుంది. MarketWeft 0.7.0లో ప్రశ్న సమయానికి తెలిసిన ధరల రాబడిని బట్టి సమూహ సభ్యులకు ర్యాంకు ఇవ్వవచ్చు. సెషన్ ఆధారిత రీప్లేలో షేరు విభజనలు, నగదు డివిడెండ్లు, సభ్యత్వం, డీలిస్టింగ్ ఉన్నాయి. వేరే trading-bot సేవ కోసం చదవడానికి మాత్రమే TypeScript అబ్జర్వర్, ప్రయోగాత్మక Tauri ర్యాపర్ కూడా ఉన్నాయి. డేటా ఫీడ్లు, ఆర్డర్లు, సంతకం చేసిన ఇన్‌స్టాలర్లు, బహుళ వినియోగదారుల హోస్టింగ్ రోడ్‌మ్యాప్‌లో ఉన్నాయి.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md) · [Capital return comparison](../portfolio-capital-returns.md#compare-two-cutoffs)

<!-- section:02 -->
## పోర్టబుల్ టెర్మినల్ ప్రారంభించండి

విజయవంతమైన GitHub పరీక్ష నుంచి browser-terminal-attempt-N దిగుమతి చేసుకోండి. MarketWeft-browser-0.200.0.zip విడదీసి dist/ ను serve-terminal.mjs పక్కన ఉంచండి. అక్కడే ఆదేశాన్ని నడపండి. WebAssembly, Canvas, BigInt, IndexedDB ఉన్న బ్రౌజర్‌లో http://127.0.0.1:4173/ తెరవండి. Node.js 22.12 లేదా కొత్తది కావాలి. npm స్థాపన అక్కరలేదు. కనెక్షన్ ఆపేముందు Offline ready కోసం వేచి ఉండండి.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md) · [Linux native verification](../../docs/platforms.md#linux-native-verification) · [Ubuntu desktop package](../../docs/platforms.md#ubuntu-desktop-package) · [Ubuntu upgrade verification](../../docs/platforms.md#verify-an-ubuntu-package-upgrade) · [Ubuntu package provenance](../../docs/platforms.md#verify-ubuntu-package-provenance)

<!-- section:03 -->
## NYSE ఉదాహరణను నడపండి

Historical replay లో Start demo ఎంచుకోండి. Next event ముందుకు, Previous event వెనక్కి. Play మరియు Pause చలనాన్ని నియంత్రిస్తాయి. Reset చూపిన చరిత్రను తొలగిస్తుంది. చార్ట్ ఖాళీగా మొదలవుతుంది. వ్యవధి చివర్లో క్యాండిల్ కనిపిస్తుంది. Event time ప్రారంభం లేదా సెషన్ సరిహద్దు. Observed at అందుబాటు సమయం. వేగం తెరపై నడకనే మారుస్తుంది.

అక్టోబర్ 31, 2025న ప్రారంభం 13:30 UTC (UTC−04:00), నవంబర్ 3న 14:30 UTC (UTC−05:00). నవంబర్ 3న 15:00 వ్యవధి లేనిది 15:30కి తెలుస్తుంది. Thanksgiving రోజున వ్యవధులు లేవు. నవంబర్ 28న ఏడు 30-నిమిషాల క్యాండిళ్ల తర్వాత 18:00 UTCకి ముందే ముగుస్తుంది. 20 సెషన్లు, 253 క్యాండిళ్లు, 294 సంఘటనలు ఉన్నాయి. ధరలు కృత్రిమం, సమయం NYSE ప్రచురిత షెడ్యూల్‌ది.

Historical replay → Start split demo తెరిచి అదే సంఘటనలో Price basis ను Raw, Split-adjusted మధ్య మార్చండి. 2-కి-1 విభజన అమలుకు ముందు ప్రకటించి పరిశీలించబడుతుంది. అప్పటివరకు రెండు వీక్షణలు సమానం. అమల్లోకి రాగానే ముందు చివరి ముగింపు ధర ముడి 106.50 నుంచి సర్దుబాటు చేసిన 53.25 అవుతుంది, పరిమాణం రెట్టింపవుతుంది. తర్వాతి తొలి క్యాండిల్ 53.00గానే ఉంటుంది. మీ డేటాకు సాధనపు Corporate actions CSV, సెషన్ క్యాలెండర్ ఇచ్చి OHLCV ముడిదని నిర్ధారించండి. అమలయ్యాక తెలిసిన తాజా నిష్పత్తి వర్తిస్తుంది. ఆలస్య నివేదికలు, సవరణలు చూసిన సమయం నుంచే వీక్షణను మారుస్తాయి. మూల చరిత్ర అలాగే ఉంటుంది.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Historical replay → Start dividend demo తెరిచి ప్రతి పంపిణీకి అర్హమైన 100 షేర్లను చూడండి. ఎక్స్ తేదీన USD 25.00 అందవలసి ఉంటుంది. సవరణ దాన్ని USD 30.00 చేస్తుంది, కొత్త చెల్లింపు తేదీ నగదు నమోదును వాయిదా వేస్తుంది. ఆలస్య నివేదిక చూసినప్పుడు EUR 10.00 చేరుతుంది. చెల్లింపు తర్వాత సవరణతో USD 28.00 మిగులుతుంది. పాత నిల్వల కోసం వెనక్కి వెళ్లండి. మీ డేటాకు Cash dividends CSV ఇచ్చి Entitled shares per distribution నింపండి. సవరణలకు అదే పంపిణీ ID వాడండి. పద్దు ద్రవ్యాలను వేరుగా ఉంచి పాత నమోదులు, మూల ధరలను కాపాడుతుంది.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Historical replay → Open universe replay → Start universe demo తెరవండి. 14:05 UTCకి ALFA మాత్రమే సభ్యుడు, 14:10కి BETA చేరుతుంది. 14:20కి ప్రభావవంతమైన ALFA తొలగింపు 14:25కి తెలుస్తుంది. 14:30కి BETA డీలిస్టింగ్ 14:35కి తెలుస్తుంది. పాత సభ్యత్వం కోసం వెనక్కి వెళ్లండి లేదా వేర్వేరు Effective time, Known timeతో అడగండి. మీ Universe membership CSV ఇవ్వండి. సవరణకు అదే మార్పు ID వాడండి, టికర్ మళ్లీ వాడితే కొత్త లిస్టింగ్ ID ఇవ్వండి.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Universe screen లో Load demo prices ఎంచుకొని 14:00 UTCని బేస్‌గా ఉంచండి. 14:05కి ALFA 1%తో ముందుంది. 14:10కి BETA చేరుతుంది. దాని ముగింపు ధర 14:12కి తెలిసే వరకు ర్యాంకు ఉండదు. అమలు సమయం 14:10గా ఉంచి తెలిసిన సమయాలను 14:12, 14:16గా మార్చండి. BETA రాబడి 12% నుంచి సవరించిన 1%కి మారుతుంది. 14:20 నుంచి అమలైన ALFA తొలగింపు 14:25కి తెలిసిన తరువాత అది బయటకు వెళ్తుంది. నిర్దిష్ట సమయాల ముగింపు ధరల కోసం లిస్టింగ్ ఐడీతో Universe prices CSV అప్‌లోడ్ చేయండి. బేస్ లేదా లక్ష్య ధర లేకపోతే సభ్యుడికి ర్యాంకు ఉండదు.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

డెమో ధరలు లోడ్ చేసిన తరువాత Sector heatmap లో Load demo sectors ఎంచుకోండి. 14:10 UTCకి తెలిసిన బరువులో 60% కవర్ అవుతుంది. 14:12కి BETA ధర తెలిసినప్పుడు కవరేజ్ 100%కి, కనిపించిన వాటా 1.2% నుంచి 6%కి పెరుగుతాయి. 14:16 సవరణతో BETA Financials నుంచి Technologyకి మారుతుంది. ర్యాంకు, వాటా, వర్గీకరణ సమయాలకు టైల్ తెరవండి. సొంత నివేదిక కోసం Sector and weight CSV అప్‌లోడ్ చేయండి.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Historical replay → Open financial statements → Start financial demo తెరవండి. Original filing లో P/E 10×. అదే విలువ నిర్ణయ సమయానికి Restatement observed లో P/E 15×, సాధారణ ఈక్విటీ లేదని చూపుతుంది. Revised capitalization లో P/E 20× అవుతుంది. మీ జారీదారు, తెలిసిన సమయంతో ప్రశ్నించేందుకు Annual filings CSV, ఐచ్ఛిక Capitalization CSV అప్‌లోడ్ చేయండి.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Historical replay → Open economic calendar → Start calendar demo తెరవండి. విడుదలకు ముందు అంచనా 2.5 శాతం, వాస్తవ విలువ ఇంకా లేదు. Actual observed లో 14:32 UTCకి 2.7 శాతం కనిపిస్తుంది. Revised actual లో 2.8 శాతం, Release evidence లో రెండు సవరణలు కనిపిస్తాయి. సొంత విడుదలల కోసం Macro calendar CSV అప్‌లోడ్ చేయండి.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Historical replay → Open option chain → Start option demo తెరవండి. ఏప్రిల్ 100 స్ట్రైక్ జత IV దాదాపు 20%. Late option quote లో 90 స్ట్రైక్ కాల్ 25% IVతో వస్తుంది. Corrected spread ఒక పుట్ విలువను తిరిగి లెక్కిస్తుంది. గడువులను పోల్చేందుకు Implied volatility surface తెరవండి. సొంత కోట్స్ కోసం Underlying CSV, Option quotes CSV లోడ్ చేయండి.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Historical replay → Open replay alerts → Start alert demo తెరవండి. First crossing ఒక పరిమితి అలర్ట్ చూపుతుంది. Correction observed సవరించిన నమూనా, మూవింగ్ యావరేజ్ క్రాసింగ్ చూపుతుంది. Full alert replay ఎనిమిది అలర్ట్‌లు చూపుతుంది. Save to alert inbox రెండుసార్లు నొక్కండి. మొదట ఎనిమిది, రెండోసారి కొత్తవి సున్నా. సొంత డేటాకు Alert rules CSV, Alert observations CSV లోడ్ చేయండి.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Historical replay → Open paper ledger → Start paper demo తెరవండి. 503 నగదు రిజర్వ్ నుంచి ముందుకు వెళ్తే ఒక పాక్షిక అమలుతో 801.6 మిగులుతుంది. ఆపిన తరువాత Final account లో నగదు 663.7, వాస్తవీకరించిన లాభం 13. సొంత అనుకరణకు Paper events CSV లోడ్ చేయండి.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Historical replay → Open bar backtest → Start backtest demo తెరవండి. 14:05 UTC సంకేతం కొనుగోలు ఆర్డర్ పెడుతుంది. 14:06 బార్ లేక అమలు లేదు. 14:07 ముగింపు రెండు షేర్లను అమలు చేస్తుంది. Final backtest ఈక్విటీ 957.8 చూపుతుంది. సొంత చరిత్రకు సెషన్, బార్ CSVలు లోడ్ చేయండి.

బ్యాక్‌టెస్ట్ డెమోలో ఆరు శిక్షణ బార్లు, రెండు పరీక్ష బార్లతో Walk-forward validation నడపండి. మొదటి పూర్తి విభాగం 14:09 UTCకి కనిపిస్తుంది. శిక్షణలో 1:2 ఎంపికవుతుంది. కొత్త ఖాతాతో మొదలయ్యే రెండు పరీక్ష బార్లకూ అదే జత వర్తిస్తుంది.

బార్ బ్యాక్‌టెస్ట్ డెమోలో 20250403 సీడ్, 256 మార్గాలు, ఒక్కో మార్గానికి ఎనిమిది మార్పులతో Seeded scenarios నడపండి. ప్రామాణిక ముగింపు ఈక్విటీ 957.8, దృశ్యాల మధ్యమం 997.6. అదే కటాఫ్, ఇన్‌పుట్, సీడ్‌తో అదే రిస్క్ పట్టిక వస్తుంది.

యూనివర్స్ డెమోలో BETA-001 కోసం Delisting proceeds లోడ్ చేసి రెండు కటాఫ్‌లను 14:35 UTCగా ఉంచండి. మొత్తం అప్పటికి అందుబాటులో లేదు. 14:37కి పది షేర్లకు 70 USD రావాలి, 14:50కి నగదు లెడ్జర్‌లో నమోదవుతుంది. తరువాతి సవరణలు పాత ఫలితాలను ఉంచుతాయి, BETA-002 వేరుగానే ఉంటుంది.

Start split revisions demo తెరిచి Split-adjusted ఎంచుకోండి. జూన్ 3న 14:10 UTCకి అమలు సమయం మారడంతో పాత సర్దుబాటు తొలగుతుంది. 14:20కి రెండు నిష్పత్తులు కలుస్తాయి. 14:30కి SPLIT-A రద్దయినా SPLIT-B, అసలు క్యాండిళ్లు అలాగే ఉంటాయి.

Start dividend entitlement demo తెరవండి. ALPHAకి మొదట 100 షేర్లు అర్హం, ఆలస్య నివేదికతో 120 అవుతాయి. BETAకి 40 షేర్లు వర్తిస్తాయి. చెల్లింపు తర్వాత ALPHAను 110 షేర్లకు సవరించడంతో 3 USD తిరిగి నమోదు అవుతుంది. మునుపటి బ్యాలెన్స్ కోసం వెనక్కి వెళ్లండి.

యూనివర్స్ డెమోలో Portfolio replay లోడ్ చేయండి. BETA-001 14:10 UTC ముగింపు ధర 14:12కి కనిపిస్తుంది. 14:45కి దాని 70 USD రావాల్సిన మొత్తం BETA-002 షేర్ల 225 EUR విలువకు వేరు. 14:50కి షేర్ల విలువ, డీలిస్టింగ్ నగదు కలిపి 284 USD.

Compare charts ఎంచుకుని పోలిక ఇన్‌స్ట్రుమెంట్‌ను ఎంచుకోండి. Link by UTC రెండు పేన్లలో ఒకే కనిపించే సమయాన్ని చూపుతుంది. ప్రతి పేన్‌ను విడిగా జూమ్ చేయండి. వర్క్‌స్పేస్ బ్యాకప్ ఇన్‌స్ట్రుమెంట్లు, ఓవర్‌లేలు, లింక్ అమరికను సేవ్ చేస్తుంది.

Draw measurement ఎంచుకుని ప్రతి చివరకు ఇప్పటికే ఉన్న UTC బార్‌ను, ధరను ఎంచుకోండి. జూమ్ లేదా పాన్ చేస్తే సేవ్ చేసిన రేఖ అదే కోఆర్డినేట్లతో మళ్లీ కనిపిస్తుంది. వర్క్‌స్పేస్ బ్యాకప్ కోఆర్డినేట్లను ఉంచుతుంది. యాప్ గడిచిన సెకన్లు, ధర మార్పు, శాతం మార్పు చూపుతుంది.

Indicators తెరిచి ప్రతి పేన్‌కు SMA, EMA పీరియడ్‌లను బార్ల సంఖ్యలో అమర్చండి. తగినన్ని ముగింపు ధరలు లభిస్తే ఎంచుకున్న UTC బార్ విలువలు కనిపిస్తాయి. ఇన్‌స్ట్రుమెంట్ మార్చినా, రీలోడ్ చేసినా లేదా బ్యాకప్ పునరుద్ధరించినా పీరియడ్‌లు అలాగే ఉంటాయి.

చార్ట్ కింద Export CSV తెరవండి. మళ్లీ దిగుమతి చేయడానికి OHLCV బార్లను డౌన్‌లోడ్ చేయండి లేదా పరిశోధన కోసం మూల సమాచారం, ప్రారంభించిన మూవింగ్ యావరేజ్‌లను చేర్చండి. తగినన్ని ముగింపు ధరలు వచ్చే వరకు సగటు విలువలు ఖాళీగా ఉంటాయి.

ఏ పేన్‌లోనైనా Close line ఎంచుకోండి. రేఖ గమనించిన ముగింపు ధరలను ఉపయోగించి వాల్యూమ్‌, ఆన్ చేసిన సూచికలను చూపుతుంది. లేని UTC బార్‌కు లింక్ చేసిన క్రాస్‌హెయిర్ కనిపించదు. బ్యాకప్ ఎంచుకున్న చార్ట్ రకాలను ఉంచుతుంది.

OHLC bars ఎంచుకోండి. నిలువు గీత గరిష్ఠ, కనిష్ఠ ధరలను చూపుతుంది. ఎడమ గుర్తు ప్రారంభ ధరను, కుడి గుర్తు ముగింపు ధరను చూపుతుంది. ప్రతి పేన్ తన చార్ట్ రకాన్ని ఉంచుతుంది, లింక్ చేసిన కర్సర్ ఖచ్చితమైన UTC బార్‌ను అనుసరిస్తుంది.

ఏ పేన్‌లోనైనా Timeframe తెరిచి సోర్స్, లక్ష్య వ్యవధులను సెకన్లలో నమోదు చేయండి. చార్ట్‌, పరిశోధన CSV గమనించిన సోర్స్ బార్ల సంఖ్య చూపుతాయి. బ్యాకప్ అసలు సిరీస్‌ను ఉంచుతుంది.

Timeframe లో సెషన్ క్యాలెండర్ CSVని జోడించండి. బకెట్లు ప్రతి సెషన్ ప్రారంభ సమయం నుంచి మొదలవుతాయి. చివరి బకెట్ పేర్కొన్న ముగింపు సమయంలో ఆగుతుంది. పరిశోధన CSV క్యాలెండర్, సోర్స్ కవరేజీని నమోదు చేస్తుంది.

Recorded tick bars తెరిచి ట్రేడ్‌ల సంఖ్య, పరిశీలన కటాఫ్ ఎంచుకోండి. ఒకే సమయంలో ఉన్నవి రికార్డు క్రమంలో ఉంటాయి. చార్ట్ అసంపూర్ణ బార్‌లను గుర్తించి ఖచ్చితమైన సీక్వెన్స్ పరిమితులను ఎగుమతి చేస్తుంది.

Portfolio replay లో డివిడెండ్ డెమో లోడ్ చేయండి లేదా CSV జోడించండి. క్వెరీ ఎక్స్ తేదీకి ముందున్న హోల్డింగ్‌లను తీసుకుని, చెల్లింపు తేదీన సెటిల్ చేస్తుంది. సవరణలు గమనించిన సమయానికే అమలవుతాయి.

ధరలను లోడ్ చేసిన తర్వాత Universe screen లో Relative returns తెరవండి. రెండు లిస్టింగ్ ఐడీలను, ఖచ్చితమైన UTC ఆధార సమయాన్ని ఎంచుకోండి. లేని ముగింపు ధరలు, సవరణలను చూడడానికి సమూహ గడువులను మార్చి, పూర్తి పోలికను CSVగా డౌన్‌లోడ్ చేయండి.

Recorded market depth తెరిచి ఎంచుకున్న సాధనానికి డెప్త్ CSVను లోడ్ చేయండి. కొనుగోలు, అమ్మకం స్థాయిలు, క్రమంలో విరామం, తదుపరి స్నాప్‌షాట్‌లో పునరుద్ధరణ చూడడానికి పరిశీలన సమయాలను మార్చండి. అన్ని స్థాయిలను CSVగా డౌన్‌లోడ్ చేయండి.

Recorded footprint తెరిచి ఎంచుకున్న సాధనం ట్రేడ్‌లను లోడ్ చేయండి. ధర పరిధి వారీగా కొనుగోలు, అమ్మకం, తెలియని వాల్యూమ్ చూడడానికి అమలు సమయ పరిధి, పరిశీలన గడువు సెట్ చేయండి. పూర్తి ఫుట్‌ప్రింట్, సంచిత డెల్టాను CSVగా డౌన్‌లోడ్ చేయండి.

Recorded footprint లో క్వెరీ అమలు చేసిన తర్వాత Price profiles తెరవండి. ప్రతి ధర పరిధిలోని వాల్యూమ్‌ను అక్కడ ట్రేడ్ జరిగిన సమయ విభాగాల సంఖ్యతో పోల్చండి. విలువ ప్రాంత లక్ష్యాన్ని సెట్ చేసి పూర్తి ప్రొఫైల్‌లను CSVగా డౌన్‌లోడ్ చేయండి.

Relative returns కింద Rolling risk తెరవండి. ప్రతి లిస్టింగ్‌కు అందుబాటులో ఉన్న రాబడులు, జత నమూనాల సంఖ్య చూడడానికి UTC విరామం, విండో పొడవు, అస్థిరత స్కేల్ సెట్ చేయండి. పూర్తి అధ్యయనాన్ని CSVగా డౌన్‌లోడ్ చేయండి.

ధరలను లోడ్ చేసిన తర్వాత Universe screen లో Correlated portfolio scenarios తెరవండి. లిస్టింగ్ బరువులు, సీడ్, పునఃసమతుల్య రుసుము ఎంచుకోండి. పూర్తి రాబడి కవరేజ్, మార్గ శతకాలను చూసి అన్ని మార్గాలను CSVగా డౌన్‌లోడ్ చేయండి.

Universe screenలో Cross-sectional paper replay తెరిచి లిక్విడిటీ నివేదికను లోడ్ చేయండి. మొదటి నిర్ణయ సమయం, ర్యాంకింగ్ అమరికలు పెట్టి ఎంపికలు, ఆర్డర్లు, నగదు, లావాదేవీల విలువ చూడండి లేదా పూర్తి రీప్లేను CSVగా డౌన్‌లోడ్ చేసుకోండి.

Cross-sectional paper replayలో Corporate cash reports తెరిచి సంబంధిత CSV ఫైళ్లను లోడ్ చేయండి. అర్హత, చెల్లింపు సవరణలు, పునరుద్ధరించిన పొజిషన్లు, నగదు రసీదులు పరిశీలించి నగదు రికార్డును CSVగా డౌన్‌లోడ్ చేసుకోండి.

Bar backtestలో Recorded trade execution తెరిచి ట్రేడ్ CSVను లోడ్ చేయండి. అమలు, తెలిసిన సమయ పరిమితులను సెట్ చేసి ఆలస్యపు పాక్షిక ట్రేడ్‌లు, ఖచ్చితమైన రికార్డు ఐడీలు, నగదు, ఈక్విటీని చూసి పూర్తి చరిత్రను CSVగా డౌన్‌లోడ్ చేసుకోండి.

ర్యాంకింగ్ రీప్లే తర్వాత Cross-sectional walk-forward తెరవండి. లుక్‌బ్యాక్‌, లిస్టింగ్‌ల సంఖ్యను పోల్చి, విడివిడి పరీక్షల ఫలితాలు మరియు అందుబాటులో లేని విలువలను చూడండి. స్కోర్లు, మూలాలను CSVగా ఎగుమతి చేయండి.

చార్ట్ ఎంచుకుని Time-series formulas తెరవండి. OHLCV వ్యక్తీకరణ, పరిశీలన సమయ పరిమితి ఇచ్చి ఖచ్చితమైన విలువలు, లేని వరుసలు చూడండి. సూత్రం, మూలం, భాష వెర్షన్, ఫలితాలను CSVగా ఎగుమతి చేయండి.

బార్ చరిత్రను లోడ్ చేసి Formula paper backtest తెరవండి. ప్రవేశ, నిష్క్రమణ వ్యక్తీకరణలు మరియు రెండు సమయ పరిమితులు పెట్టండి. బార్ పరిమాణం, రికార్డు ట్రేడ్‌లతో జరిగిన అమలును పోల్చి రసీదులను CSVగా ఎగుమతి చేయండి.

ఆమోదించిన సూత్ర బ్యాక్‌టెస్ట్ నుంచి వ్యూహ ప్యాకేజీని డౌన్‌లోడ్ చేయండి. మరో వర్క్‌స్పేస్‌లో రెండు సూత్రాలు, అమలు విధానం, ఖచ్చితమైన ఖాతా అమరికలను పునరుద్ధరించండి. అదే డేటా, సమయ పరిమితులతో ఫలితాన్ని మళ్లీ పొందండి.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Fibonacci time zones](../chart-workspace.md#fibonacci-time-zones) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

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
