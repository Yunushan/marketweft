<!-- MarketWeft README · locale=pt -->

# MarketWeft

**0.3.0 · 0BSD**

**Idiomas da documentação**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
**Português** · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## O que o MarketWeft faz

MarketWeft é um terminal de pesquisa local para analistas, desenvolvedores e operadores. Abre arquivos OHLCV autorizados, exibe velas e volume, calcula SMA e EMA em ponto fixo e guarda a lista, o instrumento selecionado e os indicadores em IndexedDB. Após armazenar os recursos em cache, funciona sem conexão. As cotações e volumes fornecidos são sintéticos e dispensam conta.

A versão 0.3.0 adiciona reprodução histórica de uma série imutável por sessão. O repositório também oferece um SDK TypeScript de observação somente leitura para trading-bot e um host Tauri experimental. Eventos corporativos, feeds, ordens, hospedagem multiusuário e instaladores assinados estão no roteiro.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Iniciar o terminal portátil

Baixe browser-terminal-attempt-N de uma verificação bem-sucedida no GitHub. Extraia MarketWeft-browser-0.3.0.zip, mantenha dist/ junto de serve-terminal.mjs e execute o comando na pasta. Acesse http://127.0.0.1:4173/ em navegador atual com WebAssembly, Canvas, BigInt e IndexedDB. Use Node.js 22.12 ou superior. O pacote dispensa instalação npm. Espere Offline ready para desconectar.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## Reproduzir o exemplo da NYSE

Abra Historical replay e escolha Start demo. Next event avança, Previous event recua, Play e Pause controlam a reprodução e Reset zera o trecho visível. O gráfico começa vazio e revela cada vela no fim do intervalo. Event time identifica o início ou o limite da sessão. Observed at indica quando o evento está disponível. A velocidade altera apenas o ritmo na tela.

A abertura passa de 13:30 UTC (UTC−04:00) em 31/10/2025 para 14:30 UTC (UTC−05:00) em 03/11. A falta da vela de 15:00 é anunciada às 15:30. O feriado de Ação de Graças não gera intervalos. Em 28/11 o fechamento ocorre às 18:00 UTC após sete velas de 30 minutos. São 20 sessões, 253 velas e 294 eventos, com dados sintéticos e horários públicos da NYSE.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv)

<!-- section:04 -->
## Importar e reproduzir seus dados

Em Import CSV informe mercado e símbolo e selecione um OHLCV UTF-8 autorizado. Use segundos Unix, datas UTC ou horários UTC terminados em Z, em ordem crescente estrita. Use até seis casas decimais, volume não negativo e máxima e mínima que contenham abertura e fechamento. Uma linha inválida rejeita tudo. Em Series details informe intervalo, fonte, direito de uso e política de ajuste.

Para reproduzir, carimbe as velas no início do intervalo. Em Historical replay selecione o ativo, adicione o calendário CSV e digite o intervalo em segundos inteiros (1–86 400). Cada linha fornece limites UTC, desvio em minutos na abertura e regular ou early. A grade começa na abertura e o último intervalo pode terminar mais cedo. Velas fora da sessão ou grade são rejeitadas. Uma lacuna avança o relógio e mantém os preços anteriores.

O limite padrão por arquivo é 1 500 000 bytes e 100 000 velas. A compilação pode ajustar até 8 MiB e 100 000 linhas. O calendário aceita 1 MiB, 10 000 segmentos sem sobreposição e 200 000 eventos. Também se aplicam as cotas do navegador.

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
## Fazer backup, migrar e restaurar

Em Workspace backup → Export workspace salve o JSON versionado com CSV original, proveniência, históricos visíveis e ocultos, ordem da lista, seleção e indicadores. No destino selecione Backup file, confira contagens e clique Restore workspace. Uma transação substitui o catálogo. Exporte antes o destino se precisar preservá-lo.

Use o mesmo esquema, host, porta e perfil na atualização. Os espaços 0.1.0 migram para IndexedDB com releitura de verificação e preservação do valor original. Feche as abas antigas. O backup contém texto simples. SHA-256 verifica integridade. Controle armazenamento, acesso e retenção conforme a licença de dados.

[docs/workspace-backup.md](../../docs/workspace-backup.md) · [SECURITY.md](../../SECURITY.md)

<!-- section:06 -->
## Arquitetura e precisão

Rust valida instrumentos, UTC e OHLCV, calcula milionésimos inteiros e cria eventos de sessão. O terminal React roda o mesmo motor em Wasm, usa Canvas, transações IndexedDB e um service worker para arquivos. Revisões detectam gravações concorrentes. O estado pertence ao perfil e à origem.

A SMA usa soma móvel exata. A EMA parte da primeira janela completa e arredonda cada passo ao milionésimo, afastando de zero nos empates. A reprodução usa os fechamentos que já apareceram. O fim do intervalo é o instante de disponibilidade histórica. Chegadas do provedor, revisões e tempos intravela exigem dados próprios. As linhas originais permanecem intactas.

[docs/adr/0002-transactional-history.md](../../docs/adr/0002-transactional-history.md) · [docs/adr/0003-session-replay.md](../../docs/adr/0003-session-replay.md)

<!-- section:07 -->
## Implantação e operação

Sirva dist/ via HTTPS ou pelo lançador local. Mantenha a origem para conservar o espaço. Outra porta, perfil ou janela anônima usa armazenamento distinto. Para avaliar Tauri, compile a interface e instale os pré-requisitos. CI compila em Windows Server 2022, macOS 15 e Ubuntu 24.04 e abre a janela Linux. A matriz registra suporte móvel, ARM e BSD. Use Chromium de desktop nos testes.

O modelo atual é um usuário local por perfil. Guarde dados em dispositivos aprovados. Autenticação, separação entre usuários, monitoramento, retenção e recuperação exigem arquitetura de implantação validada. O ZIP inclui avisos e SBOM CycloneDX. O fluxo de tags de versão prevê atestação.

```sh
npm ci
npm run build
cargo run --locked --manifest-path apps/desktop/Cargo.toml
```

[docs/platforms.md](../../docs/platforms.md) · [Tauri](https://v2.tauri.app/start/prerequisites/) · [CycloneDX](../../docs/dependencies.cdx.json)

<!-- section:08 -->
## Observar serviço externo

TradingBotObserverV1 consulta runtime, status, account e portfolio de um trading-bot configurado à parte. Use uma origem confiável, HTTPS fora de loopback e token autorizado na configuração do processo. Avalie cada observação pelo próprio horário. Estado saudável ou instantâneo vazio não determina saldos e posições adicionais. Credenciais, ordens e execução ficam no serviço externo.

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
## Compilar e verificar

Use Node.js 22.12 ou superior com npm, a versão do Rustup definida em rust-toolchain.toml e Python 3.11 ou superior. Execute a partir da raiz. Vite mostra a URL de desenvolvimento, em geral na porta 5173. A produção usa 4173. Instale o Chromium fixado antes dos testes.

A verificação cobre Rust nativo, Wasm, navegador, SDK, servidor local, licenças, SBOM e avisos. Cada prefixo das duas médias coincide com o cálculo em lote, incluindo horário de verão, lacuna e fechamento antecipado. CI aguarda o ID exato do ZIP e compara seus bytes após o download. Só tags compatíveis com a versão acionam atestação.

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
## Diagnosticar e reproduzir

Se a porta estiver ocupada, use --port 4174 e mova os dados por exportação e restauração. Para problemas offline, abra produção online e espere Offline ready. Em caso de rejeição, confira a linha indicada, o início das velas e o calendário correto para mercado e datas.

Registre CSV, calendário, intervalo, revisão Git, navegador e hora do evento. Envie um caso sintético com o primeiro passo que falha. Consulte evidências por plataforma e próximos marcos.

[docs/verification.md](../../docs/verification.md) · [ROADMAP.md](../../ROADMAP.md)

<!-- section:11 -->
## Repositório, contribuições e licença

Motor e fixtures ficam em crates/core, terminal em apps/terminal, host em apps/desktop, SDK em packages/trading-bot e ferramentas em scripts. Faça alterações pequenas e testadas. Respeite direitos e avisos, regenere o inventário após mudanças de dependências e informe vulnerabilidades em privado.

O código original usa 0BSD. Dependências mantêm suas licenças. As edições integrais seguem o total de falantes de primeira e segunda língua no Ethnologue 2026 e incluem ambos os idiomas empatados no vigésimo lugar arredondado. Manuais vinculados e interface podem estar em inglês.

[CONTRIBUTING.md](../../CONTRIBUTING.md) · [SECURITY.md](../../SECURITY.md) · [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES) · [0BSD](../../LICENSE) · [Ethnologue 2026](https://www.ethnologue.com/insights/ethnologue200/) · [Ethnologue 2026 · L1 + L2](https://en.wikipedia.org/w/index.php?title=List_of_languages_by_total_number_of_speakers&oldid=1385320542#Ethnologue_(2026))
