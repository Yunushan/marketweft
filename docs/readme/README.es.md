<!-- MarketWeft README · locale=es -->

# MarketWeft

**0.79.0 · 0BSD**

**Idiomas de la documentación**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · **Español** · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Qué ofrece MarketWeft

MarketWeft es un terminal de investigación que prioriza el trabajo local para analistas, desarrolladores y operadores. Abre archivos OHLCV autorizados, dibuja velas y volumen, calcula SMA y EMA en punto fijo y guarda en IndexedDB la lista de seguimiento, el instrumento seleccionado y los indicadores. Funciona sin conexión tras almacenar los recursos. Los precios y volúmenes integrados son sintéticos y no requieren una cuenta.

MarketWeft 0.79.0 reproduce las revisiones OHLCV de proveedores con cortes independientes para las barras y las observaciones. MarketWeft 0.7.0 incorpora un filtro histórico por rentabilidad de precio con los datos disponibles en cada fecha. La reproducción por sesiones incluye desdoblamientos, dividendos en efectivo, composición del universo y exclusiones de cotización. El repositorio también ofrece un observador TypeScript de solo lectura para el servicio independiente trading-bot y un envoltorio Tauri experimental. Los proveedores de datos, las órdenes, los instaladores firmados y el alojamiento multiusuario siguen en la hoja de ruta.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Iniciar el terminal portátil

Descarga browser-terminal-attempt-N de una ejecución satisfactoria de GitHub. Extrae MarketWeft-browser-0.79.0.zip, deja dist/ junto a serve-terminal.mjs y ejecuta el comando en esa carpeta. Abre http://127.0.0.1:4173/ en un navegador actual con WebAssembly, Canvas, BigInt e IndexedDB. Usa Node.js 22.12 o posterior. No hace falta npm. Espera a Offline ready antes de desconectarte.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## Reproducir el ejemplo de NYSE

En Historical replay elige Start demo. Avanza con Next event, reproduce o pausa con Play y Pause, retrocede con Previous event o reinicia con Reset. El gráfico empieza vacío. Cada vela aparece al final de su intervalo. Event time indica el inicio o el límite de sesión. Observed at indica cuándo está disponible. La velocidad solo cambia el ritmo en pantalla.

La apertura pasa de 13:30 UTC (UTC−04:00) el 31 de octubre de 2025 a 14:30 UTC (UTC−05:00) el 3 de noviembre. El intervalo omitido de las 15:00 se detecta a las 15:30. En Acción de Gracias no hay intervalos. El 28 de noviembre cierra a las 18:00 UTC, con siete velas de 30 minutos. El ejemplo abarca 20 sesiones, 253 velas y 294 eventos con datos sintéticos y horarios oficiales de NYSE.

Abre Historical replay → Start split demo y alterna Price basis entre Raw y Split-adjusted en el mismo evento. El desdoblamiento 2 por 1 se anuncia y se conoce antes de entrar en vigor. Hasta entonces, ambas vistas coinciden. Al hacerse efectivo, el último cierre anterior pasa de 106.50 en bruto a 53.25 ajustado y el volumen se duplica. La primera vela posterior conserva 53.00. Para tus propios datos, carga el Corporate actions CSV del instrumento, confirma que el OHLCV es bruto y aporta el calendario de sesiones. Se aplica el último ratio observado una vez vigente. Los avisos tardíos y las correcciones cambian la vista desde su observación. El historial original se conserva.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Abre Historical replay → Start dividend demo para seguir 100 acciones con derecho a cada dividendo. En la fecha exdividendo se reconocen USD 25.00 por cobrar. Una revisión eleva la cifra a USD 30.00 y la nueva fecha aplaza el abono. Un informe tardío acredita EUR 10.00 al observarse y una corrección posterior al pago deja USD 28.00. Retrocede para ver los saldos anteriores. Para tus datos carga Cash dividends CSV e indica Entitled shares per distribution. Conserva el ID de distribución en las revisiones. El registro separa las monedas y conserva los asientos anteriores y los precios de origen.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Abre Historical replay → Open universe replay → Start universe demo. A las 14:05 UTC solo pertenece ALFA y a las 14:10 entra BETA. La salida de ALFA a las 14:20 se conoce a las 14:25. La exclusión de cotización de BETA a las 14:30 se conoce a las 14:35. Retrocede para recuperar la composición anterior o consulta con Effective time y Known time independientes. Carga un Universe membership CSV para tus datos. Conserva el ID de cambio en revisiones y usa ID de cotización distintos si se reutiliza el símbolo.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

En Universe screen selecciona Load demo prices y conserva la base de las 14:00 UTC. A las 14:05, ALFA lidera con un 1%. BETA entra a las 14:10 y queda sin clasificar hasta que se conoce su cierre a las 14:12. Consulta las 14:10 como hora efectiva con las 14:12 y las 14:16 como horas de conocimiento para comparar el 12% de BETA con su 1% revisado. En la consulta efectiva de las 14:20, ALFA sale cuando se conoce su baja a las 14:25. Carga un Universe prices CSV con el identificador de cotización y cierres de instantes exactos. Si falta un cierre inicial o final, el miembro queda sin clasificar.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

Tras cargar los precios de demostración, selecciona Load demo sectors en Sector heatmap. A las 14:10 UTC, el mapa cubre el 60% del peso conocido. Al publicarse el precio de BETA a las 14:12, la cobertura alcanza el 100% y la contribución observada sube del 1,2% al 6%. A las 14:16, la revisión traslada BETA de Financials a Technology. Abre una ficha para consultar el rango, la contribución y los horarios de clasificación. Para tus datos, carga un Sector and weight CSV.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Abre Historical replay → Open financial statements → Start financial demo. Original filing muestra un P/E de 10×. A la misma hora de valoración, Restatement observed lo eleva a 15× y muestra que falta el patrimonio ordinario. Revised capitalization eleva el P/E a 20×. Carga un Annual filings CSV y, opcionalmente, un Capitalization CSV para consultar tu emisor y la fecha de conocimiento.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Abre Historical replay → Open economic calendar → Start calendar demo. Antes de publicarse, el pronóstico es del 2,5% y el dato real todavía no está disponible. Actual observed muestra el 2,7% a las 14:32 UTC. Revised actual muestra el 2,8% y Release evidence permite seguir las dos revisiones. Carga un Macro calendar CSV para usar tus propias publicaciones fechadas.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Abre Historical replay → Open option chain → Start option demo. El par de abril con ejercicio 100 tiene cerca de un 20% de IV. Late option quote muestra la call de ejercicio 90 con IV del 25%, y Corrected spread corrige una put que carecía de valoración. Abre Implied volatility surface para comparar vencimientos. Usa Underlying CSV y Option quotes CSV para cargar tus cotizaciones.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Abre Historical replay → Open replay alerts → Start alert demo. First crossing muestra una alerta de umbral. Correction observed muestra la observación revisada y el cruce de media móvil. Full alert replay muestra ocho alertas. Pulsa Save to alert inbox dos veces para guardar ocho registros primero y cero nuevos después. Usa Alert rules CSV y Alert observations CSV para tus datos.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Abre Historical replay → Open paper ledger → Start paper demo. Avanza desde la reserva de 503 hasta la ejecución parcial única que deja 801,6 de efectivo. Final account muestra 663,7 de efectivo y un beneficio realizado de 13 después de la detención. Usa Paper events CSV para reproducir tus órdenes, ejecuciones y controles simulados.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Abre Historical replay → Open bar backtest → Start backtest demo. La señal de las 14:05 UTC coloca una orden de compra. El intervalo ausente de las 14:06 queda sin ejecución. El cierre de las 14:07 permite ejecutar dos acciones. Final backtest muestra un patrimonio de 957,8. Carga tus CSV de sesiones y barras para probar con datos locales.

En la demo de backtest, ejecuta Walk-forward validation con seis barras de entrenamiento y dos de prueba. El primer bloque completo aparece a las 14:09 UTC. El par 1:2 gana en el entrenamiento y se mantiene durante las dos barras de prueba, que parten de una cuenta nueva.

En la demo de backtest, ejecuta Seeded scenarios con la semilla 20250403, 256 trayectorias y ocho movimientos por trayectoria. El patrimonio final de referencia es 957,8 y la mediana de los escenarios es 997,6. El mismo corte, datos y semilla reproducen la tabla de riesgo.

En la demo del universo, carga Delisting proceeds para BETA-001 y fija ambos cortes en las 14:35 UTC. El importe aún no está disponible. A las 14:37, diez acciones generan 70 USD por cobrar y a las 14:50 se registra el efectivo. Las correcciones posteriores conservan los cortes anteriores y separan BETA-002.

Abre Start split revisions demo y elige Split-adjusted. El 3 de junio a las 14:10 UTC, el cambio de vigencia retira el ajuste anterior. A las 14:20 se combinan dos identificadores. Al cancelar SPLIT-A a las 14:30, se conserva SPLIT-B y las velas originales permanecen intactas.

Abre Start dividend entitlement demo. ALPHA empieza con 100 acciones con derecho y sube a 120 al llegar un informe tardío. BETA usa 40 acciones. Una corrección posterior a 110 acciones de ALPHA revierte 3 USD tras el pago. Retrocede para consultar el saldo anterior.

En la demo del universo, carga Portfolio replay. El cierre de BETA-001 a las 14:10 UTC aparece al conocerlo a las 14:12. A las 14:45, sus 70 USD por cobrar se separan de los 225 EUR de BETA-002. A las 14:50, las acciones y el efectivo por exclusión suman 284 USD.

Elige Compare charts y selecciona un instrumento de comparación. Link by UTC resalta el mismo instante visible en ambos paneles. Ajusta el zoom de cada panel por separado. La copia del espacio guarda los instrumentos, los indicadores superpuestos y el enlace.

Elige Draw measurement y selecciona una barra UTC existente y un precio para cada extremo. Al ampliar o desplazar el gráfico, la línea se vuelve a dibujar con sus coordenadas guardadas. La copia del espacio conserva esas coordenadas. La aplicación muestra segundos transcurridos y variación absoluta y porcentual del precio.

Abre Indicators y fija los periodos de SMA y EMA en barras para cada panel. Cuando hay suficientes cierres, se muestran los valores de la barra UTC seleccionada. Los periodos se conservan al cambiar de instrumento, recargar y restaurar una copia del espacio.

Abre Export CSV debajo del gráfico. Descarga barras OHLCV para volver a importarlas o incluye la procedencia y las medias móviles activadas para el análisis. Los valores de las medias quedan vacíos hasta que hay suficientes cierres.

Elige Close line en el control de tipo de cualquiera de los paneles. La línea usa cierres observados y conserva el volumen y los indicadores activados. Una barra UTC ausente no muestra cursor enlazado. Las copias del espacio guardan los tipos de gráfico.

Elige OHLC bars para ver el máximo y el mínimo en una línea vertical, la apertura a la izquierda y el cierre a la derecha. Cada panel conserva su tipo y el cursor enlazado sigue las barras UTC exactas.

Abre Timeframe en cualquier panel e introduce los intervalos de origen y destino en segundos. El gráfico y el CSV de investigación muestran la cobertura observada. Las copias del espacio conservan la serie original.

Agrega un CSV de sesiones en Timeframe. Los grupos se alinean con la apertura de cada sesión y el último termina al cierre indicado. El CSV de investigación registra el calendario y la cobertura de origen.

Abre Recorded tick bars y elige el número de operaciones y el corte de observación. El gráfico conserva el orden de captura para tiempos iguales, marca las barras incompletas y exporta sus secuencias exactas.

En Portfolio replay carga la demo de dividendos o añade un CSV. La consulta usa las posiciones antes de la fecha ex, liquida en la fecha de pago y aplica las revisiones en el momento en que se observaron.

Tras cargar los precios, abre Relative returns en Universe screen. Elige dos identificadores de cotización y una hora base exacta en UTC. Cambia los cortes del universo para ver cierres ausentes y revisiones, y descarga la comparación completa en CSV.

Abre Recorded market depth y carga un CSV de profundidad del instrumento seleccionado. Recorre los cortes de observación para ver los niveles de compra y venta, un salto de secuencia y la recuperación con la siguiente instantánea. Descarga todos los niveles en CSV.

Abre Recorded footprint y carga las operaciones del instrumento seleccionado. Define la ventana de ejecución y el corte de observación para ver el volumen comprador, vendedor y desconocido por tramo de precio. Descarga la huella y el delta acumulado en CSV.

Tras ejecutar una consulta en Recorded footprint, abre Price profiles. Compara el volumen por precio con el número de intervalos de tiempo en que se negoció a cada precio. Define el objetivo del área de valor y descarga los perfiles completos en CSV.

Abre Rolling risk debajo de Relative returns. Define el intervalo UTC, la ventana y la escala de volatilidad para ver los rendimientos disponibles de cada cotización y los pares de la muestra. Descarga el estudio completo en CSV.

Tras cargar precios en Universe screen, abre Correlated portfolio scenarios. Define los pesos, la semilla y el coste de rebalanceo. Revisa la cobertura de rendimientos completos y los percentiles, y descarga todas las trayectorias en CSV.

En Universe screen, abre Cross-sectional paper replay y carga un informe de liquidez. Configura la primera decisión y la clasificación. Consulta la selección, las órdenes, el efectivo y la rotación o descarga la reproducción completa en CSV.

En Cross-sectional paper replay, abre Corporate cash reports y carga los CSV correspondientes. Ejecuta la reproducción para revisar derechos, pagos revisados, posiciones restablecidas y recibos. Descarga el registro de efectivo en CSV.

En Bar backtest, abre Recorded trade execution y carga un CSV de operaciones. Ajusta ambos cortes para consultar las ejecuciones parciales tardías, los identificadores de captura, el efectivo y el patrimonio. Descarga el historial completo en CSV.

Tras la reproducción de clasificación, abre Cross-sectional walk-forward. Compara horizontes y cantidades de valores, revisa pruebas sin solapamiento y valoraciones incompletas, y exporta resultados y fuentes en CSV.

Selecciona un gráfico y abre Time-series formulas. Introduce una expresión OHLCV y un corte de observación para ver valores exactos y filas sin datos. Exporta la fórmula, la fuente, la versión y los resultados en CSV.

Carga el historial de barras y abre Formula paper backtest. Configura las expresiones de entrada y salida y ambos cortes. Compara volumen de barras y operaciones registradas, revisa señales sin datos y exporta los comprobantes en CSV.

Descarga el paquete de una simulación aceptada. Cárgalo en otro espacio para recuperar ambas fórmulas, el modo de ejecución y los ajustes exactos. Repite el resultado con los mismos datos y cortes.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Local REST](../local-rest-research.md) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image) · [Docker Compose](../local-rest-research.md#private-docker-compose-deployment) · [Kubernetes](../local-rest-research.md#private-kubernetes-deployment) · [Health and metrics](../local-rest-research.md#loopback-health-and-metrics) · [Controlled shutdown](../local-rest-research.md#controlled-shutdown) · [Fresh-volume recovery](../local-rest-research.md#recover-audit-in-a-separate-compose-project) · [Audit snapshot verification](../local-rest-research.md#verify-a-portable-audit-snapshot) · [Restore with a SHA-256 digest](../local-rest-research.md#restore-with-a-trusted-sha-256-digest) · [Research readiness](../local-rest-research.md#research-readiness) · [Source permissions](../source-permissions.md) · [Chart export permission](../source-permissions.md#chart-csv-export) · [Formula use permission](../source-permissions.md#time-series-formulas) · [Formula export permission](../source-permissions.md#formula-csv-export) · [Provider history fixture](../provider-history-fixture.md) · [Provider CSV verification](../provider-history-fixture.md#verify-the-embedded-csv) · [Provider signature verification](../provider-history-fixture.md#verify-a-signed-provider-fixture) · [Provider verification records](../provider-history-fixture.md#provider-verification-records) · [Provider key registry](../provider-history-fixture.md#provider-key-registry) · [Provider key validity windows](../provider-history-fixture.md#provider-key-validity-windows) · [Provider revision replay](../provider-revisions.md)

<!-- section:04 -->
## Importar y reproducir datos propios

En Import CSV indica mercado y símbolo y elige un archivo OHLCV UTF-8 autorizado. Ordena de forma estrictamente creciente los segundos Unix, fechas UTC o marcas UTC terminadas en Z. Usa hasta seis decimales, volumen no negativo y máximos y mínimos que encierren apertura y cierre. Una fila inválida cancela la importación. En Series details indica intervalo, origen, permiso de uso y política de ajuste.

Para reproducir, etiqueta cada vela con el inicio del intervalo. En Historical replay selecciona el instrumento, añade el CSV de sesiones e indica segundos enteros (1–86 400). Usa apertura y cierre exactos UTC, desfase en minutos al abrir y regular o early. La cuadrícula parte de la apertura y el último intervalo puede acortarse al cierre. Se rechazan velas fuera de sesión o cuadrícula. Un hueco mueve el reloj y conserva los datos visibles.

Límites por defecto de importación: 1 500 000 bytes y 100 000 velas. El despliegue puede ajustar hasta 8 MiB y 100 000 filas. El calendario admite 1 MiB, 10 000 segmentos sin solapamiento y 200 000 eventos. Rigen además las cuotas del navegador.

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
## Respaldar, migrar y recuperar

En Workspace backup → Export workspace guarda el JSON versionado con CSV originales, procedencia, históricos visibles y ocultos, lista ordenada, selección e indicadores. En el perfil de destino usa Backup file, revisa los recuentos y pulsa Restore workspace. El catálogo se reemplaza en una transacción. Exporta primero el destino si necesitas conservarlo.

Actualiza con el mismo perfil, esquema, host y puerto. Las áreas de 0.1.0 pasan a IndexedDB con lectura de verificación y se conserva el valor original. Cierra las pestañas antiguas. El respaldo es texto claro. SHA-256 verifica integridad y el permiso de uso determina el acceso, almacenamiento y retención.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Arquitectura y reglas numéricas

Rust valida instrumentos, fechas UTC y OHLCV, calcula en millonésimas enteras y construye los eventos de sesión. React usa el mismo motor en Wasm, gráficos Canvas, transacciones IndexedDB y un service worker para los recursos. Las revisiones detectan escrituras concurrentes. El estado pertenece al perfil y origen local.

La SMA usa una suma móvil exacta. La EMA nace de la primera ventana completa y redondea cada paso a la millonésima, alejándose de cero en caso de empate. La reproducción usa solo cierres ya revelados. El final previsto del intervalo determina la disponibilidad. Las llegadas del proveedor, revisiones y tiempos intraintervalo requieren otros datos. Las filas originales permanecen intactas.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Despliegue y alcance operativo

Sirve dist/ por HTTPS o usa el lanzador local. Mantén el origen para conservar el espacio. Otro puerto, perfil o ventana privada cambia el almacenamiento. Para evaluar Tauri, compila la web e instala sus requisitos. CI compila en Windows Server 2022, macOS 15 y Ubuntu 24.04 y comprueba la ventana Linux. La matriz distingue móviles, ARM y BSD. Usa Chromium de escritorio para repetir las pruebas.

El modelo actual es un usuario por perfil. Conserva archivos y respaldos en dispositivos autorizados. Autenticación, separación de usuarios, monitorización, retención y recuperación necesitan un diseño de despliegue validado. El ZIP incluye avisos de licencia y un SBOM CycloneDX. El flujo de etiquetas de versión incluye atestación.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Observar un servicio externo

TradingBotObserverV1 consulta runtime, status, account y portfolio en un trading-bot configurado aparte. Usa un origen de confianza, HTTPS fuera de loopback y un token autorizado inyectado en el proceso. Lee la marca temporal de cada instantánea. Una cuenta vacía o un servicio sano no aporta saldos ni posiciones adicionales. Las credenciales, órdenes y ejecución pertenecen al servicio externo.

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
## Compilar y verificar desde el código

Usa Node.js 22.12 o posterior con npm, la cadena Rustup de rust-toolchain.toml y Python 3.11 o superior. Ejecuta desde la raíz. Vite muestra el URL de desarrollo, normalmente puerto 5173. El lanzador de producción usa 4173. Instala el Chromium fijado antes de probar.

Comprueba Rust nativo, Wasm, navegador, SDK, servidor local, licencias, SBOM y avisos. Tras cada evento se comparan ambas medias con el prefijo de cálculo por lotes, incluidos cambio horario, hueco y cierre anticipado. CI espera el identificador exacto del artefacto y compara sus bytes al descargarlo. Solo la etiqueta de versión coincidente activa la atestación.

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
## Diagnosticar y reproducir

Si el puerto está ocupado, usa --port 4174 y exporta/restaura para mover datos entre orígenes. Para resolver inicio sin conexión, abre primero producción en línea y espera Offline ready. Ante un archivo rechazado revisa la fila indicada, las marcas de inicio y las sesiones del mercado y fechas correctos.

Conserva CSV, calendario, intervalo, revisión Git, navegador y hora del evento. Al informar de una incidencia adjunta un caso sintético y el primer paso que falla. Consulta las evidencias de la plataforma y los próximos objetivos.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Repositorio, contribuciones y licencia

El motor y las muestras están en crates/core, la interfaz y pruebas en apps/terminal, el host en apps/desktop, el SDK en packages/trading-bot y las herramientas en scripts. Haz cambios pequeños con pruebas. Respeta los derechos y avisos, regenera el inventario al cambiar dependencias y comunica vulnerabilidades en privado.

El código original utiliza 0BSD. Las dependencias mantienen su licencia. Las ediciones completas siguen Ethnologue 2026 por hablantes de primera y segunda lengua e incluyen ambos idiomas empatados en el vigésimo puesto redondeado. Los manuales enlazados y la interfaz pueden estar en inglés.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
