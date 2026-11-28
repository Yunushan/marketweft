<!-- MarketWeft README · locale=ha -->

# MarketWeft

**0.283.0 · 0BSD**

**Harsunan wannan jagora**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · **Hausa** · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Abin da MarketWeft ke yi

MarketWeft tashar bincike ce da ke aiki a na’urar mai amfani. Tana buɗe OHLCV da aka ba da izini, tana nuna sandunan farashi da ƙarar ciniki, tana lissafin SMA da EMA da tsayayyun guraben goma, kuma tana ajiye jerin sa ido, kadara da alamomi a IndexedDB. Bayan an adana kayan aiki za ta yi aiki ba tare da intanet ba. Farashi da ƙarar da ke tare da ita na kwaikwayo ne, ba sai an buɗe asusun mai bayarwa ba.

MarketWeft 0.283.0 yana ƙara damar karatu kawai ta MCP ga sandunan ƙimar ciniki, tare da ainihin lambobin rikodi da sakamako shafi-shafi. MarketWeft 0.7.0 ya ƙara tsara membobin rukuni bisa canjin farashi da bayanan da aka sani lokacin tambaya. Sake kunna zaman kasuwa ya haɗa da rabon hannun jari, kuɗin riba, zama memba da cirewa daga kasuwa. Akwai mai lura na TypeScript mai karatu kawai don sabis na trading-bot daban da naɗin Tauri na gwaji. Hanyoyin bayanai, umarnin ciniki, masu sakawa da aka sa wa hannu da masaukin masu amfani da yawa suna cikin shirin gaba.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md) · [Recorded notional bars over MCP](../local-mcp-research.md#recorded-notional-bars) · [Equity target research SDKs](../portfolio-replay.md#equity-target-research-sdks)

<!-- section:02 -->
## Kunna tashar ɗaukuwa

Sauke browser-terminal-attempt-N daga gwajin GitHub da ya yi nasara. Cire MarketWeft-browser-0.283.0.zip, bar dist/ kusa da serve-terminal.mjs sannan gudanar da umarnin a can. Buɗe http://127.0.0.1:4173/ a burauza mai WebAssembly, Canvas, BigInt da IndexedDB. Ana buƙatar Node.js 22.12 ko sabo. Ba a buƙatar shigar da npm. Jira Offline ready kafin katse intanet.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md) · [Linux native verification](../../docs/platforms.md#linux-native-verification) · [Ubuntu desktop package](../../docs/platforms.md#ubuntu-desktop-package) · [Ubuntu upgrade verification](../../docs/platforms.md#verify-an-ubuntu-package-upgrade) · [Ubuntu package provenance](../../docs/platforms.md#verify-ubuntu-package-provenance)

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

Buɗe Historical replay → Open universe replay → Start universe demo. A 14:05 UTC ALFA kaɗai memba ne, BETA ya shiga a 14:10. An san cire ALFA daga 14:20 a 14:25. An san cire BETA daga jerin kasuwa daga 14:30 a 14:35. Koma baya ko bincika da Effective time da Known time dabam. Loda Universe membership CSV naka. Riƙe ID na canji wajen gyara kuma ka ware ID na jeri idan an sake amfani da alama.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

A Universe screen, zaɓi Load demo prices ka bar 14:00 UTC a matsayin tushe. Da 14:05 ALFA ne na farko da 1%. BETA ya shiga 14:10 kuma ba shi da matsayi har sai an sami farashin rufensa 14:12. Ka yi tambayar lokacin aiki 14:10 da bayanan 14:12 da 14:16 don kwatanta 12% na BETA da 1% bayan gyara. ALFA ya fita daga sakamakon 14:20 idan an san cirewar a 14:25. Loda Universe prices CSV mai ID na rijista da ainihin lokacin rufewa. Idan babu farashin tushe ko na ƙarshe, memba yana nan ba tare da matsayi ba.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

Bayan loda farashin misali, zaɓi Load demo sectors a Sector heatmap. Da 14:10 UTC taswirar ta rufe 60% na nauyin da aka sani. Da an san farashin BETA a 14:12, ɗaukar nauyi ya kai 100% kuma gudummawar da aka gani ta tashi daga 1.2% zuwa 6%. Gyaran 14:16 ya motsa BETA daga Financials zuwa Technology. Buɗe tayal don matsayi, gudummawa da lokutan rarrabawa. Loda Sector and weight CSV don bayananka.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Buɗe Historical replay → Open financial statements → Start financial demo. Original filing ya nuna P/E 10×. A lokacin kimantawar nan, Restatement observed ya kai shi 15× kuma ya nuna rashin ƙimar hannun jari na gama-gari. Revised capitalization ya kai P/E 20×. Loda Annual filings CSV da Capitalization CSV na zaɓi don tambayar kamfaninka da lokacin bayanan da aka sani.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Buɗe Historical replay → Open economic calendar → Start calendar demo. Kafin wallafa, hasashe ya kasance 2.5% kuma babu ainihin ƙima. Actual observed ya nuna 2.7% da 14:32 UTC. Revised actual ya nuna 2.8%, kuma Release evidence yana da gyare-gyaren biyu. Loda Macro calendar CSV don rahotannin da ka tanada.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Buɗe Historical replay → Open option chain → Start option demo. Zaɓuɓɓukan Afrilu masu strike 100 suna da IV kusan 20%. Late option quote yana nuna call mai strike 90 tare da IV 25%. Corrected spread yana gyara lissafin put. Buɗe Implied volatility surface don kwatanta kwanakin ƙarewa. Loda Underlying CSV da Option quotes CSV don saka farashinka.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Buɗe Historical replay → Open replay alerts → Start alert demo. First crossing ya nuna faɗakarwar iyaka ɗaya. Correction observed ya nuna samfurin da aka gyara da ketare matsakaici mai motsi. Full alert replay ya nuna faɗakarwa takwas. Danna Save to alert inbox sau biyu don adana takwas da farko da sifili sababbi a karo na biyu. Loda Alert rules CSV da Alert observations CSV don bayananka.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Buɗe Historical replay → Open paper ledger → Start paper demo. Matsa daga ajiyar 503 zuwa cikar wani sashe sau ɗaya da ta bar 801.6. Final account ya nuna 663.7 da ribar 13 bayan dakatarwa. Loda Paper events CSV don sake kunna matakan kwaikwayonka.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Buɗe Historical replay → Open bar backtest → Start backtest demo. Alamar 14:05 UTC ta sa umarnin saya. Gibin 14:06 bai cika umarni ba. Rufewar 14:07 ta ba da hannun jari biyu. Final backtest ya nuna ƙimar 957.8. Loda CSV na zama da na sanduna don tarihin ka.

A gwajin bayanan tarihi, gudanar da Walk-forward validation da sanduna shida na horo da biyu na gwaji. Cikakkiyar taga ta farko tana bayyana da 14:09 UTC. Haɗin 1:2 ya fi a horo kuma ana amfani da shi a sandunan gwaji biyu da suka fara da sabon asusu.

A gwajin bayanan tarihi, gudanar da Seeded scenarios da iri 20250403, hanyoyi 256 da canje-canje takwas a kowace hanya. Jaridar asusu ta ƙare da 957.8 a gwajin asali, matsakaicin tsakiya na hanyoyin kuma 997.6. Lokaci, bayanai da iri iri ɗaya suna ba da jadawalin haɗari iri ɗaya.

A gwajin jerin kasuwa, loda Delisting proceeds na BETA-001 ka sa iyakokin biyu a 14:35 UTC. Adadin bai bayyana ba. A 14:37, hannun jari goma na da 70 USD da za a karɓa, kuma ana rubuta kuɗin a 14:50. Gyare-gyaren baya suna barin sakamakon farko da BETA-002 dabam.

Buɗe Start split revisions demo ka zaɓi Split-adjusted. Ranar 3 ga Yuni da 14:10 UTC sabon lokaci yana cire gyaran da ya gabata. Da 14:20 ana ninka kaso biyu. Soke SPLIT-A da 14:30 yana barin SPLIT-B da sandunan farashi na asali.

Buɗe Start dividend entitlement demo. ALPHA ya fara da hannun jari 100 kuma ya koma 120 bayan rahoton da ya makara. BETA yana amfani da hannun jari 40. Gyaran ALPHA zuwa 110 bayan biya yana mayar da 3 USD. Koma baya don ganin ma’aunin da ya gabata.

A gwajin jerin kasuwa, loda Portfolio replay. Farashin rufewa na BETA-001 da 14:10 UTC yana bayyana a 14:12. A 14:45, 70 USD da za a karɓa sun bambanta da 225 EUR na hannun jarin BETA-002. A 14:50, darajar hannun jari da kuɗin cirewa sun kai 284 USD.

Zaɓi Compare charts sannan kayan aikin kwatantawa. Link by UTC yana nuna lokaci ɗaya da ake gani a bangarorin biyu. Faɗaɗa kowanne dabam. Ajiyar wajen aiki tana riƙe kayan aikin, alamomi da saitin haɗin.

Zaɓi Draw measurement sannan ka zaɓi sandar UTC da take nan da farashi ga kowane ƙarshen layi. Idan ka faɗaɗa ko ka matsar da zane, za a sake zana layin bisa wuraren da aka ajiye. Ajiyar wurin aiki tana riƙe wuraren. Manhajar tana nuna daƙiƙun da suka wuce da canjin farashi a adadi da kaso.

Buɗe Indicators ka saita yawan sandunan SMA da EMA ga kowane sashe. Idan farashin rufewa sun isa, zane zai nuna ƙimar sandar UTC da aka zaɓa. Saitin yana nan idan an canza kayan aiki, an sake loda shafi ko an dawo da ajiya.

Buɗe Export CSV a ƙarƙashin zane. Sauke sandunan OHLCV don sake shigarwa, ko haɗa tushen bayanai da matsakaitan motsi da aka kunna don bincike. Ƙimar matsakaici tana zama babu komai har sai farashin rufewa sun isa.

Zaɓi Close line a kowane sashe. Layin yana amfani da farashin rufewa da aka samu kuma yana nuna yawa da alamomin da aka kunna. Sandar UTC da babu ita ba ta nuna manuniya mai haɗi. Ajiyar wurin aiki tana riƙe nau'ikan zane.

Zaɓi OHLC bars. Layi a tsaye yana nuna mafi sama da mafi ƙasa, alamar hagu farashin buɗewa, alamar dama kuma farashin rufewa. Kowane sashe yana riƙe nau'in zanensa kuma manuniyar haɗi tana bin ainihin sandar UTC.

Buɗe Timeframe a kowane sashe ka shigar da tazarar tushe da ta manufa a daƙiƙu. Zane da CSV na bincike suna nuna sandunan da aka samu. Ajiyar tana riƙe jerin asali.

Ƙara CSV na kalanda a Timeframe. Ana fara ƙirga lokutan daga buɗe kowane zama, kuma na ƙarshe yana ƙarewa a lokacin rufewa da aka rubuta. CSV na bincike yana adana kalanda da yawan sandunan tushe.

Buɗe Recorded tick bars ka zaɓi adadin ciniki da lokacin iyakar lura. Zane yana bin jerin rikodi idan lokaci ɗaya ne, yana nuna sandunan da ba su cika ba, kuma yana fitar da ainihin lambobin jeri.

A Portfolio replay loda misalin rabon riba ko ƙara CSV. Binciken yana amfani da hannun jari kafin ranar ex, yana lissafa kuɗi ranar biya, kuma yana amfani da gyara lokacin da aka lura da shi.

Bayan loda farashi, buɗe Relative returns a Universe screen. Zaɓi ID na jeri biyu da takamaiman lokacin tushe na UTC. Canja iyakokin lokaci don ganin farashin rufewa da ya ɓace da gyare-gyare, sannan sauke cikakken kwatancin a CSV.

Buɗe Recorded market depth sannan ka loda CSV na zurfin kasuwa ga kayan cinikin da aka zaɓa. Bi lokutan lura don ganin matakan saye da sayarwa, giɓi a jere, da komawa aiki da sabon hoton kundin oda. Sauke duk matakan a CSV.

Buɗe Recorded footprint ka loda cinikayyar kayan da aka zaɓa. Saita lokacin aiwatarwa da iyakar lura don ganin yawan saye, sayarwa da wanda ba a sani ba a kowane zangon farashi. Sauke cikakken sawu da bambancin tarawa a CSV.

Bayan gudanar da tambaya a Recorded footprint, buɗe Price profiles. Kwatanta yawa a kowane zangon farashi da adadin lokutan da aka yi ciniki a zangon. Saita burin yankin ƙima sannan sauke cikakkun bayanan a CSV.

Buɗe Rolling risk ƙarƙashin Relative returns. Saita tazarar UTC, tsawon taga da ma'aunin sauyin farashi don ganin ribar da ake da ita a kowane jeri da adadin samfurin da aka haɗa. Sauke cikakken binciken a CSV.

Bayan loda farashi a Universe screen, buɗe Correlated portfolio scenarios. Saita nauyin jeri, iri da kuɗin sake daidaitawa. Duba cikakkun bayanan riba da kason hanyoyi, sannan sauke kowace hanya a CSV.

A Universe screen, buɗe Cross-sectional paper replay ka ɗora rahoton liquidity. Saita lokacin shawara na farko da tsarin jeri. Duba abin da aka zaɓa, umarni, kuɗin hannu da jimillar ciniki ko sauke dukan tarihin a CSV.

A Cross-sectional paper replay, buɗe Corporate cash reports ka ɗora fayilolin CSV. Duba hannun jarin da ya cancanta, gyaran biyan kuɗi, matsayin da aka dawo da shi da rasit. Sauke tarihin kuɗi a CSV.

A Bar backtest, buɗe Recorded trade execution ka ɗora CSV na ciniki. Saita iyakar lokuta biyu don duba cika wani ɓangare, ainihin lambar rikodi, kuɗi da ƙimar asusu. Sauke cikakken tarihin a CSV.

Bayan kunna tarihin jeri, buɗe Cross-sectional walk-forward. Kwatanta tsawon lokacin dubawa da yawan kadarori. Duba sakamakon gwaje-gwaje daban-daban da ƙimar da ta ɓace, sannan fitar da maki da tushe a CSV.

Zaɓi jadawali ka buɗe Time-series formulas. Saka dabarar OHLCV da iyakar lokacin lura. Duba ainihin ƙimomi da layukan da suka rasa ƙima, sannan fitar da dabara, tushe, sigar harshe da sakamako a CSV.

Ɗora tarihin sandunan farashi ka buɗe Formula paper backtest. Saita dabarun shiga da fita da iyakokin lokaci biyu. Kwatanta cikar umarni ta ƙarar sanduna da cinikin da aka rubuta, sannan fitar da rasit a CSV.

Sauke kunshin dabara daga gwajin da aka karɓa. Ɗora shi a wani wurin aiki don dawo da dabarun biyu, hanyar aiwatarwa da saitunan asusun gwaji. Yi amfani da bayanai da iyakokin lokaci iri ɗaya don maimaita sakamakon.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Fibonacci time zones](../chart-workspace.md#fibonacci-time-zones) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

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
