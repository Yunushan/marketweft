<!-- MarketWeft README · locale=es -->

# MarketWeft

**0.5.0 · 0BSD**

**Idiomas de la documentación**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · **Español** · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
[Português](../../docs/readme/README.pt.md) · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## Qué ofrece MarketWeft

MarketWeft es un terminal de investigación que prioriza el trabajo local para analistas, desarrolladores y operadores. Abre archivos OHLCV autorizados, dibuja velas y volumen, calcula SMA y EMA en punto fijo y guarda en IndexedDB la lista de seguimiento, el instrumento seleccionado y los indicadores. Funciona sin conexión tras almacenar los recursos. Los precios y volúmenes integrados son sintéticos y no requieren una cuenta.

MarketWeft 0.5.0 añade dividendos en efectivo según la información disponible en cada momento, junto con el desdoblamiento en la reproducción por sesiones. También ofrece un observador TypeScript de solo lectura para un trading-bot independiente y un host Tauri experimental. Escisiones, fuentes conectadas, órdenes, alojamiento multiusuario e instaladores firmados siguen en la hoja de ruta.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Iniciar el terminal portátil

Descarga browser-terminal-attempt-N de una ejecución satisfactoria de GitHub. Extrae MarketWeft-browser-0.5.0.zip, deja dist/ junto a serve-terminal.mjs y ejecuta el comando en esa carpeta. Abre http://127.0.0.1:4173/ en un navegador actual con WebAssembly, Canvas, BigInt e IndexedDB. Usa Node.js 22.12 o posterior. No hace falta npm. Espera a Offline ready antes de desconectarte.

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

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv)

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
