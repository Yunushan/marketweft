<!-- MarketWeft README · locale=sw -->

# MarketWeft

**0.127.0 · 0BSD**

**Lugha za mwongozo**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · **Kiswahili** · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## MarketWeft inafanya nini

MarketWeft ni kituo cha utafiti cha ndani kwa wachambuzi, wasanidi na waendeshaji. Hufungua OHLCV iliyoidhinishwa, huchora vinara na kiasi, hukokotoa SMA na EMA kwa nukta isiyohama, na huhifadhi orodha, chombo kilichochaguliwa na viashiria katika IndexedDB. Hufanya kazi bila mtandao baada ya kuhifadhi rasilimali. Bei na kiasi vya mfano ni vya kutungwa na havihitaji akaunti.

MarketWeft 0.127.0 inaongeza miale ya mlalo na mistari ya mwelekeo yenye nukta mbili inayoweza kuhaririwa. MarketWeft 0.7.0 inaongeza uchujaji na upangaji wa wanachama kwa faida ya bei kwa kutumia taarifa zilizojulikana wakati wa hoja. Rejeo la vipindi vya soko linajumuisha mgawanyo wa hisa, gawio la fedha taslimu, uanachama na kufutwa kwa orodha. Hazina ina kifuatiliaji cha TypeScript cha kusoma tu kwa huduma tofauti ya trading-bot na kifurushi cha majaribio cha Tauri. Milisho ya data, maagizo, visakinishi vilivyosainiwa na upangishaji wa watumiaji wengi vipo kwenye ramani ya kazi.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Anzisha kituo kinachobebeka

Pakua browser-terminal-attempt-N kutoka ukaguzi wa GitHub uliofaulu. Fungua MarketWeft-browser-0.127.0.zip, weka dist/ karibu na serve-terminal.mjs na endesha amri humo. Fungua http://127.0.0.1:4173/ kwa kivinjari kinachotumia WebAssembly, Canvas, BigInt na IndexedDB. Tumia Node.js 22.12 au mpya zaidi. Usakinishaji wa npm hauhitajiki. Subiri Offline ready kabla ya kukata mtandao.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## Cheza mfano wa NYSE

Katika Historical replay chagua Start demo. Next event husonga, Previous event hurudi, Play na Pause hudhibiti uchezaji, na Reset hufuta historia iliyoonekana. Chati huanza tupu. Kinara huonekana baada ya muda wake. Event time ni mwanzo au mpaka wa kipindi. Observed at ni wakati habari inapopatikana. Kasi hubadili mwendo wa kuonyesha tu.

Oktoba 31, 2025 hufunguka 13:30 UTC (UTC−04:00), na Novemba 3 hufunguka 14:30 UTC (UTC−05:00). Sehemu iliyokosekana kuanzia 15:00 hujulikana 15:30. Thanksgiving haina sehemu za soko. Novemba 28 hufungwa mapema saa 18:00 UTC baada ya vinara saba vya dakika 30. Kuna vipindi 20, vinara 253 na matukio 294, bei za kutungwa na saa za NYSE zilizochapishwa.

Fungua Historical replay → Start split demo na badili Price basis kati ya Raw na Split-adjusted kwenye tukio moja. Mgawanyo wa 2 kwa 1 unatangazwa na kuonekana kabla ya kuanza kutumika. Hadi hapo mionekano inalingana. Ukianza kutumika, bei ya mwisho kabla yake inabadilika kutoka 106.50 asili hadi 53.25 iliyorekebishwa, na kiasi kinaongezeka mara mbili. Kinara cha kwanza baadaye kinabaki 53.00. Kwa data yako, pakia Corporate actions CSV ya chombo, thibitisha OHLCV asili na toa kalenda. Uwiano wa mwisho ulioonekana hutumika ukianza kuwa halali. Ripoti iliyochelewa au masahihisho hubadili mwonekano kuanzia wakati wa kuonekana. Historia asili inabaki.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Fungua Historical replay → Start dividend demo ufuatilie hisa 100 zenye haki kwa kila gawio. Tarehe ya bila gawio huweka USD 25.00 ya kupokea. Marekebisho huifikisha USD 30.00 na tarehe mpya ya kulipa huchelewesha kuingia kwa pesa. Ripoti iliyochelewa huandika EUR 10.00 ikionekana. Sahihisho baada ya malipo huacha USD 28.00. Rudi nyuma kuona salio la awali. Kwa data yako pakia Cash dividends CSV na weka Entitled shares per distribution. Tumia kitambulisho kilekile unapofanya marekebisho. Leja hutenganisha sarafu na kuhifadhi maingizo ya awali pamoja na bei asili.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Fungua Historical replay → Open universe replay → Start universe demo. Saa 14:05 UTC ALFA pekee ni mwanachama, na BETA hujiunga 14:10. Kuondolewa kwa ALFA kuanzia 14:20 kunajulikana 14:25. Kufutwa kwa orodha ya BETA kuanzia 14:30 kunajulikana 14:35. Rudi nyuma au uliza kwa Effective time na Known time tofauti. Pakia Universe membership CSV yako. Hifadhi kitambulisho cha badiliko unapokisahihisha na tumia kitambulisho kipya cha orodha alama ikitumika tena.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Katika Universe screen chagua Load demo prices na weka 14:00 UTC kama msingi. Saa 14:05 ALFA inaongoza kwa 1%. BETA inaingia 14:10 na haina nafasi hadi bei yake ya kufunga ijulikane 14:12. Tumia muda wa kuanza kutumika 14:10 na linganisha taarifa zilizojulikana 14:12 na 14:16. Faida ya BETA inashuka kutoka 12% hadi 1% baada ya marekebisho. Kwa muda wa 14:20, ALFA huondoka taarifa ya kuondolewa inapojulikana 14:25. Pakia Universe prices CSV yenye vitambulisho vya orodha na bei za muda kamili. Mwanachama hukosa nafasi ikiwa bei ya msingi au mwisho haipo.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

Baada ya kupakia bei za mfano, chagua Load demo sectors katika Sector heatmap. Saa 14:10 UTC ramani inafunika 60% ya uzito unaojulikana. Bei ya BETA ikijulikana 14:12, ufunikaji unafika 100% na mchango ulioangaliwa unapanda kutoka 1.2% hadi 6%. Marekebisho ya 14:16 yanahamisha BETA kutoka Financials hadi Technology. Fungua kigae kuona nafasi, mchango na nyakati za uainishaji. Pakia Sector and weight CSV kwa ripoti zako.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Fungua Historical replay → Open financial statements → Start financial demo. Original filing inaonyesha P/E ya 10×. Kwa wakati huohuo wa uthamini, Restatement observed inaonyesha 15× na ukosefu wa usawa wa hisa za kawaida. Revised capitalization inaongeza P/E hadi 20×. Pakia Annual filings CSV na Capitalization CSV ya hiari ili kutafuta mtoaji wako kwa muda uliochagua.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Fungua Historical replay → Open economic calendar → Start calendar demo. Kabla ya kutolewa, matarajio ni 2.5% na matokeo halisi hayapatikani. Actual observed inaonyesha 2.7% saa 14:32 UTC. Revised actual inaonyesha 2.8% na Release evidence ina marekebisho yote mawili. Pakia Macro calendar CSV kwa matoleo yako yenye tarehe.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Fungua Historical replay → Open option chain → Start option demo. Jozi ya Aprili yenye bei ya utekelezaji 100 huanza karibu 20% IV. Late option quote huonyesha call ya bei 90 kwenye 25% IV, na Corrected spread hurejesha uthamini wa put. Fungua Implied volatility surface kulinganisha tarehe za kuisha. Pakia Underlying CSV na Option quotes CSV kwa nukuu zako.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Fungua Historical replay → Open replay alerts → Start alert demo. First crossing inaonyesha arifa moja ya kizingiti. Correction observed inaonyesha sampuli iliyorekebishwa na uvukaji wa wastani unaosonga. Full alert replay inaonyesha arifa nane. Tumia Save to alert inbox mara mbili. Mara ya kwanza inahifadhi rekodi nane na mara ya pili hakuna mpya. Pakia Alert rules CSV na Alert observations CSV kwa data yako.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Fungua Historical replay → Open paper ledger → Start paper demo. Songa kutoka akiba ya 503 hadi utekelezaji mmoja wa sehemu unaoacha 801.6. Final account inaonyesha 663.7 na faida iliyopatikana ya 13 baada ya kusimamisha. Pakia Paper events CSV kujaribu matukio yako.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Fungua Historical replay → Open bar backtest → Start backtest demo. Ishara ya 14:05 UTC inaweka agizo la kununua. Pengo la 14:06 halitekelezi agizo. Bei ya kufunga 14:07 inaruhusu hisa mbili. Final backtest inaonyesha thamani ya 957.8. Pakia CSV za vipindi na baa kwa historia yako.

Katika onyesho la majaribio kwa historia, endesha Walk-forward validation kwa vipindi sita vya mafunzo na viwili vya majaribio. Dirisha la kwanza kamili linaonekana saa 14:09 UTC. Jozi 1:2 inashinda katika mafunzo na inatumika katika vipindi vyote viwili vya majaribio, vinavyoanza na akaunti mpya.

Katika onyesho la majaribio kwa historia, endesha Seeded scenarios kwa mbegu 20250403, njia 256 na mabadiliko manane kwa kila njia. Thamani ya mwisho ya msingi ni 957.8 na mediani ya matukio ni 997.6. Tarehe ya mwisho, data na mbegu zilezile hutoa jedwali lilelile la hatari.

Kwenye onyesho la kundi, pakia Delisting proceeds kwa BETA-001 na weka mipaka yote miwili saa 14:35 UTC. Kiasi hakipatikani bado. Saa 14:37 hisa kumi zinastahili 70 USD, na fedha zinaandikwa saa 14:50. Marekebisho yanahifadhi maoni ya awali na kutenga BETA-002.

Fungua Start split revisions demo na uchague Split-adjusted. Tarehe 3 Juni saa 14:10 UTC muda uliorekebishwa unaondoa urekebishaji wa awali. Saa 14:20 uwiano wa matukio mawili unazidishwa. Kughairi SPLIT-A saa 14:30 kunaacha SPLIT-B na mishumaa asili.

Fungua Start dividend entitlement demo. ALPHA huanza na hisa 100 zinazostahili na kufika 120 baada ya taarifa ya kuchelewa. BETA hutumia hisa 40. Marekebisho ya ALPHA hadi hisa 110 yanarejesha 3 USD baada ya malipo. Rudi nyuma kuona salio la awali.

Kwenye onyesho la kundi, pakia Portfolio replay. Bei ya kufunga ya BETA-001 ya 14:10 UTC inaonekana ikijulikana saa 14:12. Saa 14:45, 70 USD zinazopokelewa zimetenganishwa na 225 EUR za hisa za BETA-002. Saa 14:50 thamani ya hisa na fedha zinafikia 284 USD.

Chagua Compare charts kisha chagua chombo cha kulinganisha. Link by UTC huonyesha muda uleule unaoonekana kwenye paneli zote. Kuza kila paneli kivyake. Nakala huhifadhi vyombo, viashiria na mpangilio wa kiungo.

Chagua Draw measurement, kisha pau iliyopo ya UTC na bei kwa kila ncha. Unapokuza au kusogeza chati, mstari huchorwa upya kwa kutumia viwianishi vilivyohifadhiwa. Nakala ya nafasi ya kazi huhifadhi viwianishi. Programu huonyesha muda kwa sekunde na mabadiliko ya bei kwa kiasi na asilimia.

Fungua Indicators na uweke vipindi vya SMA na EMA kwa idadi ya pau katika kila paneli. Bei za kufunga zikitosha, chati huonyesha thamani za pau iliyochaguliwa ya UTC. Vipindi hubaki ukibadili chombo, ukipakia upya, au ukirejesha nakala.

Fungua Export CSV chini ya chati. Pakua pau za OHLCV kwa uingizaji tena, au jumuisha taarifa za chanzo na wastani wa kusonga uliowashwa kwa uchambuzi. Wastani hubaki wazi hadi bei za kufunga zitoshe.

Chagua Close line kwenye paneli yoyote. Mstari hutumia bei za kufunga zilizorekodiwa na huonyesha kiasi pamoja na viashiria vilivyowashwa. Pau ya UTC ikikosekana, kiashiria kilichounganishwa hakionekani. Nakala huhifadhi aina za chati.

Chagua OHLC bars. Mstari wima unaonyesha bei ya juu na ya chini, alama ya kushoto bei ya kufungua na alama ya kulia bei ya kufunga. Kila paneli huhifadhi aina yake na kiashiria kilichounganishwa hufuata pau sahihi za UTC.

Fungua Timeframe katika paneli yoyote na uandike vipindi vya chanzo na lengwa kwa sekunde. Chati na CSV ya utafiti zinaonyesha pau zilizopatikana. Nakala huhifadhi mfululizo wa awali.

Ongeza CSV ya kalenda katika Timeframe. Vipindi vinaanzia wakati wa kufungua kila kikao na kipindi cha mwisho kinaishia wakati wa kufunga uliowekwa. CSV ya utafiti huandika kalenda na idadi ya pau za chanzo.

Fungua Recorded tick bars na uchague idadi ya miamala na muda wa mwisho wa uchunguzi. Chati huhifadhi mpangilio wa rekodi kwa muda sawa, hutambua pau zisizokamilika na husafirisha namba halisi za mfuatano.

Katika Portfolio replay pakia mfano wa gawio au ongeza CSV. Hoja hutumia hisa za kabla ya tarehe ya ex, huhesabu malipo siku ya kulipa na hutumia marekebisho yanapoonekana.

Baada ya kupakia bei, fungua Relative returns kwenye Universe screen. Chagua vitambulisho viwili vya orodha na wakati halisi wa msingi kwa UTC. Badilisha vikomo vya uchunguzi ili kuona bei za kufunga zinazokosekana na marekebisho, kisha pakua ulinganisho mzima kama CSV.

Fungua Recorded market depth na upakie CSV ya kina cha soko kwa kifaa ulichochagua. Pitia nyakati za uchunguzi ili kuona viwango vya kununua na kuuza, pengo la mfuatano na urejeshaji kwenye nakala inayofuata. Pakua viwango vyote kama CSV.

Fungua Recorded footprint na upakie miamala ya kifaa kilichochaguliwa. Weka dirisha la utekelezaji na kikomo cha uchunguzi ili kuona kiasi cha kununua, kuuza na kisichojulikana katika kila eneo la bei. Pakua alama kamili na tofauti limbikizi kama CSV.

Baada ya kuendesha hoja katika Recorded footprint, fungua Price profiles. Linganisha kiasi kwa bei na idadi ya vipindi vilivyokuwa na miamala katika kila eneo la bei. Weka lengo la eneo la thamani na upakue wasifu kamili kama CSV.

Fungua Rolling risk chini ya Relative returns. Weka kipindi cha UTC, urefu wa dirisha na kipimo cha tete ili kuona mapato yanayopatikana kwa kila orodha na idadi ya sampuli za jozi. Pakua utafiti mzima kama CSV.

Baada ya kupakia bei katika Universe screen, fungua Correlated portfolio scenarios. Weka uzani, mbegu na ada ya kusawazisha tena. Angalia ufunikaji wa mapato kamili na asilimia za njia, kisha pakua njia zote kama CSV.

Kwenye Universe screen, fungua Cross-sectional paper replay na upakie ripoti ya ukwasi. Weka wakati wa uamuzi wa kwanza na vigezo vya kupanga. Kagua chaguo, maagizo, fedha taslimu na thamani ya biashara au pakua historia nzima kama CSV.

Kwenye Cross-sectional paper replay, fungua Corporate cash reports na upakie CSV zinazohusika. Endesha uigaji kukagua haki ya malipo, marekebisho, nafasi zilizorejeshwa na stakabadhi. Pakua rekodi ya fedha kama CSV.

Kwenye Bar backtest, fungua Recorded trade execution na upakie CSV ya miamala. Weka mipaka ya muda wa utekelezaji na wa kujulikana ili kukagua utekelezaji wa sehemu, vitambulisho sahihi, fedha na thamani ya akaunti. Pakua historia yote kama CSV.

Baada ya kurudia viwango, fungua Cross-sectional walk-forward. Linganisha muda wa kutazama nyuma na idadi ya dhamana, kagua majaribio tofauti na thamani zinazokosekana, kisha hamisha alama na vyanzo kama CSV.

Chagua chati na ufungue Time-series formulas. Ingiza usemi wa OHLCV na muda wa mwisho wa uchunguzi, kagua thamani na safu zinazokosekana, kisha hamisha fomula, chanzo, toleo la lugha na matokeo kama CSV.

Pakia historia ya pau na ufungue Formula paper backtest. Weka fomula na mipaka miwili ya wakati. Linganisha utekelezaji wa kiasi cha pau na miamala iliyorekodiwa, kisha hamisha stakabadhi kama CSV.

Pakua kifurushi kutoka jaribio la fomula lililokubaliwa. Kipakie katika eneo jingine ili kurejesha fomula zote, njia ya utekelezaji na mipangilio sahihi ya akaunti. Tumia data na mipaka ileile kurudia matokeo.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Local REST](../local-rest-research.md) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines)

<!-- section:04 -->
## Ingiza na cheza data yako

Katika Import CSV weka soko na alama, uchague OHLCV ya UTF-8 yenye ruhusa. Tumia sekunde za Unix, tarehe za UTC au muda wa UTC unaoishia Z kwa mpangilio mkali wa kuongezeka. Tumia hadi nafasi sita za desimali, kiasi kisicho hasi na viwango vya juu na chini vinavyofunika ufunguzi na kufungwa. Safu potovu hukataa uingizaji wote. Weka muda, chanzo, ruhusa na sera ya marekebisho katika Series details.

Weka saa ya mwanzo kwa kila kinara. Katika Historical replay chagua chombo na kalenda ya CSV, kisha sekunde kamili 1–86,400. Andika mipaka ya UTC, tofauti ya dakika wakati wa ufunguzi na regular au early. Gridi inaanza soko likifunguka. Sehemu ya mwisho inaweza kuwa fupi. Vinara nje ya kipindi au gridi hukataliwa. Pengo husogeza saa na huhifadhi bei iliyoonekana.

Kikomo cha msingi kwa faili ni baiti 1,500,000 na vinara 100,000. Usanidi wa ujenzi unaweza kufikia 8 MiB na safu 100,000. Kalenda hukubali 1 MiB, sehemu 10,000 zisizopishana na matukio 200,000. Mgao wa hifadhi ya kivinjari ni tofauti.

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
## Hifadhi nakala, hamisha na rejesha

Workspace backup → Export workspace huhifadhi JSON yenye toleo, CSV asili, chanzo, historia inayoonekana na iliyofichwa, mpangilio, chombo na viashiria. Katika wasifu lengwa chagua Backup file, kagua idadi na ubonyeze Restore workspace. Muamala mmoja hubadilisha katalogi lengwa. Hamisha katalogi iliyopo kwanza ikiwa unaihitaji.

Sasisha kwa skimu, seva, bandari na wasifu uleule. Nafasi ya 0.1.0 huhamia IndexedDB na kusomwa tena kwa uhakiki, huku thamani asili ikihifadhiwa. Funga vichupo vya zamani. Nakala ni maandishi wazi. SHA-256 hukagua ukamilifu. Tumia haki za data kuamua hifadhi, ufikiaji na muda wa kuhifadhi.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Muundo na kanuni za hesabu

Rust hukagua utambulisho, UTC na OHLCV, huhesabu kwa sehemu za milioni zilizo namba kamili na kuunda mpango wa vipindi. React hutumia Wasm hiyohiyo, Canvas kuchora, miamala ya IndexedDB na service worker ya akiba. Namba za marekebisho hugundua uandishi unaogongana. Hali inafungamana na wasifu na anwani asili.

SMA hutumia jumla inayosogea iliyo sahihi. EMA huanza kwenye dirisha kamili la kwanza na kuzungusha kila hatua hadi milioni moja ya sehemu, mbali na sufuri ikiwa sawa. Uchezaji hutumia bei za kufunga zilizofichuliwa. Mwisho wa nafasi ndio wakati wa upatikanaji. Muda halisi wa mtoa data, masahihisho na muda ndani ya kinara huhitaji ingizo tofauti. Safu asili hubaki.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Usambazaji na mipaka ya uendeshaji

Hudumia dist/ kwa HTTPS au tumia kizindua cha loopback. Dumisha anwani asili ili kuhifadhi nafasi ya kazi. Bandari, wasifu au dirisha la faragha tofauti lina hifadhi tofauti. Ili kujaribu Tauri jenga wavuti na sakinisha mahitaji ya mfumo. CI hujenga Windows Server 2022, macOS 15 na Ubuntu 24.04 na hukagua dirisha la Linux. Jedwali lina simu, ARM na BSD. Tumia Chromium ya kompyuta kupima.

Muundo wa sasa ni mtumiaji mmoja wa ndani kwa wasifu. Hifadhi data na nakala katika vifaa vilivyoidhinishwa. Uthibitisho wa utambulisho, utengaji, ufuatiliaji, muda wa kuhifadhi na malengo ya kurejesha huhitaji usanifu mwingine uliothibitishwa. ZIP ina taarifa za leseni na CycloneDX SBOM. Lebo ya toleo huanzisha uthibitisho wa kifurushi.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Angalia huduma ya nje

TradingBotObserverV1 husoma runtime, status, account na portfolio kutoka trading-bot iliyosanidiwa kando. Tumia chanzo kinachoaminika, HTTPS nje ya loopback na tokeni iliyoidhinishwa kutoka usanidi wa mchakato. Tumia wakati wa kila picha ya hali. Picha tupu au huduma iliyo sawa haitoi taarifa zaidi za salio na nafasi. Vitambulisho, maagizo na utekelezaji ni vya huduma ya nje.

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
## Jenga na thibitisha kutoka msimbo

Tumia Node.js 22.12 au mpya na npm, Rustup iliyowekwa rust-toolchain.toml, na Python 3.11 au mpya. Endesha kwenye mzizi wa hazina. Vite huonyesha anwani ya maendeleo, kawaida 5173. Toleo la uzalishaji hutumia 4173. Sakinisha Chromium iliyowekwa kabla ya majaribio.

Ukaguzi unahusu Rust, Wasm, kivinjari, SDK, seva, leseni, SBOM na arifa. Kila tukio hupima wastani zote dhidi ya sehemu ya mwanzo ya hesabu ya pamoja, pamoja na mabadiliko ya saa, pengo na kufungwa mapema. CI husubiri kitambulisho halisi cha ZIP na kulinganisha baiti za kupakua. Lebo inayolingana na toleo huanzisha uthibitisho.

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
## Tambua tatizo na lirudie

Ikiwa bandari inatumika, tumia --port 4174 na hamisha data kwa uhamishaji nje na urejeshaji. Kwa tatizo la nje ya mtandao, fungua toleo la uzalishaji ukiwa mtandaoni na subiri Offline ready. Faili ikikataliwa, kagua safu iliyotajwa, mwanzo wa muda na kalenda ya soko na tarehe.

Hifadhi CSV, kalenda, muda, marekebisho ya Git, kivinjari na saa ya tukio. Ripoti mfano wa kutungwa na hatua ya kwanza iliyoshindwa. Rekodi ya ukaguzi ina ushahidi wa majukwaa na mpango una malengo yanayofuata.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Hazina, michango na leseni

Injini na mifano ziko crates/core, kituo na majaribio apps/terminal, mwenyeji apps/desktop, SDK packages/trading-bot, na zana scripts. Fanya mabadiliko madogo yaliyopimwa. Heshimu haki na arifa, sasisha orodha baada ya kubadili vitegemezi, na toa taarifa ya udhaifu kwa faragha.

Msimbo asili una 0BSD. Vitegemezi vina leseni zao. Matoleo kamili yanafuata Ethnologue 2026 kwa jumla ya wazungumzaji wa lugha ya kwanza na ya pili, pamoja na lugha zote mbili zilizo sawa kwenye nafasi ya 20 baada ya kuzungusha. Miongozo iliyounganishwa na programu zinaweza kutumia Kiingereza.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
