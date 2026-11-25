<!-- MarketWeft README · locale=ru -->

# MarketWeft

**0.3.0 · 0BSD**

**Языки документации**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · **Русский** · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Возможности MarketWeft

MarketWeft — локальный исследовательский терминал для аналитиков, разработчиков и операторов. Он открывает разрешённые файлы OHLCV, показывает свечи и объёмы, рассчитывает SMA и EMA с фиксированной точкой и сохраняет список наблюдения, инструмент и индикаторы в IndexedDB. После кэширования работает офлайн. Встроенные цены и объёмы синтетические, учётная запись поставщика не нужна.

В версии 0.3.0 доступно воспроизведение одной неизменяемой истории по сессиям. В репозитории также есть независимый TypeScript SDK для чтения данных trading-bot и экспериментальная оболочка Tauri. Корпоративные действия, каналы данных, заявки, многопользовательский режим и подписанные установщики остаются в плане.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Запуск переносимого терминала

Откройте успешный запуск GitHub, скачайте browser-terminal-attempt-N и извлеките MarketWeft-browser-0.3.0.zip. Оставьте dist/ рядом с serve-terminal.mjs и выполните команду в этой папке. Откройте http://127.0.0.1:4173/ в актуальном браузере с WebAssembly, Canvas, BigInt и IndexedDB. Нужен Node.js 22.12 или новее. Установка npm не нужна. Перед отключением дождитесь Offline ready.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## Воспроизведение примера NYSE

В Historical replay выберите Start demo. Next event продвигает на шаг, Previous event возвращает назад, Play и Pause управляют запуском, Reset очищает показанную историю. График начинается пустым. Свеча появляется при завершении интервала. Event time означает начало интервала или границу сессии. Observed at показывает время доступности. Скорость влияет лишь на темп отображения.

Открытие 31 октября 2025 года в 13:30 UTC (UTC−04:00) сменяется открытием 3 ноября в 14:30 UTC (UTC−05:00). Отсутствие свечи с 15:00 видно в 15:30. В День благодарения интервалов нет. 28 ноября сессия заканчивается в 18:00 UTC после семи получасовых свечей. Пример содержит 20 сессий, 253 свечи и 294 события, синтетические данные и опубликованные часы NYSE.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv)

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
