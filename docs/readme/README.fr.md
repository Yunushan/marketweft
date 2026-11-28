<!-- MarketWeft README · locale=fr -->

# MarketWeft

**0.295.0 · 0BSD**

**Langues de la documentation**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · **Français** · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Fonctionnement de MarketWeft

MarketWeft est un terminal de recherche local destiné aux analystes, développeurs et opérateurs. Il ouvre des fichiers OHLCV autorisés, trace des chandeliers et les volumes, calcule SMA et EMA en virgule fixe et enregistre liste, instrument et indicateurs dans IndexedDB. Les ressources mises en cache permettent de travailler hors ligne. Les cours et volumes fournis sont synthétiques et ne nécessitent aucun compte.

MarketWeft 0.295.0 rejoue les étoiles du matin, du soir et doji à la clôture exacte de la troisième bougie, avec les trois bougies dans l’alerte. MarketWeft 0.7.0 ajoute un classement de l’univers par rendement du prix à partir des données connues à la date de consultation. Le rejeu par séance inclut les divisions d’actions, les dividendes en espèces, la composition de l’univers et les radiations. Le dépôt fournit également un observateur TypeScript en lecture seule pour le service distinct trading-bot et une enveloppe Tauri expérimentale. Les flux de fournisseurs, la saisie d’ordres, les installateurs signés et l’hébergement multiutilisateur restent dans la feuille de route.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md) · [Morning and Evening Stars](../candlestick-patterns.md#morning-and-evening-stars) · [Equity target research SDKs](../portfolio-replay.md#equity-target-research-sdks)

<!-- section:02 -->
## Démarrer le terminal portable

Téléchargez browser-terminal-attempt-N depuis une vérification GitHub réussie et extrayez MarketWeft-browser-0.295.0.zip. Conservez dist/ à côté de serve-terminal.mjs et exécutez la commande ci-dessous dans ce répertoire. Ouvrez http://127.0.0.1:4173/ avec un navigateur récent offrant WebAssembly, Canvas, BigInt et IndexedDB. Le lanceur exige Node.js 22.12 ou supérieur. Aucune installation npm n’est nécessaire. Attendez Offline ready avant la déconnexion.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md) · [Linux native verification](../../docs/platforms.md#linux-native-verification) · [Ubuntu desktop package](../../docs/platforms.md#ubuntu-desktop-package) · [Ubuntu upgrade verification](../../docs/platforms.md#verify-an-ubuntu-package-upgrade) · [Ubuntu package provenance](../../docs/platforms.md#verify-ubuntu-package-provenance)

<!-- section:03 -->
## Relire l’exemple du NYSE

Ouvrez Historical replay puis Start demo. Next event avance d’un événement, Previous event recule, Play et Pause gèrent la lecture et Reset efface l’historique visible. Le graphique est vide au départ. Chaque bougie apparaît à la fin de son intervalle. Event time indique son début ou la borne de séance. Observed at indique la disponibilité. La vitesse agit uniquement sur l’affichage.

L’ouverture passe de 13:30 UTC (UTC−04:00) le 31 octobre 2025 à 14:30 UTC (UTC−05:00) le 3 novembre. L’absence de la bougie de 15:00 est signalée à 15:30. Thanksgiving n’émet aucun créneau. Le 28 novembre ferme à 18:00 UTC après sept bougies de 30 minutes. Les 20 séances, 253 bougies et 294 événements s’appuient sur des valeurs synthétiques et les horaires publics du NYSE.

Ouvrez Historical replay → Start split demo et basculez Price basis entre Raw et Split-adjusted au même événement. La division de 2 pour 1 est annoncée et observée avant sa prise d’effet. Les vues coïncident jusque-là. À la prise d’effet, la dernière clôture antérieure passe de 106.50 en brut à 53.25 ajustée et le volume double. La première bougie suivante conserve 53.00. Pour vos données, chargez le Corporate actions CSV de l’instrument, confirmez l’OHLCV brut et fournissez le calendrier de séance. Le dernier ratio observé s’applique dès sa prise d’effet. Les rapports tardifs et corrections agissent à partir de leur observation. L’historique source reste intact.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Ouvrez Historical replay → Start dividend demo pour suivre 100 actions éligibles par distribution. Le détachement crée une créance de USD 25.00. Une révision la porte à USD 30.00 et la date de paiement révisée décale le crédit. Un rapport tardif crédite EUR 10.00 à son observation. Une correction après paiement ramène les espèces à USD 28.00. Revenez en arrière pour voir les soldes antérieurs. Importez Cash dividends CSV pour vos données et saisissez Entitled shares per distribution. Gardez le même ID de distribution dans les révisions. Le registre sépare les devises et conserve les écritures passées et les cours sources.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Ouvrez Historical replay → Open universe replay → Start universe demo. À 14:05 UTC, seul ALFA est membre. BETA entre à 14:10. Le retrait d’ALFA à 14:20 est connu à 14:25. La radiation de BETA à 14:30 est connue à 14:35. Revenez en arrière ou lancez une requête avec Effective time et Known time indépendants. Importez votre Universe membership CSV. Conservez les identifiants de changement lors des révisions et utilisez un nouvel identifiant de cotation lorsqu’un symbole est réutilisé.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Dans Universe screen, choisissez Load demo prices et gardez la référence de 14:00 UTC. À 14:05, ALFA mène avec 1%. BETA entre à 14:10 et reste sans rang jusqu’à la publication de son cours à 14:12. Interrogez l’heure effective de 14:10 avec les heures de connaissance 14:12 puis 14:16 pour comparer le rendement de BETA de 12% à sa valeur révisée de 1%. À l’heure effective de 14:20, ALFA sort lorsque son retrait est connu à 14:25. Importez un Universe prices CSV par identifiant de cotation pour utiliser vos cours de clôture. Un cours de départ ou d’arrivée manquant laisse le membre sans rang.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

Après avoir chargé les cours de démonstration, choisissez Load demo sectors dans Sector heatmap. À 14:10 UTC, la carte couvre 60% du poids connu. Lorsque le cours de BETA est connu à 14:12, la couverture atteint 100% et la contribution observée passe de 1,2% à 6%. À 14:16, la révision fait passer BETA de Financials à Technology. Ouvrez une tuile pour consulter le rang, la contribution et les horodatages. Importez un Sector and weight CSV pour vos données.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Ouvrez Historical replay → Open financial statements → Start financial demo. Original filing affiche un P/E de 10×. Au même instant de valorisation, Restatement observed affiche 15× et des capitaux propres ordinaires manquants. Revised capitalization porte le P/E à 20×. Importez Annual filings CSV et, éventuellement, Capitalization CSV pour interroger votre émetteur à l’heure de connaissance voulue.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Ouvrez Historical replay → Open economic calendar → Start calendar demo. Avant publication, la prévision est de 2,5% et la valeur réelle est absente. Actual observed affiche 2,7% à 14:32 UTC. Revised actual affiche 2,8%, avec les deux révisions dans Release evidence. Importez un Macro calendar CSV pour utiliser vos publications datées.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Ouvrez Historical replay → Open option chain → Start option demo. La paire d’avril de prix d’exercice 100 débute à près de 20% de volatilité implicite. Late option quote révèle le call de prix d’exercice 90 à 25%, puis Corrected spread rétablit la valorisation d’un put. Consultez Implied volatility surface pour comparer les échéances. Importez Underlying CSV et Option quotes CSV pour vos données.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Ouvrez Historical replay → Open replay alerts → Start alert demo. First crossing affiche une alerte de seuil. Correction observed montre l’observation corrigée et le franchissement de moyenne mobile. Full alert replay affiche huit alertes. Cliquez deux fois sur Save to alert inbox pour enregistrer huit alertes puis zéro nouvelle. Chargez Alert rules CSV et Alert observations CSV pour vos données.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Ouvrez Historical replay → Open paper ledger → Start paper demo. Avancez de la réserve de 503 à l’exécution partielle unique qui laisse 801,6 en trésorerie. Final account affiche 663,7 et 13 de bénéfice réalisé après l’arrêt. Importez Paper events CSV pour rejouer vos ordres, exécutions et contrôles simulés.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Ouvrez Historical replay → Open bar backtest → Start backtest demo. Le signal de 14:05 UTC place un achat. La barre manquante de 14:06 ne fournit aucune exécution. La clôture de 14:07 permet deux actions. Final backtest affiche des capitaux de 957,8. Chargez les CSV de séances et de barres pour vos données locales.

Dans la démo du backtest, lancez Walk-forward validation avec six barres d’entraînement et deux de test. La première fenêtre complète apparaît à 14:09 UTC. La paire 1:2 est retenue sur l’entraînement et reste fixe pendant les deux barres de test, qui partent d’un compte neuf.

Dans la démo du backtest, lancez Seeded scenarios avec la graine 20250403, 256 trajectoires et huit mouvements par trajectoire. Les capitaux finaux de référence sont de 957,8 et la médiane des scénarios de 997,6. La même date de coupure, les mêmes données et la même graine reproduisent le tableau des risques.

Dans la démo de l’univers, chargez Delisting proceeds pour BETA-001 et placez les deux dates de coupure à 14:35 UTC pour voir le montant indisponible. À 14:37, dix titres donnent une créance de 70 USD, encaissée à 14:50. Les corrections préservent les vues antérieures et BETA-002 reste distinct.

Ouvrez Start split revisions demo et sélectionnez Split-adjusted. Le 3 juin à 14:10 UTC, la révision de la date d’effet retire l’ajustement précédent. À 14:20 les deux coefficients se cumulent. L’annulation de SPLIT-A à 14:30 conserve SPLIT-B et les bougies brutes.

Ouvrez Start dividend entitlement demo. ALPHA passe de 100 à 120 titres ouvrant droit au dividende après une déclaration tardive. BETA utilise 40 titres. Une correction à 110 titres ALPHA entraîne un débit de 3 USD après paiement. Revenez en arrière pour retrouver le solde antérieur.

Dans la démo de l’univers, chargez Portfolio replay. La clôture de BETA-001 à 14:10 UTC apparaît lorsqu’elle est connue à 14:12. À 14:45, sa créance de 70 USD est séparée des 225 EUR en titres BETA-002. À 14:50, les titres et les produits encaissés totalisent 284 USD.

Choisissez Compare charts et sélectionnez un instrument de comparaison. Link by UTC indique le même instant visible dans les deux panneaux. Zoomez dans chacun séparément. La sauvegarde conserve les instruments, les indicateurs superposés et le lien.

Choisissez Draw measurement puis une barre UTC existante et un prix pour chaque extrémité. Au zoom ou au déplacement, le graphique retrace la ligne aux coordonnées enregistrées. La sauvegarde conserve ces coordonnées. L’application affiche la durée en secondes et la variation du prix en valeur et en pourcentage.

Ouvrez Indicators et réglez les périodes SMA et EMA en nombre de barres pour chaque panneau. Le graphique affiche les valeurs de la barre UTC sélectionnée dès que les clôtures sont assez nombreuses. Les périodes sont conservées après un changement d’instrument, un rechargement ou une restauration.

Ouvrez Export CSV sous un graphique. Téléchargez les barres OHLCV pour les réimporter ou incluez leur provenance et les moyennes mobiles actives pour l’analyse. Les moyennes restent vides tant que les clôtures sont insuffisantes.

Choisissez Close line dans le sélecteur de type de chaque panneau. Le tracé utilise les clôtures observées et conserve le volume ainsi que les indicateurs actifs. Une barre UTC absente ne reçoit aucun réticule lié. Les sauvegardes conservent les types choisis.

Choisissez OHLC bars pour voir le plus haut et le plus bas sur un trait vertical, l’ouverture à gauche et la clôture à droite. Chaque panneau conserve son type de graphique et le réticule lié suit les barres UTC exactes.

Ouvrez Timeframe dans un panneau et entrez les intervalles source et cible en secondes. Le graphique et le CSV indiquent la couverture observée. La sauvegarde conserve la série d’origine.

Ajoutez un CSV de séances dans Timeframe. Les intervalles partent de l’ouverture de chaque séance et le dernier s’arrête à la clôture indiquée. Le CSV de recherche conserve le calendrier et la couverture des données sources.

Ouvrez Recorded tick bars et choisissez la taille des groupes ainsi que l’heure de coupure. Le graphique conserve l’ordre de capture à heure égale, signale les barres partielles et exporte leurs numéros de séquence exacts.

Dans Portfolio replay, chargez la démo de dividendes ou ajoutez un CSV. La requête utilise les positions antérieures au détachement, règle à la date de paiement et applique les révisions à leur date d’observation.

Après avoir chargé les cours, ouvrez Relative returns dans Universe screen. Choisissez deux identifiants de cotation et une heure de référence précise en UTC. Ajustez les dates limites de l’univers pour revoir les clôtures manquantes et les révisions, puis téléchargez la comparaison complète en CSV.

Ouvrez Recorded market depth et chargez un CSV de profondeur pour l’instrument sélectionné. Parcourez les dates limites d’observation pour examiner le carnet, un saut de séquence et la reprise au prochain instantané. Téléchargez tous les niveaux en CSV.

Ouvrez Recorded footprint et chargez les transactions de l’instrument sélectionné. Réglez la fenêtre d’exécution et la limite d’observation pour voir les volumes acheteurs, vendeurs et inconnus par tranche de prix. Téléchargez l’empreinte et le delta cumulé en CSV.

Après une requête dans Recorded footprint, ouvrez Price profiles. Comparez le volume par prix avec le nombre d’intervalles où chaque tranche de prix a été négociée. Fixez la cible de la zone de valeur et téléchargez les profils complets en CSV.

Ouvrez Rolling risk sous Relative returns. Réglez l’intervalle UTC, la taille de la fenêtre et l’échelle de volatilité pour examiner les rendements disponibles et le nombre de paires. Téléchargez l’étude glissante complète en CSV.

Dans Universe screen, ouvrez Correlated portfolio scenarios après avoir chargé les cours. Réglez les poids, la graine et les frais de rééquilibrage. Examinez la couverture des rendements complets et les percentiles, puis téléchargez tous les chemins en CSV.

Dans Universe screen, ouvrez Cross-sectional paper replay et chargez un rapport de liquidité. Réglez la première décision et les paramètres de classement, puis consultez la sélection, les ordres, les liquidités et les montants négociés ou téléchargez le replay complet en CSV.

Dans Cross-sectional paper replay, ouvrez Corporate cash reports et chargez les CSV concernés. Relancez la simulation pour consulter les droits, les révisions de paiement, les positions rétablies et les reçus, puis exportez les flux en CSV.

Dans Bar backtest, ouvrez Recorded trade execution et chargez un CSV de transactions. Fixez les dates d’effet et de connaissance pour inspecter les exécutions partielles, les identifiants exacts, la trésorerie et l’actif net. Exportez le journal complet en CSV.

Après le replay de classement, ouvrez Cross-sectional walk-forward. Comparez les horizons et nombres de titres, examinez les tests sans chevauchement et les valorisations manquantes, puis exportez les résultats et leurs sources en CSV.

Sélectionnez un graphique et ouvrez Time-series formulas. Saisissez une expression OHLCV et une date d’observation, vérifiez les valeurs exactes et les lignes indisponibles, puis exportez la formule, la source, la version et les résultats en CSV.

Chargez un historique de barres puis ouvrez Formula paper backtest. Réglez les expressions et les deux dates d’arrêt. Comparez les exécutions par volume de barre et par transactions enregistrées, puis exportez les reçus en CSV.

Téléchargez le paquet d’un backtest accepté. Chargez-le dans un autre espace de travail pour restaurer les deux formules, le mode d’exécution et les réglages exacts. Reproduisez le résultat avec les mêmes données et dates d’arrêt.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [Rank comparison](../../docs/universe-screen.md#compare-ranks-at-two-cutoffs) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [Sector heatmap comparison](../../docs/sector-heatmap.md#compare-heatmaps-at-two-cutoffs) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Rank comparison APIs](../research-universe-screen.md#compare-rank-snapshots) · [Local REST](../local-rest-research.md) · [REST rank comparison](../local-rest-research.md#compare-universe-ranks) · [Rank comparison stream](../local-rest-research.md#stream-rank-comparisons) · [gRPC rank comparison](../local-rest-research.md#rank-comparisons-over-grpc) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md) · [Provider bar withdrawals](../provider-revisions.md#withdraw-and-replace-a-bar) · [Provider replay chart](../provider-revisions.md#provider-replay-chart) · [Signed provider revisions](../provider-revisions.md#load-a-signed-provider-revision-fixture) · [Provider replay CSV](../provider-revisions.md#verify-the-source-and-download-the-replay) · [Quarterly financial filings](../financial-statements.md#quarterly-filings-and-trailing-twelve-months) · [Trailing valuation multiples](../financial-statements.md#choose-a-valuation-basis) · [Native financial snapshots](../../packages/python-research/README.md#financial-snapshots) · [MCP financial snapshots](../local-mcp-research.md#financial-snapshots) · [American exercise pricing](../option-chain.md#american-exercise-pricing) · [American implied volatility](../option-chain.md#american-implied-volatility) · [Discrete cash dividends](../option-chain.md#discrete-cash-dividends) · [Cash-dividend implied volatility](../option-chain.md#cash-dividend-implied-volatility) · [Native option snapshots](../../packages/python-research/README.md#option-chain-snapshots) · [Native American option valuations](../../packages/python-research/README.md#american-option-valuations) · [TypeScript option research](../../packages/research/README.md#option-snapshots-and-american-valuations) · [MCP option snapshots](../local-mcp-research.md#option-chain-snapshots) · [MCP American option valuations](../local-mcp-research.md#american-option-valuations) · [REST option snapshots](../local-rest-research.md#option-chain-snapshots) · [REST American option valuations](../local-rest-research.md#american-option-valuations) · [Option snapshots over WebSocket](../local-rest-research.md#option-snapshots-over-websocket) · [Option snapshots over gRPC](../local-rest-research.md#option-snapshots-over-grpc) · [American valuations over gRPC](../local-rest-research.md#american-valuations-over-grpc) · [Heikin-Ashi charts](../chart-workspace.md#heikin-ashi) · [Renko charts](../chart-workspace.md#renko) · [Three Line Break](../chart-workspace.md#three-line-break) · [Kagi charts](../chart-workspace.md#kagi) · [Point and Figure](../chart-workspace.md#point-and-figure) · [Recorded range bars](../chart-workspace.md#recorded-range-bars) · [Recorded volume bars](../chart-workspace.md#recorded-volume-bars) · [Wilder RSI](../chart-workspace.md#wilder-relative-strength-index) · [Wilder ATR](../chart-workspace.md#wilder-average-true-range) · [Bollinger Bands](../chart-workspace.md#bollinger-bands) · [Bollinger %B and BandWidth](../chart-workspace.md#bollinger-b-and-bandwidth) · [Donchian Channels](../chart-workspace.md#donchian-channels) · [Keltner Channels](../chart-workspace.md#keltner-channels) · [Stochastic Oscillator](../chart-workspace.md#stochastic-oscillator) · [Williams %R](../chart-workspace.md#williams-r) · [MACD](../chart-workspace.md#macd) · [On-Balance Volume and Accumulation/Distribution](../chart-workspace.md#cumulative-volume-studies) · [Chaikin studies](../chart-workspace.md#chaikin-studies) · [MFI and VWMA](../chart-workspace.md#money-flow-index-and-volume-weighted-moving-average) · [Directional Movement System](../chart-workspace.md#directional-movement-system) · [CCI and ROC](../chart-workspace.md#commodity-channel-index-and-rate-of-change) · [Aroon](../chart-workspace.md#aroon-and-aroon-oscillator) · [Price lines and UTC markers](../chart-workspace.md#horizontal-price-lines-and-utc-time-markers) · [Horizontal rays and trend lines](../chart-workspace.md#horizontal-rays-and-trend-lines) · [Rectangles and parallel channels](../chart-workspace.md#rectangles-and-parallel-channels) · [Polylines and Fibonacci retracements](../chart-workspace.md#polylines-and-fibonacci-retracements) · [Fibonacci price extensions](../chart-workspace.md#fibonacci-price-extensions) · [Fibonacci time zones](../chart-workspace.md#fibonacci-time-zones) · [Ellipses and triangles](../chart-workspace.md#ellipses-and-triangles) · [Chart notes and directional arrows](../chart-workspace.md#chart-notes-and-directional-arrows) · [Price and time ranges](../chart-workspace.md#price-and-time-range-highlights) · [Candlestick pattern replay](../candlestick-patterns.md) · [Candlestick pattern alerts](../replay-alerts.md#candlestick-pattern-alerts) · [Signed webhook delivery](../local-webhook-delivery.md) · [Webhook event export](../replay-alerts.md#export-a-webhook-event) · [Resume delivery](../local-webhook-delivery.md#resume-a-pending-delivery) · [Close area and step line](../chart-workspace.md#close-area-and-step-line) · [Baseline chart](../chart-workspace.md#baseline-chart) · [Close-change histogram](../chart-workspace.md#close-change-histogram) · [Volume-weighted candles](../chart-workspace.md#volume-weighted-candles) · [High-low band](../chart-workspace.md#high-low-band) · [Rebased percent change](../chart-workspace.md#rebased-percent-change) · [Peak-to-trough drawdown](../chart-workspace.md#peak-to-trough-drawdown) · [Confirmed close swings](../chart-workspace.md#confirmed-close-swings) · [Anchored VWAP](../chart-workspace.md#anchored-vwap) · [Pitchfork](../chart-workspace.md#pitchfork) · [Risk/reward drawing](../chart-workspace.md#riskreward-drawing) · [Regression channel](../chart-workspace.md#regression-channel)

<!-- section:04 -->
## Importer et relire ses données

Avec Import CSV, saisissez la place et le symbole et choisissez un OHLCV UTF-8 autorisé. Fournissez des secondes Unix, dates UTC ou horodatages UTC terminés par Z, en ordre strictement croissant. Limitez les décimales à six, utilisez un volume positif ou nul et encadrez l’ouverture et la clôture. Une ligne invalide annule l’import. Series details accepte l’intervalle, la source, le droit d’usage et la politique d’ajustement.

Pour la relecture, horodatez chaque bougie à son début. Dans Historical replay sélectionnez l’instrument, ajoutez le calendrier CSV et saisissez l’intervalle en secondes entières (1 à 86 400). Chaque ligne donne les bornes UTC, le décalage à l’ouverture et regular ou early. La grille part de l’ouverture et la dernière tranche peut finir plus tôt. Les bougies hors séance ou hors grille sont rejetées. Un manque fait avancer l’horloge et conserve le dernier cours.

Par défaut, chaque import accepte 1 500 000 octets et 100 000 bougies. La configuration peut atteindre 8 Mio et 100 000 lignes. Le calendrier accepte 1 Mio, 10 000 segments disjoints et 200 000 événements. Les quotas du navigateur s’appliquent aussi.

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
## Sauvegarder, migrer et restaurer

Workspace backup → Export workspace enregistre un JSON versionné avec les CSV d’origine, la provenance, les historiques visibles et masqués, la liste ordonnée, la sélection et les indicateurs. Dans le profil cible, choisissez Backup file, vérifiez les totaux et sélectionnez Restore workspace. Le catalogue cible est remplacé dans une transaction. Exportez d’abord la destination si elle doit être conservée.

Pour une mise à jour, conservez schéma, hôte, port et profil. La migration 0.1.0 vers IndexedDB relit les données et conserve la valeur d’origine. Fermez les anciens onglets. Le fichier de sauvegarde est en clair. SHA-256 vérifie l’intégrité. Les droits d’usage déterminent le stockage, l’accès et la conservation.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Architecture et calcul

Rust valide les instruments et le CSV, calcule en millionièmes entiers et prépare les événements de séance. React utilise ce même moteur en Wasm. Canvas trace les bougies, IndexedDB effectue les transactions et un service worker met les ressources en cache. Les révisions détectent les écritures concurrentes. L’état dépend du profil et de l’origine.

La SMA utilise une somme glissante exacte. L’EMA débute à la première fenêtre complète et arrondit au millionième à chaque étape, en s’éloignant de zéro à mi-distance. La relecture ne prend en compte que les clôtures déjà observées. La fin du créneau détermine la disponibilité. Arrivées réelles, corrections et horodatages intrabougie nécessitent leurs propres données. Les lignes importées restent intactes.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Déploiement et exploitation

Servez dist/ via HTTPS ou utilisez le lanceur en boucle locale. Le même profil et la même origine retrouvent les données. Autre port, autre profil ou navigation privée ouvrent un stockage distinct. Pour évaluer Tauri, compilez le terminal et installez les prérequis. CI compile sur Windows Server 2022, macOS 15 et Ubuntu 24.04 et ouvre la fenêtre Linux. La matrice détaille mobile, ARM et BSD. Reproduisez les tests avec Chromium de bureau.

Le modèle actuel prévoit un utilisateur local par profil. Utilisez des appareils approuvés pour les fichiers. Authentification, cloisonnement, surveillance et objectifs de rétention et de récupération relèvent d’un déploiement validé séparément. Le ZIP fournit les avis et un SBOM CycloneDX. Les versions étiquetées intègrent l’attestation.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Observer un service externe

Le SDK TradingBotObserverV1 lit runtime, status, account et portfolio auprès d’un trading-bot configuré séparément. Utilisez une origine fiable, HTTPS hors boucle locale et un jeton autorisé transmis par le processus. Lisez chaque instantané à sa date d’observation. Un état sain ou un instantané vide ne renseigne pas sur d’autres soldes ou positions. Les identifiants, ordres et opérations dépendent du service externe.

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
## Compiler et vérifier

Utilisez Node.js 22.12 ou supérieur avec npm, Rustup selon rust-toolchain.toml et Python 3.11 ou supérieur. Lancez les commandes à la racine. Vite indique l’URL de développement, généralement sur 5173. La production utilise 4173. Installez le Chromium verrouillé avant les tests.

Les contrôles couvrent Rust natif, Wasm, navigateur, SDK, serveur local, licences, SBOM et avis de sécurité. Chaque préfixe des deux moyennes concorde avec le calcul par lots, y compris changement d’heure, absence et fermeture anticipée. CI attend l’identifiant exact du ZIP et compare le fichier téléchargé octet par octet. Une étiquette de version concordante déclenche l’attestation.

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
## Diagnostiquer et reproduire

Si le port est occupé, lancez avec --port 4174 et utilisez l’export et la restauration pour déplacer les données. Pour l’accès hors ligne, ouvrez d’abord la production en ligne et attendez Offline ready. Pour un refus, vérifiez la ligne signalée, le début de chaque bougie ainsi que les dates et séances du marché.

Conservez CSV, calendrier, intervalle, révision Git, version du navigateur et horodatage de l’événement. Signalez le premier échec avec un exemple synthétique. Le dossier de vérification détaille les plateformes et la feuille de route donne les prochaines cibles.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Dépôt, contributions et licence

Le moteur et ses jeux de données sont dans crates/core, le terminal dans apps/terminal, l’hôte dans apps/desktop, le SDK dans packages/trading-bot et les outils dans scripts. Préférez de petits changements testés. Respectez les droits et avis, régénérez l’inventaire après modification des dépendances et signalez les vulnérabilités en privé.

Le code original est sous 0BSD. Les dépendances conservent leurs licences. Les éditions intégrales suivent le nombre total de locuteurs natifs et de seconde langue d’Ethnologue 2026, y compris les deux langues à égalité arrondie en vingtième position. Les manuels liés et l’interface peuvent être en anglais.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
