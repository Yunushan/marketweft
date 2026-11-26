<!-- MarketWeft README · locale=ru -->

# MarketWeft

**0.51.0 · 0BSD**

**Языки документации**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · **Русский** · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Возможности MarketWeft

MarketWeft — локальный исследовательский терминал для аналитиков, разработчиков и операторов. Он открывает разрешённые файлы OHLCV, показывает свечи и объёмы, рассчитывает SMA и EMA с фиксированной точкой и сохраняет список наблюдения, инструмент и индикаторы в IndexedDB. После кэширования работает офлайн. Встроенные цены и объёмы синтетические, учётная запись поставщика не нужна.

MarketWeft 0.51.0 добавляет локальный REST-сервис для чтения, расчёта формул на исторических данных и скрининга рынка на заданный момент. MarketWeft 0.7.0 добавляет отбор по ценовой доходности среди участников с учётом данных, известных на момент запроса. Воспроизведение торговых сессий учитывает дробления, денежные дивиденды, состав выборки и делистинги. В репозитории также есть модуль TypeScript с доступом для чтения к отдельному сервису trading-bot и экспериментальная оболочка Tauri. Подключение поставщиков данных, заявки, подписанные установщики и многопользовательский режим остаются в плане.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Запуск переносимого терминала

Откройте успешный запуск GitHub, скачайте browser-terminal-attempt-N и извлеките MarketWeft-browser-0.51.0.zip. Оставьте dist/ рядом с serve-terminal.mjs и выполните команду в этой папке. Откройте http://127.0.0.1:4173/ в актуальном браузере с WebAssembly, Canvas, BigInt и IndexedDB. Нужен Node.js 22.12 или новее. Установка npm не нужна. Перед отключением дождитесь Offline ready.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## Воспроизведение примера NYSE

В Historical replay выберите Start demo. Next event продвигает на шаг, Previous event возвращает назад, Play и Pause управляют запуском, Reset очищает показанную историю. График начинается пустым. Свеча появляется при завершении интервала. Event time означает начало интервала или границу сессии. Observed at показывает время доступности. Скорость влияет лишь на темп отображения.

Открытие 31 октября 2025 года в 13:30 UTC (UTC−04:00) сменяется открытием 3 ноября в 14:30 UTC (UTC−05:00). Отсутствие свечи с 15:00 видно в 15:30. В День благодарения интервалов нет. 28 ноября сессия заканчивается в 18:00 UTC после семи получасовых свечей. Пример содержит 20 сессий, 253 свечи и 294 события, синтетические данные и опубликованные часы NYSE.

Откройте Historical replay → Start split demo и переключите Price basis между Raw и Split-adjusted на одном событии. Дробление 2 к 1 объявлено и наблюдается до вступления в силу. До этого виды совпадают. В момент вступления последнее закрытие до дробления меняется с 106.50 в исходном виде на 53.25 в скорректированном, а объём удваивается. Первая свеча после остаётся 53.00. Для своих данных загрузите Corporate actions CSV выбранного инструмента и календарь сессий, подтвердите исходный OHLCV. После вступления применяется последний наблюдаемый коэффициент. Поздние сообщения и исправления меняют вид с момента наблюдения. Исходная история сохраняется.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Откройте Historical replay → Start dividend demo для сценария со 100 акциями, дающими право на каждую выплату. В экс-дивидендную дату возникает требование USD 25.00. Пересмотр увеличивает его до USD 30.00, а новая дата выплаты сдвигает зачисление. Запоздавший отчёт зачисляет EUR 10.00 при наблюдении. Коррекция после выплаты оставляет USD 28.00. Вернитесь назад для просмотра прежнего остатка. Для своих данных загрузите Cash dividends CSV и введите Entitled shares per distribution. Используйте один ID выплаты во всех ревизиях. Регистр разделяет валюты и сохраняет проводки и исходные цены.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Откройте Historical replay → Open universe replay → Start universe demo. В 14:05 UTC входит только ALFA, а в 14:10 добавляется BETA. Об исключении ALFA с 14:20 становится известно в 14:25. О делистинге BETA с 14:30 становится известно в 14:35. Вернитесь назад или задайте независимые Effective time и Known time. Загрузите свой Universe membership CSV. Для исправлений используйте прежний ID изменения, а при повторном использовании тикера задавайте разные идентификаторы листинга.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

В Universe screen нажмите Load demo prices и оставьте базу 14:00 UTC. В 14:05 ALFA лидирует с 1%. В 14:10 входит BETA, но получает место только после появления цены закрытия в 14:12. Задайте эффективное время 14:10 и сравните время знания 14:12 и 14:16. Доходность BETA меняется с 12% на 1%. При эффективном времени 14:20 ALFA исчезает, когда его исключение известно в 14:25. Для своих цен загрузите Universe prices CSV с идентификаторами листинга и точным временем закрытия. При отсутствии начальной или конечной цены участник остаётся без места.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

После загрузки цен нажмите Load demo sectors в Sector heatmap. В 14:10 UTC карта покрывает 60% известного веса. Когда в 14:12 появляется цена BETA, покрытие достигает 100%, а наблюдаемый вклад растёт с 1,2% до 6%. В 14:16 уточнение переводит BETA из Financials в Technology. Откройте плитку, чтобы увидеть место, вклад и время классификации. Для своих данных загрузите Sector and weight CSV.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Откройте Historical replay → Open financial statements → Start financial demo. Original filing показывает P/E 10×. Для того же времени оценки Restatement observed меняет P/E на 15× и показывает отсутствие обыкновенного капитала. Revised capitalization повышает P/E до 20×. Загрузите Annual filings CSV и при необходимости Capitalization CSV для своего эмитента и времени знания.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Откройте Historical replay → Open economic calendar → Start calendar demo. Перед публикацией виден прогноз 2,5%, фактическое значение отсутствует. Actual observed показывает 2,7% в 14:32 UTC. Revised actual выводит 2,8%, а обе поправки можно проследить в Release evidence. Для своих датированных выпусков загрузите Macro calendar CSV.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Откройте Historical replay → Open option chain → Start option demo. Апрельская пара со страйком 100 начинает с IV около 20%. Late option quote показывает колл со страйком 90 и IV 25%. Corrected spread восстанавливает расчёт для пута. Откройте Implied volatility surface для сравнения сроков. Свои котировки загружайте через Underlying CSV и Option quotes CSV.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Откройте Historical replay → Open replay alerts → Start alert demo. First crossing показывает одно пересечение порога. Correction observed показывает исправление и пересечение скользящей средней. Full alert replay выдаёт восемь уведомлений. Дважды нажмите Save to alert inbox. Сначала сохраняются восемь записей, при повторе новых записей ноль. Для своих данных загрузите Alert rules CSV и Alert observations CSV.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Откройте Historical replay → Open paper ledger → Start paper demo. Перейдите от резерва 503 к единственному частичному исполнению с остатком 801,6. Final account показывает остаток 663,7 и прибыль 13 после остановки. Загрузите Paper events CSV для своих смоделированных событий.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Откройте Historical replay → Open bar backtest → Start backtest demo. Сигнал в 14:05 UTC выставляет покупку. Пропущенный интервал 14:06 не даёт исполнения. Закрытие в 14:07 позволяет исполнить две акции. Final backtest показывает капитал 957,8. Загрузите CSV сессий и баров для своей истории.

В демо бэктеста запустите Walk-forward validation с шестью барами обучения и двумя барами проверки. Первое полное окно появится в 14:09 UTC. На обучении выигрывает пара 1:2, которая остаётся неизменной на двух проверочных барах. Проверка начинается с нового счёта.

В демо бэктеста запустите Seeded scenarios с начальным значением 20250403, 256 траекториями и восемью изменениями на траекторию. Конечный капитал базового прогона равен 957,8, медиана сценариев — 997,6. Одинаковые данные, время отсечения и начальное значение дают ту же таблицу рисков.

В демо состава загрузите Delisting proceeds для BETA-001 и задайте оба среза на 14:35 UTC. Сумма пока неизвестна. В 14:37 по десяти акциям положено 70 USD, а в 14:50 деньги отражаются в журнале. Более поздние корректировки сохраняют ранние срезы, а BETA-002 учитывается отдельно.

Откройте Start split revisions demo и выберите Split-adjusted. 3 июня в 14:10 UTC перенос времени снимает прежнюю поправку. В 14:20 перемножаются коэффициенты двух действий. Отмена SPLIT-A в 14:30 сохраняет действие SPLIT-B и исходные свечи.

Откройте Start dividend entitlement demo. Позиция ALPHA с правом на выплату растёт со 100 до 120 акций после позднего отчёта. Для BETA учитываются 40 акций. Коррекция ALPHA до 110 акций после выплаты сторнирует 3 USD. Перемотайте к прежнему балансу.

В демо состава загрузите Portfolio replay. Закрытие BETA-001 на 14:10 UTC становится видимым в 14:12. В 14:45 его требование на 70 USD отделено от 225 EUR стоимости BETA-002. В 14:50 стоимость акций и полученные выплаты составляют 284 USD.

Выберите Compare charts и инструмент сравнения. Link by UTC выделяет одно видимое время на обеих панелях. Масштаб каждой панели меняется отдельно. Резервная копия сохраняет инструменты, наложения и настройку связи.

Выберите Draw measurement и укажите существующую свечу UTC и цену для каждой точки. При смене масштаба или прокрутке график перестраивает линию по сохранённым координатам. Резервная копия сохраняет координаты. Приложение показывает время в секундах и изменение цены в абсолютном и процентном выражении.

Откройте Indicators и задайте периоды SMA и EMA в свечах для каждой панели. Когда цен закрытия достаточно, график показывает значения для выбранной свечи UTC. Периоды сохраняются при смене инструмента, перезагрузке и восстановлении из копии.

Откройте Export CSV под графиком. Скачайте свечи OHLCV для повторного импорта или добавьте сведения об источнике и включённые скользящие средние для анализа. Значения средних остаются пустыми, пока цен закрытия недостаточно.

Выберите Close line в любом селекторе типа графика. Линия строится по наблюдаемым ценам закрытия и сохраняет объём и включённые индикаторы. Отсутствующей свече UTC не соответствует связанное перекрестие. Резервная копия сохраняет выбранные типы.

Выберите OHLC bars. Вертикальный отрезок показывает максимум и минимум, отметка слева — открытие, справа — закрытие. Панели сохраняют свои типы графика, а связанное перекрестие совпадает по точному времени UTC.

Откройте Timeframe в любой панели и укажите исходный и целевой интервалы в секундах. График и исследовательский CSV показывают покрытие данными. Резервная копия сохраняет исходный ряд.

Добавьте CSV сессий в Timeframe. Интервалы отсчитываются от открытия каждой сессии, а последний заканчивается в указанное время закрытия. Исследовательский CSV сохраняет календарь и покрытие исходными данными.

Откройте Recorded tick bars и выберите число сделок и отсечку наблюдения. График сохраняет порядок записи при одинаковом времени, отмечает неполные бары и экспортирует точные номера последовательности.

В Portfolio replay загрузите пример дивидендов или добавьте CSV. Запрос использует позиции до экс-даты, учитывает выплату в дату платежа и применяет исправления во время их наблюдения.

Загрузите цены и откройте Relative returns в Universe screen. Выберите два идентификатора листинга и точное базовое время UTC. Сдвигайте границы запроса, чтобы увидеть пропуски цен и исправления, затем скачайте полное сравнение в CSV.

Откройте Recorded market depth и загрузите CSV глубины для выбранного инструмента. Переключайте моменты наблюдения, чтобы проверить уровни спроса и предложения, пропуск очередного обновления и восстановление по следующему снимку. Скачайте все уровни в CSV.

Откройте Recorded footprint и загрузите сделки выбранного инструмента. Укажите окно исполнения и границу наблюдения, чтобы увидеть объёмы покупок, продаж и сделок с неизвестной стороной в каждом ценовом интервале. Скачайте полный футпринт и кумулятивную дельту в CSV.

После запроса в Recorded footprint откройте Price profiles. Сравните объём по ценам с числом временных интервалов, в которых торговали в каждом ценовом диапазоне. Задайте целевую долю области стоимости и скачайте полные профили в CSV.

Откройте Rolling risk под Relative returns. Задайте интервал UTC, длину окна и масштаб волатильности, чтобы проверить доступные доходности и число парных наблюдений. Скачайте полное исследование в CSV.

Загрузите цены в Universe screen и откройте Correlated portfolio scenarios. Задайте веса, начальное число генератора и комиссию ребалансировки. Проверьте полноту доходностей и перцентили, затем скачайте все траектории в CSV.

На экране Universe screen откройте Cross-sectional paper replay и загрузите отчёт о ликвидности. Задайте время первого решения и параметры ранжирования, затем проверьте отбор, заявки, денежный остаток и оборот или скачайте полный журнал в CSV.

В Cross-sectional paper replay откройте Corporate cash reports и загрузите нужные CSV. Запустите воспроизведение, чтобы проверить право на выплаты, пересмотры, восстановленные позиции и кассовые записи, затем скачайте журнал в CSV.

В Bar backtest откройте Recorded trade execution и загрузите CSV со сделками. Задайте отсечки исполнения и наблюдения, чтобы проверить поздние частичные исполнения, точные номера записи, деньги и капитал. Скачайте полный журнал в CSV.

После исторического ранжирования откройте Cross-sectional walk-forward. Сравните периоды и количество бумаг, проверьте непересекающиеся тесты и неполные оценки. Экспортируйте результаты и источники в CSV.

Выберите график и откройте Time-series formulas. Введите выражение OHLCV и отсечку наблюдения, проверьте точные значения и недоступные строки. Экспортируйте формулу, источник, версию языка и результаты в CSV.

Загрузите историю баров и откройте Formula paper backtest. Задайте выражения и обе отсечки, сравните исполнение по объёму баров и записанным сделкам, затем выгрузите журнал в CSV.

Скачайте пакет из принятого бэктеста. Загрузите его в другом рабочем пространстве, чтобы восстановить обе формулы, режим исполнения и точные настройки счёта. Повторите результат с теми же данными и отсечками.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Local REST](../local-rest-research.md)

<!-- section:04 -->
## Импорт и воспроизведение своих данных

В Import CSV укажите площадку и символ и выберите разрешённый UTF-8 OHLCV. Используйте строго возрастающие секунды Unix, даты UTC или метки UTC с Z. Допустимо до шести знаков после запятой. Объём неотрицателен, максимум и минимум охватывают цены открытия и закрытия. Ошибка строки отменяет весь импорт. В Series details укажите интервал, источник, право и способ корректировки.

Для воспроизведения отметьте свечи временем начала. В Historical replay укажите инструмент, календарь CSV и целые секунды интервала (1–86 400). В календаре укажите границы UTC, смещение при открытии и regular или early. Сетка начинается при открытии, последняя ячейка может быть короче. Свечи вне сессии или сетки отклоняются. Пропуск продвигает время и сохраняет показанные цены.

По умолчанию файл ограничен 1 500 000 байт и 100 000 свечей. При сборке можно настроить до 8 МиБ и 100 000 строк. Календарь допускает 1 МиБ, 10 000 непересекающихся отрезков и 200 000 событий. Квота браузера действует отдельно.

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
## Резервное копирование, миграция и восстановление

Workspace backup → Export workspace сохраняет версионный JSON с исходными CSV, происхождением, видимыми и скрытыми историями, порядком списка, выбором и индикаторами. В целевом профиле выберите Backup file, проверьте итоговые числа и вызовите Restore workspace. Одна транзакция заменяет каталог. При необходимости сначала экспортируйте целевой каталог.

При обновлении сохраните схему, хост, порт и профиль. Миграция с 0.1.0 в IndexedDB проверяет записанные данные и оставляет исходное значение. Закройте старые вкладки. Копия содержит открытый текст. SHA-256 проверяет целостность. Разрешение на данные определяет доступ, хранение и срок хранения.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Архитектура и точность

Rust проверяет инструмент, время UTC и OHLCV, выполняет расчёт в целых миллионных и формирует события сессии. React использует тот же Wasm, Canvas для графика, транзакции IndexedDB и сервис-воркер для статических файлов. Ревизии выявляют параллельную запись. Состояние привязано к профилю и источнику.

SMA использует точную скользящую сумму. EMA начинается с первого полного окна и округляется на каждом шаге до миллионной, при равном расстоянии от нуля. Воспроизведение использует только открытые наблюдателю цены закрытия. Доступность определяется концом интервала. Задержки поставщика, исправления и время внутри свечи требуют отдельных сведений. Исходные строки сохраняются.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Развёртывание и эксплуатация

Публикуйте dist/ через HTTPS или запускайте локальный сервер. Чтобы сохранить состояние, сохраните источник. Другой порт, профиль или приватное окно используют другое хранилище. Для проверки Tauri сначала соберите веб-клиент и установите системные зависимости. CI строит Windows Server 2022, macOS 15 и Ubuntu 24.04 и проверяет окно Linux. Матрица описывает мобильные платформы, ARM и BSD. Тесты воспроизводятся в настольном Chromium.

Сейчас поддерживается один локальный пользователь на профиль. Храните данные на разрешённых устройствах. Аутентификация, изоляция, наблюдение, сроки хранения и восстановление требуют проверенного плана внедрения. ZIP включает уведомления и CycloneDX SBOM. Поток выпуска по тегу предусматривает аттестацию.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Наблюдение внешнего сервиса

TradingBotObserverV1 читает runtime, status, account и portfolio из отдельного trading-bot. Используйте доверенный адрес, HTTPS за пределами loopback и разрешённый токен из конфигурации процесса. Проверяйте время каждого наблюдения. Пустой снимок и нормальная работа сервиса не дают дополнительных данных о балансах и позициях. Учётные данные, заявки и исполнение относятся к внешнему сервису.

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
## Сборка и проверка исходников

Используйте Node.js от 22.12 с npm, Rustup из rust-toolchain.toml и Python от 3.11. Запускайте из корня. Vite выводит адрес разработки, обычно порт 5173. Режим выпуска использует 4173. Установите закреплённую версию Chromium перед браузерными тестами.

Проверяются Rust, Wasm, браузер, SDK, локальная раздача, лицензии, SBOM и бюллетени. Обе средние сравниваются с соответствующим префиксом пакетного расчёта после каждого события, включая смену времени, пропуск и раннее закрытие. CI ждёт точный ID артефакта и побайтово сверяет скачанный ZIP. Аттестацию запускает совпадающий тег версии.

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
## Диагностика и воспроизведение

Если порт занят, используйте --port 4174 и перенесите данные через экспорт и восстановление. Перед офлайн-запуском откройте рабочую сборку онлайн и дождитесь Offline ready. При отказе проверьте строку из ошибки, времена начала и календарь для указанной биржи и дат.

Сохраните CSV, календарь, интервал, ревизию Git, версию браузера и время события. Приложите синтетический пример и первый неудачный шаг. Запись проверок содержит сведения по платформам, а дорожная карта — следующие критерии.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Репозиторий, участие и лицензия

В crates/core находятся движок и тестовые данные, в apps/terminal браузер и тесты, в apps/desktop оболочка, в packages/trading-bot SDK, в scripts инструменты. Делайте небольшие проверяемые изменения. Соблюдайте права и уведомления, обновляйте инвентарь зависимостей и сообщайте об уязвимостях приватно.

Оригинальный код лицензирован по 0BSD. У зависимостей собственные лицензии. Полные издания следуют рейтингу Ethnologue 2026 по числу говорящих на первом и втором языке и включают оба языка с округлённым двадцатым местом. Интерфейс и связанные руководства могут быть на английском.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
