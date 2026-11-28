<!-- MarketWeft README · locale=de -->

# MarketWeft

**0.296.0 · 0BSD**

**Sprachen der Dokumentation**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · **Deutsch** · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Was MarketWeft bietet

MarketWeft ist ein lokal arbeitendes Rechercheterminal für Analysten, Entwickler und Betreiber. Es öffnet berechtigte OHLCV-Dateien, zeichnet Kerzen und Volumen, berechnet SMA und EMA in Festkommaarithmetik und speichert Beobachtungsliste, Instrument und Indikatoren in IndexedDB. Nach dem Zwischenspeichern der Anwendung funktioniert es offline. Die mitgelieferten Kurse und Volumina sind synthetisch und brauchen kein Konto.

MarketWeft 0.296.0 ergänzt ein Diagramm für die Dauer unter dem Höchststand mit ganzen UTC-Sekunden, exakten Höchstkursen und getrennten Stichtagen. MarketWeft 0.7.0 ergänzt eine historische Rangliste nach Kursrendite anhand der zum Abfragezeitpunkt bekannten Daten. Die sitzungsbasierte Wiedergabe umfasst Aktiensplits, Bardividenden, Indexzugehörigkeit und Delistings. Das Repository enthält außerdem einen schreibgeschützten TypeScript-Beobachter für den getrennten Dienst trading-bot sowie eine experimentelle Tauri-Hülle. Datenfeeds, Orderaufgabe, signierte Installationspakete und Mehrbenutzer-Hosting stehen weiter auf der Roadmap.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md) · [Time Underwater](../chart-workspace.md#time-underwater) · [Equity target research SDKs](../portfolio-replay.md#equity-target-research-sdks)

<!-- section:02 -->
## Portables Terminal starten

Laden Sie browser-terminal-attempt-N aus einem erfolgreichen GitHub-Lauf herunter. Entpacken Sie MarketWeft-browser-0.296.0.zip, lassen Sie dist/ neben serve-terminal.mjs und führen Sie dort den Befehl aus. Öffnen Sie http://127.0.0.1:4173/ in einem aktuellen Browser mit WebAssembly, Canvas, BigInt und IndexedDB. Der Starter benötigt Node.js ab 22.12 und keine npm-Installation. Warten Sie vor dem Trennen auf Offline ready.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md) · [Linux native verification](../../docs/platforms.md#linux-native-verification) · [Ubuntu desktop package](../../docs/platforms.md#ubuntu-desktop-package) · [Ubuntu upgrade verification](../../docs/platforms.md#verify-an-ubuntu-package-upgrade) · [Ubuntu package provenance](../../docs/platforms.md#verify-ubuntu-package-provenance)

<!-- section:03 -->
## NYSE-Beispiel wiedergeben

Öffnen Sie Historical replay und Start demo. Next event und Previous event schalten vor und zurück, Play und Pause steuern den Lauf und Reset leert den sichtbaren Verlauf. Eine Kerze erscheint am Ende ihres Intervalls. Event time nennt den Beginn oder die Sitzungsgrenze. Observed at nennt die Verfügbarkeit. Die Geschwindigkeit beeinflusst nur den Anzeigetakt.

Die Öffnung verschiebt sich von 13:30 UTC (UTC−04:00) am 31.10.2025 auf 14:30 UTC (UTC−05:00) am 03.11. Das Fehlen des Intervalls ab 15:00 wird um 15:30 sichtbar. Thanksgiving erzeugt keine Intervalle. Am 28.11. schließt die Sitzung um 18:00 UTC nach sieben 30-Minuten-Kerzen. Der Beispieldatensatz umfasst 20 Sitzungen, 253 Kerzen und 294 Ereignisse mit synthetischen Daten und öffentlichen NYSE-Zeiten.

Öffnen Sie Historical replay → Start split demo und wechseln Sie bei demselben Ereignis unter Price basis zwischen Raw und Split-adjusted. Der 2:1-Split wird vor seinem Wirksamwerden angekündigt und beobachtet. Bis dahin stimmen die Ansichten überein. Bei Wirksamwerden sinkt der letzte Schlusskurs vor dem Split von 106.50 roh auf 53.25 bereinigt und das Volumen verdoppelt sich. Die erste Kerze danach bleibt bei 53.00. Laden Sie für eigene Daten die Corporate actions CSV des Instruments und den Sitzungskalender hoch und bestätigen Sie unbereinigtes OHLCV. Das zuletzt beobachtete Verhältnis gilt ab Wirksamkeit. Späte Meldungen und Korrekturen ändern die Ansicht ab ihrer Beobachtung. Die Originalhistorie bleibt erhalten.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Öffnen Sie Historical replay → Start dividend demo für 100 berechtigte Aktien je Ausschüttung. Am Ex-Tag entsteht eine Forderung über USD 25.00. Die Betragsrevision erhöht sie auf USD 30.00, der geänderte Zahltag verschiebt die Gutschrift. Ein verspäteter Bericht schreibt bei Beobachtung EUR 10.00 gut. Eine spätere Korrektur belässt USD 28.00. Gehen Sie für frühere Salden zurück. Laden Sie für eigene Daten Cash dividends CSV hoch und geben Sie Entitled shares per distribution an. Verwenden Sie bei Revisionen dieselbe Ausschüttungs-ID. Das Journal trennt Währungen und erhält alte Buchungen und Quellpreise.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Öffnen Sie Historical replay → Open universe replay → Start universe demo. Um 14:05 UTC gehört nur ALFA zum Universum, um 14:10 kommt BETA hinzu. Der Ausschluss von ALFA um 14:20 wird um 14:25 bekannt. BETAs Dekotierung um 14:30 wird um 14:35 bekannt. Gehen Sie für frühere Mitglieder zurück oder fragen Sie getrennte Effective time und Known time ab. Laden Sie Ihre Universe membership CSV. Behalten Sie die Änderungs-ID bei Revisionen bei und vergeben Sie neue Listing-IDs bei Wiederverwendung eines Symbols.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Wähle in Universe screen die Option Load demo prices und behalte 14:00 UTC als Basiszeit. Um 14:05 führt ALFA mit 1%. BETA tritt um 14:10 bei und bleibt ohne Rang, bis sein Schlusskurs um 14:12 bekannt wird. Frage für 14:10 als Gültigkeitszeit nacheinander die Kenntnisstände 14:12 und 14:16 ab. BETAs Rendite ändert sich von 12% auf 1%. Für die Gültigkeitszeit 14:20 entfällt ALFA, sobald die Entfernung um 14:25 bekannt ist. Lade eigene zeitgenaue Schlusskurse per Universe prices CSV mit Listing-ID. Fehlt ein Basis- oder Zielkurs, bleibt das Mitglied ohne Rang.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

Lade die Demokurse und wähle Load demo sectors in Sector heatmap. Um 14:10 UTC sind 60% des bekannten Gewichts abgedeckt. Sobald BETAs Kurs um 14:12 bekannt wird, steigt die Abdeckung auf 100% und der beobachtete Beitrag von 1,2% auf 6%. Die Korrektur um 14:16 verschiebt BETA von Financials nach Technology. Öffne eine Kachel für Rang, Beitrag und Klassifizierungszeiten. Lade eigene Daten als Sector and weight CSV.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Öffne Historical replay → Open financial statements → Start financial demo. Original filing zeigt ein KGV von 10×. Zum selben Bewertungszeitpunkt erhöht Restatement observed das KGV auf 15× und zeigt fehlendes Stammaktionärskapital. Revised capitalization erhöht es auf 20×. Lade Annual filings CSV und optional Capitalization CSV für deine Emittenten und Kenntnisstichtage.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Öffne Historical replay → Open economic calendar → Start calendar demo. Vor der Veröffentlichung steht die Prognose bei 2,5%, der Istwert fehlt. Actual observed zeigt um 14:32 UTC 2,7%. Revised actual zeigt 2,8%. Beide Revisionen stehen unter Release evidence. Lade für eigene datierte Meldungen eine Macro calendar CSV.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Öffne Historical replay → Open option chain → Start option demo. Das April-Paar mit Ausübungspreis 100 startet bei rund 20% IV. Late option quote zeigt den Call mit Ausübungspreis 90 bei 25% IV. Corrected spread stellt die Bewertung eines Puts wieder her. Implied volatility surface vergleicht Laufzeiten. Lade Underlying CSV und Option quotes CSV für eigene Kurse.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Öffne Historical replay → Open replay alerts → Start alert demo. First crossing zeigt einen Schwellenalarm. Correction observed zeigt den korrigierten Messwert und die Kreuzung des gleitenden Durchschnitts. Full alert replay zeigt acht Alarme. Zweimal Save to alert inbox speichert zuerst acht und dann null neue Einträge. Lade Alert rules CSV und Alert observations CSV für eigene Daten.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Öffne Historical replay → Open paper ledger → Start paper demo. Gehe von der Barreserve 503 zur einmaligen Teilausführung, die 801,6 belässt. Final account zeigt nach dem Halt 663,7 Bargeld und 13 realisierten Gewinn. Lade Paper events CSV für eigene simulierte Aufträge und Ausführungen.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Öffne Historical replay → Open bar backtest → Start backtest demo. Um 14:05 UTC erzeugt das Signal einen Kaufauftrag. Das fehlende Intervall 14:06 lässt ihn offen. Der Schlusskurs um 14:07 ermöglicht zwei Stück. Final backtest zeigt Kapital von 957,8. Lade Sitzungs- und Balken-CSV für eigene Daten.

Starte in der Backtest-Demo Walk-forward validation mit sechs Trainingsbalken und zwei Testbalken. Das erste vollständige Fenster erscheint um 14:09 UTC. Das Paar 1:2 gewinnt im Training und bleibt auf beiden Testbalken unverändert. Jeder Test startet mit einem neuen Konto.

Führe in der Backtest-Demo Seeded scenarios mit Startwert 20250403, 256 Pfaden und acht Bewegungen je Pfad aus. Das Endkapital der Referenz beträgt 957,8 und der Median der Szenarien 997,6. Dieselbe Beobachtungsgrenze, dieselben Daten und derselbe Startwert ergeben dieselbe Risikotabelle.

Lade in der Universumsdemo Delisting proceeds für BETA-001 und setze beide Zeitgrenzen auf 14:35 UTC. Der Erlös ist noch unbekannt. Um 14:37 ergeben zehn Aktien eine Forderung von 70 USD, die um 14:50 gebucht wird. Spätere Korrekturen lassen frühere Ansichten bestehen und halten BETA-002 getrennt.

Öffne Start split revisions demo und wähle Split-adjusted. Am 3. Juni um 14:10 UTC hebt die Zeitrevision die bisherige Anpassung auf. Um 14:20 werden zwei Faktoren kombiniert. Die Stornierung von SPLIT-A um 14:30 lässt SPLIT-B wirksam und die Rohkerzen unverändert.

Öffne Start dividend entitlement demo. ALPHA beginnt mit 100 berechtigten Aktien und steigt nach einem verspäteten Bericht auf 120. BETA verwendet 40 Aktien. Eine spätere Korrektur auf 110 ALPHA-Aktien bucht nach der Zahlung 3 USD zurück. Spule zum früheren Saldo zurück.

Lade in der Universumsdemo Portfolio replay. Der Schlusskurs von BETA-001 um 14:10 UTC ist ab 14:12 bekannt. Um 14:45 steht seine Forderung von 70 USD getrennt von den 225 EUR Aktienwert von BETA-002. Um 14:50 betragen Aktienwert und Delisting-Zahlung zusammen 284 USD.

Wähle Compare charts und anschließend ein Vergleichsinstrument. Link by UTC markiert in beiden Fenstern denselben sichtbaren Zeitstempel. Zoome beide Fenster unabhängig. Das Workspace-Backup sichert Instrumente, Indikatoren und Verknüpfung.

Wähle Draw measurement und für jeden Endpunkt eine vorhandene UTC-Kerze und einen Preis. Beim Zoomen und Verschieben zeichnet das Diagramm die Linie anhand derselben Koordinaten neu. Das Workspace-Backup sichert die Koordinaten. Die App zeigt die Zeitdifferenz in Sekunden sowie die absolute und prozentuale Preisänderung.

Öffne Indicators und stelle die SMA- und EMA-Perioden jedes Fensters in Kerzen ein. Sobald ausreichend Schlusskurse vorliegen, zeigt das Diagramm die Werte für die ausgewählte UTC-Kerze. Die Perioden bleiben beim Instrumentwechsel, Neuladen und Wiederherstellen erhalten.

Öffne Export CSV unter einem Diagramm. Lade OHLCV-Kerzen für den erneuten Import herunter oder füge Herkunft und aktive gleitende Durchschnitte zur Analyse hinzu. Die Durchschnittswerte bleiben leer, bis ausreichend Schlusskurse vorliegen.

Wähle Close line in der Typauswahl eines Fensters. Die Linie verwendet beobachtete Schlusskurse und zeigt weiterhin Volumen und aktive Indikatoren. Für eine fehlende UTC-Kerze erscheint kein verknüpftes Fadenkreuz. Das Backup speichert die Diagrammtypen.

Wähle OHLC bars. Der senkrechte Strich zeigt Hoch und Tief, die linke Markierung den Eröffnungskurs und die rechte den Schlusskurs. Jedes Fenster behält seinen Typ, und das verknüpfte Fadenkreuz folgt exakt den UTC-Balken.

Öffne Timeframe in einem Fenster und gib Quell- und Zielintervall in Sekunden ein. Diagramm und Analyse-CSV zeigen die beobachtete Abdeckung. Das Backup bewahrt die Originalreihe.

Füge in Timeframe eine Sitzungs-CSV hinzu. Die Intervalle richten sich nach der Eröffnung jeder Sitzung. Das letzte endet zum angegebenen Schluss. Die Analyse-CSV erfasst den Kalender und die Abdeckung durch Quelldaten.

Öffne Recorded tick bars und wähle die Anzahl der Geschäfte sowie den Beobachtungsschluss. Das Diagramm erhält bei gleichen Zeitstempeln die Erfassungsreihenfolge, markiert unvollständige Balken und exportiert exakte Sequenzgrenzen.

Lade in Portfolio replay das Dividendenbeispiel oder füge eine CSV hinzu. Die Abfrage verwendet Bestände vor dem Ex-Tag, verbucht am Zahlungstag und übernimmt Korrekturen zum Beobachtungszeitpunkt.

Öffne nach dem Laden der Kurse Relative returns unter Universe screen. Wähle zwei Listing-IDs und eine genaue UTC-Basiszeit. Wechsle die Abfragezeitpunkte, um fehlende Schlusskurse und Korrekturen nachzuvollziehen, und lade den vollständigen Vergleich als CSV herunter.

Öffne Recorded market depth und lade eine Markttiefe-CSV für das gewählte Instrument. Gehe die Beobachtungszeitpunkte durch, um Geld- und Briefstufen, eine Sequenzlücke und die Wiederherstellung beim nächsten Snapshot zu sehen. Lade alle Stufen als CSV herunter.

Öffne Recorded footprint und lade die Trades des gewählten Instruments. Lege Ausführungsfenster und Beobachtungsstichtag fest, um Kaufvolumen, Verkaufsvolumen und unbekanntes Volumen je Preisbereich zu prüfen. Lade den vollständigen Footprint und das kumulative Delta als CSV herunter.

Öffne nach einer Abfrage in Recorded footprint den Bereich Price profiles. Vergleiche das Volumen je Preisbereich mit der Zahl der Zeitabschnitte, in denen dort Trades stattfanden. Lege das Ziel der Value Area fest und lade die vollständigen Profile als CSV herunter.

Öffne Rolling risk unter Relative returns. Lege UTC-Intervall, Fensterlänge und Volatilitätsskalierung fest, um verfügbare Renditen je Listing und die Anzahl der Renditepaare zu prüfen. Lade die vollständige Studie als CSV herunter.

Öffne nach dem Laden der Kurse Correlated portfolio scenarios unter Universe screen. Setze Listing-Gewichte, Startwert des Zufallsgenerators und Umschichtungsgebühr. Prüfe vollständige Renditebeobachtungen und Perzentile und lade alle Pfade als CSV herunter.

Öffnen Sie in Universe screen den Bereich Cross-sectional paper replay und laden Sie einen Liquiditätsbericht. Legen Sie die erste Entscheidung und die Rangfolge fest. Prüfen Sie Auswahl, Aufträge, Bargeld und Umsatz oder laden Sie den gesamten Ablauf als CSV herunter.

Öffnen Sie in Cross-sectional paper replay den Bereich Corporate cash reports und laden Sie die passenden CSV-Dateien. Prüfen Sie Ansprüche, Zahlungskorrekturen, wiederhergestellte Positionen und Belege. Laden Sie das Zahlungsjournal als CSV herunter.

Öffnen Sie in Bar backtest den Bereich Recorded trade execution und laden Sie eine Trade-CSV. Stellen Sie beide Stichtage ein und prüfen Sie verzögerte Teilausführungen, exakte Sequenzen, Bargeld und Portfoliowert. Laden Sie den gesamten Verlauf als CSV herunter.

Öffnen Sie nach dem Ranking-Replay Cross-sectional walk-forward. Vergleichen Sie Rückblick und Titelanzahl, prüfen Sie getrennte Tests und fehlende Bewertungen und exportieren Sie Ergebnisse und Quellen als CSV.

Wählen Sie einen Chart und öffnen Sie Time-series formulas. Geben Sie einen OHLCV-Ausdruck und einen Beobachtungsstichtag ein. Prüfen Sie genaue Werte und Lücken und exportieren Sie Formel, Quelle, Sprachversion und Ergebnisse als CSV.

Laden Sie den Kursverlauf und öffnen Sie Formula paper backtest. Stellen Sie beide Ausdrücke und Stichtage ein. Vergleichen Sie Volumen- mit Trade-Ausführungen, prüfen Sie fehlende Signale und exportieren Sie die Belege als CSV.

Laden Sie das Paket aus einem erfolgreichen Formel-Backtest herunter. Importieren Sie es in einen anderen Arbeitsbereich, um beide Formeln, den Ausführungsmodus und die genauen Kontoeinstellungen wiederherzustellen. Verwenden Sie dieselben Daten und Stichtage.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Fibonacci time zones](../chart-workspace.md#fibonacci-time-zones) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

<!-- section:04 -->
## Eigene Daten importieren und abspielen

Wählen Sie Import CSV, geben Sie Handelsplatz und Symbol ein und öffnen Sie eine zulässige OHLCV-Datei in UTF-8. Nutzen Sie streng steigende Unix-Sekunden, UTC-Daten oder UTC-Zeitstempel mit Z. Werte haben höchstens sechs Nachkommastellen. Volumen ist nichtnegativ und Hoch und Tief umfassen Öffnung und Schluss. Eine ungültige Zeile verhindert den Import. Series details erfasst Intervall, Quelle, Nutzungsrecht und Anpassungsmethode.

Kennzeichnen Sie jede Kerze mit dem Intervallbeginn. Wählen Sie in Historical replay das Instrument und einen Kalender als CSV, dann ganze Intervallsekunden (1–86.400). Geben Sie exakte UTC-Grenzen, den Versatz bei der Öffnung in Minuten und regular oder early an. Das Raster beginnt an der Öffnung, der letzte Abschnitt endet spätestens am Schluss. Unpassende Kerzen werden abgelehnt. Eine Lücke bewegt die Uhr und belässt die letzten Werte.

Standard sind 1.500.000 Bytes und 100.000 Kerzen pro Datei. Die Build-Konfiguration erlaubt bis zu 8 MiB und 100.000 Zeilen. Der Kalender unterstützt 1 MiB, 10.000 getrennte Segmente und 200.000 Ereignisse. Browserspeicherquoten gelten zusätzlich.

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
## Sichern, migrieren und wiederherstellen

Workspace backup → Export workspace speichert versioniertes JSON mit Original-CSV, Herkunft, sichtbaren und ausgeblendeten Historien, Liste, Auswahl und Indikatoren. Wählen Sie im Zielprofil Backup file, prüfen Sie die Summen und klicken Sie Restore workspace. Eine Transaktion ersetzt den Zielkatalog. Exportieren Sie den Zielbestand zuvor, falls er benötigt wird.

Behalten Sie Schema, Host, Port und Profil beim Upgrade bei. Die Migration von 0.1.0 nach IndexedDB überprüft die gespeicherten Daten und erhält den ursprünglichen Wert. Schließen Sie alte Tabs. Die Sicherung ist Klartext. SHA-256 prüft die Integrität. Die Datennutzungsrechte bestimmen Aufbewahrung und Zugriff.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Architektur und Rechenregeln

Rust validiert Identität, UTC und OHLCV, rechnet in ganzzahligen Millionsteln und erstellt den Sitzungsplan. Das React-Terminal nutzt denselben Kern als Wasm, Canvas für Diagramme, IndexedDB für Transaktionen und einen Service Worker für statische Dateien. Revisionen erkennen konkurrierende Änderungen. Der Zustand gehört zu Profil und Origin.

SMA benutzt eine exakte rollende Summe. EMA startet mit dem ersten vollen Fenster und rundet jeden Wert auf ein Millionstel, bei halben Werten von null weg. Die Wiedergabe nutzt nur beobachtete Schlusswerte. Das geplante Intervallende bestimmt die Verfügbarkeit. Provider-Ankunft, Revisionen und Zeiten innerhalb der Kerze benötigen getrennte Daten. Quellzeilen bleiben erhalten.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Bereitstellung und Betriebsumfang

Stellen Sie dist/ über HTTPS oder den Loopback-Starter bereit. Derselbe Origin erhält den Arbeitsbereich. Andere Ports, Profile oder private Fenster nutzen einen eigenen Speicher. Für Tauri bauen Sie zuerst das Terminal und installieren die Systemvoraussetzungen. CI baut auf Windows Server 2022, macOS 15 und Ubuntu 24.04 und öffnet das Linux-Fenster. Die Matrix nennt Mobilgeräte, ARM und BSD. Für Akzeptanztests nutzen Sie Desktop-Chromium.

Aktuell ist ein lokaler Nutzer pro Profil vorgesehen. Speichern Sie Daten auf zugelassenen Geräten. Anmeldung, Mandantentrennung, Überwachung, Aufbewahrung und Wiederherstellung benötigen eine geprüfte Betriebsarchitektur. Der ZIP enthält Lizenzhinweise und eine CycloneDX-SBOM. Passende Versions-Tags aktivieren eine Attestierung.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Externen Dienst abfragen

TradingBotObserverV1 liest runtime, status, account und portfolio aus einem separat eingerichteten trading-bot. Nutzen Sie einen vertrauenswürdigen Origin, HTTPS außerhalb von Loopback und ein berechtigtes Token aus der Prozesskonfiguration. Jede Beobachtung hat ihre eigene Zeit. Ein leerer Datensatz oder gesunder Dienst belegt keine weiteren Salden oder Positionen. Zugangsdaten, Aufträge und Ausführung liegen beim externen Dienst.

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
## Aus dem Quellcode bauen und prüfen

Benötigt werden Node.js ab 22.12 mit npm, Rustup gemäß rust-toolchain.toml und Python ab 3.11. Starten Sie im Projektstamm. Vite nennt die Entwicklungsadresse, meist Port 5173. Die Produktionsversion nutzt 4173. Installieren Sie vor den Tests das festgelegte Chromium.

Geprüft werden Rust, Wasm, Browser, SDK, lokaler Server, Lizenzen, SBOM und Sicherheitshinweise. Beide gleitenden Durchschnitte gleichen an jedem Ereignis dem passenden Batch-Präfix, auch bei Zeitwechsel, Lücke und frühem Schluss. CI wartet auf die genaue Artefakt-ID und vergleicht die heruntergeladenen Bytes. Attestierung erfolgt bei passenden Versions-Tags.

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
## Fehler untersuchen und reproduzieren

Ist der Port belegt, verwenden Sie --port 4174. Übertragen Sie Daten mit Export und Wiederherstellung. Öffnen Sie bei Offline-Problemen zuerst den Produktionsbuild mit Netz und warten Sie auf Offline ready. Bei einer Ablehnung prüfen Sie die Meldungszeile, den Beginn der Kerze und den Kalender für Markt und Datum.

Bewahren Sie CSV, Kalender, Intervall, Git-Revision, Browserversion und Zeit des Ereignisses auf. Melden Sie den ersten Fehlschritt mit einem synthetischen Beispiel. Der Prüfbericht enthält Plattformnachweise und die Roadmap die nächsten Ziele.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Repository, Beiträge und Lizenz

Kern und Fixtures liegen in crates/core, Terminal und Tests in apps/terminal, Tauri in apps/desktop, SDK in packages/trading-bot und Werkzeuge in scripts. Halten Sie Änderungen klein und getestet. Wahren Sie Datenrechte und Hinweise, aktualisieren Sie das Abhängigkeitsinventar und melden Sie Sicherheitslücken vertraulich.

Der Originalcode steht unter 0BSD. Abhängigkeiten behalten ihre Lizenzen. Die vollständigen Ausgaben basieren auf Ethnologue 2026 nach Erst- und Zweitsprachlern und schließen beide gerundet auf Platz 20 liegenden Sprachen ein. Verlinkte Handbücher und die Oberfläche können Englisch verwenden.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
