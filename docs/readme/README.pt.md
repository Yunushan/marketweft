<!-- MarketWeft README · locale=pt -->

# MarketWeft

**0.60.0 · 0BSD**

**Idiomas da documentação**

[English](../../README.md) · [简体中文](../../docs/readme/README.zh-Hans.md) · [हिन्दी](../../docs/readme/README.hi.md) · [Español](../../docs/readme/README.es.md) · [العربية الفصحى](../../docs/readme/README.ar.md) · [Français](../../docs/readme/README.fr.md) · [বাংলা](../../docs/readme/README.bn.md)
**Português** · [Bahasa Indonesia](../../docs/readme/README.id.md) · [اردو](../../docs/readme/README.ur.md) · [Русский](../../docs/readme/README.ru.md) · [Deutsch](../../docs/readme/README.de.md) · [日本語](../../docs/readme/README.ja.md) · [Naijá](../../docs/readme/README.pcm.md)
[العربي المصري](../../docs/readme/README.arz.md) · [मराठी](../../docs/readme/README.mr.md) · [Tiếng Việt](../../docs/readme/README.vi.md) · [తెలుగు](../../docs/readme/README.te.md) · [Kiswahili](../../docs/readme/README.sw.md) · [Hausa](../../docs/readme/README.ha.md) · [Türkçe](../../docs/readme/README.tr.md)

<!-- section:01 -->
## O que o MarketWeft faz

MarketWeft é um terminal de pesquisa local para analistas, desenvolvedores e operadores. Abre arquivos OHLCV autorizados, exibe velas e volume, calcula SMA e EMA em ponto fixo e guarda a lista, o instrumento selecionado e os indicadores em IndexedDB. Após armazenar os recursos em cache, funciona sem conexão. As cotações e volumes fornecidos são sintéticos e dispensam conta.

MarketWeft 0.60.0 empacota o serviço de investigação numa imagem OCI verificada que corre sem root em Linux x64. O MarketWeft 0.7.0 acrescenta a triagem do universo por retorno de preço com os dados conhecidos no instante da consulta. A reprodução por sessões inclui desdobramentos, dividendos em dinheiro, composição do universo e cancelamentos de listagem. O repositório traz um observador TypeScript somente leitura para o serviço independente trading-bot e um invólucro experimental Tauri. Feeds de fornecedores, ordens, instaladores assinados e hospedagem multiusuário permanecem no roteiro.

[ROADMAP.md](../../ROADMAP.md) · [docs/coverage.md](../../docs/coverage.md)

<!-- section:02 -->
## Iniciar o terminal portátil

Baixe browser-terminal-attempt-N de uma verificação bem-sucedida no GitHub. Extraia MarketWeft-browser-0.60.0.zip, mantenha dist/ junto de serve-terminal.mjs e execute o comando na pasta. Acesse http://127.0.0.1:4173/ em navegador atual com WebAssembly, Canvas, BigInt e IndexedDB. Use Node.js 22.12 ou superior. O pacote dispensa instalação npm. Espere Offline ready para desconectar.

```sh
node serve-terminal.mjs
```

[GitHub Actions](https://github.com/Yunushan/marketweft/actions/workflows/verify.yml) · [docs/platforms.md](../../docs/platforms.md)

<!-- section:03 -->
## Reproduzir o exemplo da NYSE

Abra Historical replay e escolha Start demo. Next event avança, Previous event recua, Play e Pause controlam a reprodução e Reset zera o trecho visível. O gráfico começa vazio e revela cada vela no fim do intervalo. Event time identifica o início ou o limite da sessão. Observed at indica quando o evento está disponível. A velocidade altera apenas o ritmo na tela.

A abertura passa de 13:30 UTC (UTC−04:00) em 31/10/2025 para 14:30 UTC (UTC−05:00) em 03/11. A falta da vela de 15:00 é anunciada às 15:30. O feriado de Ação de Graças não gera intervalos. Em 28/11 o fechamento ocorre às 18:00 UTC após sete velas de 30 minutos. São 20 sessões, 253 velas e 294 eventos, com dados sintéticos e horários públicos da NYSE.

Abra Historical replay → Start split demo e mude Price basis entre Raw e Split-adjusted no mesmo evento. O desdobramento de 2 por 1 é anunciado e observado antes de vigorar. As duas visões coincidem até lá. Quando entra em vigor, o fechamento anterior passa de 106.50 bruto para 53.25 ajustado e o volume dobra. A primeira vela posterior mantém 53.00. Para seus dados, envie o Corporate actions CSV do instrumento, confirme o OHLCV bruto e forneça o calendário de sessões. A proporção observada mais recente vale após entrar em vigor. Avisos atrasados e correções alteram a visão a partir da observação. O histórico original permanece intacto.

```csv
instrument,announced_at,effective_at,observed_at,new_shares,old_shares
DEMO:SPLIT,2025-06-02T14:15:00Z,2025-06-03T14:00:00Z,2025-06-02T14:20:00Z,2,1
```

Abra Historical replay → Start dividend demo para acompanhar 100 ações elegíveis por distribuição. A data ex cria USD 25.00 a receber. A revisão eleva o valor a USD 30.00 e a nova data de pagamento posterga o crédito. Um relatório atrasado credita EUR 10.00 quando observado. Uma correção após o pagamento deixa USD 28.00. Volte para ver os saldos anteriores. Nos seus dados, envie Cash dividends CSV e preencha Entitled shares per distribution. Mantenha o ID da distribuição nas revisões. O razão separa moedas e preserva lançamentos anteriores e preços originais.

```csv
instrument,dividend_id,announced_at,ex_at,pay_at,observed_at,currency,amount_per_share
DEMO:DIVIDEND,ALPHA,2025-06-02T14:03:00Z,2025-06-03T14:00:00Z,2025-06-04T12:00:00Z,2025-06-02T14:05:00Z,USD,0.250000
```

Abra Historical replay → Open universe replay → Start universe demo. Às 14:05 UTC apenas ALFA integra o universo e às 14:10 BETA entra. A remoção de ALFA às 14:20 torna-se conhecida às 14:25. A deslistagem de BETA às 14:30 fica conhecida às 14:35. Volte para recuperar a composição anterior ou consulte Effective time e Known time separadamente. Envie seu Universe membership CSV. Mantenha o ID da mudança nas revisões e use IDs de listagem distintos ao reutilizar um ticker.

```csv
universe,change_id,listing_id,instrument,effective_at,observed_at,action
DEMO-BASKET,BETA-JOIN,BETA-001,DEMO:BETA,2025-06-02T14:10:00Z,2025-06-02T14:05:00Z,add
```

Em Universe screen, escolha Load demo prices e mantenha a base de 14:00 UTC. Às 14:05, ALFA lidera com 1%. BETA entra às 14:10 e fica sem classificação até seu fechamento ser conhecido às 14:12. Consulte o instante efetivo 14:10 com os horários conhecidos 14:12 e 14:16 para comparar o retorno de BETA de 12% com o 1% revisado. No instante efetivo 14:20, ALFA sai quando sua remoção é conhecida às 14:25. Importe um Universe prices CSV com o ID da listagem e fechamentos em horários exatos. Um fechamento inicial ou final ausente deixa o membro sem classificação.

```csv
universe,listing_id,price_at,observed_at,close
DEMO-BASKET,BETA-001,2025-06-02T14:10:00Z,2025-06-02T14:12:00Z,56
```

Após carregar os preços de demonstração, selecione Load demo sectors em Sector heatmap. Às 14:10 UTC o mapa cobre 60% do peso conhecido. Quando o preço de BETA é conhecido às 14:12, a cobertura sobe a 100% e a contribuição observada passa de 1,2% a 6%. Às 14:16 a revisão transfere BETA de Financials para Technology. Abra um bloco para ver a posição, a contribuição e os horários de classificação. Para seus dados, importe um Sector and weight CSV.

```csv
universe,listing_id,effective_at,observed_at,sector,weight
DEMO-BASKET,BETA-001,2025-06-02T14:05:00Z,2025-06-02T14:16:00Z,Technology,0.4
```

Abra Historical replay → Open financial statements → Start financial demo. Original filing mostra P/L de 10×. No mesmo instante de avaliação, Restatement observed eleva o múltiplo a 15× e mostra que falta o patrimônio ordinário. Revised capitalization eleva o P/L a 20×. Importe um Annual filings CSV e opcionalmente um Capitalization CSV para consultar seu emissor e horário de conhecimento.

```csv
issuer_id,filing_id,fiscal_start,fiscal_end,published_at,observed_at,currency,revenue,common_net_income,common_equity,operating_cash_flow
DEMO-ALFA,ALFA-FY24-A1,2024-01-01,2024-12-31,2025-04-03T14:15:00Z,2025-04-03T14:20:00Z,USD,8000000000,800000000,,-250000000
```

```csv
issuer_id,source_id,valuation_at,observed_at,currency,market_cap
DEMO-ALFA,ALFA-CAP,2025-04-03T14:00:00Z,2025-04-03T14:01:00Z,USD,12000000000
```

Abra Historical replay → Open economic calendar → Start calendar demo. Antes da divulgação, a previsão é 2,5% e o valor observado está ausente. Actual observed mostra 2,7% às 14:32 UTC. Revised actual mostra 2,8% e Release evidence registra as duas revisões. Importe um Macro calendar CSV para usar suas próprias divulgações datadas.

```csv
release_id,series_id,reference_date,unit,record_id,kind,published_at,observed_at,scheduled_at,value,supersedes
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A0,actual,2025-04-03T14:30:00Z,2025-04-03T14:32:00Z,,2.7,
INFLATION-MAR,DEMO.CPI,2025-03-01,percent,CPI-A1,revision,2025-04-03T14:40:00Z,2025-04-03T14:45:00Z,,2.6,CPI-A0
```

Abra Historical replay → Open option chain → Start option demo. O par de abril com exercício 100 começa com IV de cerca de 20%. Late option quote mostra a call de exercício 90 com 25%, e Corrected spread restaura o cálculo de uma put. Abra Implied volatility surface para comparar vencimentos. Carregue Underlying CSV e Option quotes CSV para suas cotações.

```csv
underlying,currency,quote_at,observed_at,spot,rate,dividend_yield
DEMO:OPT,USD,2025-04-03T13:59:00Z,2025-04-03T13:59:00Z,100,0.03,0.01
```

```csv
contract_id,underlying,currency,side,expiry,strike,quote_at,observed_at,bid,ask
APR-C100,DEMO:OPT,USD,call,2026-04-03T14:00:00Z,100,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,8.807321,8.847321
```

Abra Historical replay → Open replay alerts → Start alert demo. First crossing mostra um alerta de limiar. Correction observed mostra a observação corrigida e seu cruzamento de média móvel. Full alert replay mostra oito alertas. Use Save to alert inbox duas vezes para salvar oito registros na primeira e zero novos na segunda. Para dados próprios, importe Alert rules CSV e Alert observations CSV.

```csv
rule_id,revision_id,series_id,effective_at,observed_at,kind,direction,operand
LEVEL,R1,DEMO.CLOSE,2025-04-03T14:00:00Z,2025-04-03T14:00:00Z,threshold,either,5
```

```csv
observation_id,series_id,measured_at,observed_at,value
O2,DEMO.CLOSE,2025-04-03T14:02:00Z,2025-04-03T14:02:00Z,6
```

Abra Historical replay → Open paper ledger → Start paper demo. Avance da reserva de 503 até a execução parcial única que deixa 801,6 em caixa. Final account mostra 663,7 em caixa e 13 de lucro realizado após a interrupção. Importe Paper events CSV para suas ordens, execuções e controles simulados.

```csv
event_id,observed_at,kind,order_id,instrument,side,shares,price,source_id,price_at
OPEN,2025-04-03T14:00:00Z,submit,BUY,DEMO:AAA,buy,10,50,,
FILL1,2025-04-03T14:02:00Z,fill,BUY,,,4,49,Q1,2025-04-03T14:01:00Z
```

Abra Historical replay → Open bar backtest → Start backtest demo. Às 14:05 UTC o sinal coloca uma compra. A barra ausente das 14:06 não gera execução. O fechamento das 14:07 permite duas ações. Final backtest mostra patrimônio de 957,8. Importe os CSVs de sessões e barras para usar dados locais.

Na demonstração de backtest, execute Walk-forward validation com seis barras de treino e duas de teste. A primeira janela completa aparece às 14:09 UTC. O par 1:2 vence no treino e permanece fixo nas duas barras de teste, que partem de uma conta nova.

Na demonstração de backtest, execute Seeded scenarios com a semente 20250403, 256 trajetórias e oito movimentos por trajetória. O patrimônio final de referência é 957,8 e a mediana dos cenários é 997,6. O mesmo corte, dados e semente reproduzem a tabela de risco.

Na demonstração do universo, carregue Delisting proceeds para BETA-001 e defina os dois cortes em 14:35 UTC para ver o valor indisponível. Às 14:37, dez ações dão 70 USD a receber, lançados em caixa às 14:50. As correções posteriores preservam as consultas anteriores e mantêm BETA-002 separado.

Abra Start split revisions demo e escolha Split-adjusted. Em 3 de junho às 14:10 UTC, o novo horário de vigência retira o ajuste anterior. Às 14:20, dois fatores se combinam. O cancelamento de SPLIT-A às 14:30 mantém SPLIT-B e preserva as velas brutas.

Abra Start dividend entitlement demo. ALPHA começa com 100 ações elegíveis e sobe para 120 após um relatório tardio. BETA usa 40 ações. Uma correção posterior para 110 ações ALPHA reverte 3 USD depois do pagamento. Volte para ver o saldo anterior.

Na demonstração do universo, carregue Portfolio replay. O fechamento de BETA-001 às 14:10 UTC aparece quando é conhecido às 14:12. Às 14:45, seus 70 USD a receber ficam separados dos 225 EUR em ações BETA-002. Às 14:50, ações e caixa de deslistagem somam 284 USD.

Escolha Compare charts e selecione um instrumento de comparação. Link by UTC destaca o mesmo instante visível nos dois painéis. O zoom é independente. O backup preserva os instrumentos, as sobreposições e a opção de ligação.

Escolha Draw measurement e selecione uma barra UTC existente e um preço para cada ponto. Ao ampliar ou deslocar o gráfico, a linha é redesenhada com as coordenadas salvas. O backup guarda essas coordenadas. O aplicativo mostra o tempo em segundos e a variação do preço em valor e percentual.

Abra Indicators e ajuste os períodos de SMA e EMA em barras para cada painel. Quando há fechamentos suficientes, o gráfico mostra os valores da barra UTC selecionada. Os períodos são preservados ao trocar de instrumento, recarregar ou restaurar o backup.

Abra Export CSV abaixo do gráfico. Baixe barras OHLCV para reimportação ou inclua a procedência e as médias móveis ativas para análise. As médias ficam em branco até haver fechamentos suficientes.

Escolha Close line no seletor de tipo de qualquer painel. A linha usa os fechamentos observados e mantém o volume e os indicadores ativos. Uma barra UTC ausente fica sem cursor vinculado. O backup guarda os tipos escolhidos.

Escolha OHLC bars para ver a máxima e a mínima na haste vertical, a abertura à esquerda e o fechamento à direita. Cada painel mantém seu tipo e o cursor vinculado segue as barras UTC exatas.

Abra Timeframe em um painel e informe os intervalos de origem e destino em segundos. O gráfico e o CSV de pesquisa mostram a cobertura observada. O backup preserva a série original.

Adicione um CSV de sessões em Timeframe. As barras seguem a abertura de cada sessão e a última termina no fechamento indicado. O CSV de pesquisa registra o calendário e a cobertura da origem.

Abra Recorded tick bars e escolha a quantidade e o corte de observação. O gráfico mantém a ordem de captura para horários iguais, identifica barras parciais e exporta seus limites exatos de sequência.

Em Portfolio replay, carregue o exemplo de dividendos ou adicione um CSV. A consulta usa as posições anteriores à data ex, liquida na data de pagamento e aplica revisões nos horários de observação.

Após carregar os preços, abra Relative returns em Universe screen. Escolha dois IDs de listagem e um horário UTC exato como base. Ajuste os cortes do universo para acompanhar fechamentos ausentes e revisões e baixe a comparação completa em CSV.

Abra Recorded market depth e carregue um CSV de profundidade para o instrumento selecionado. Percorra os horários de observação para conferir os níveis de compra e venda, uma lacuna na sequência e a recuperação no instantâneo seguinte. Baixe todos os níveis em CSV.

Abra Recorded footprint e carregue as negociações do instrumento selecionado. Defina a janela de execução e o corte de observação para inspecionar volumes de compra, venda e lado desconhecido por faixa de preço. Baixe o footprint completo e o delta acumulado em CSV.

Em Recorded footprint, execute uma consulta e abra Price profiles. Compare o volume por preço com o número de intervalos em que houve negociação em cada faixa. Defina o alvo da área de valor e baixe os perfis completos em CSV.

Abra Rolling risk em Relative returns. Ajuste o intervalo UTC, o tamanho da janela e a escala de volatilidade para examinar os retornos disponíveis de cada listagem e o número de pares. Baixe o estudo completo em CSV.

Após carregar os preços, abra Correlated portfolio scenarios em Universe screen. Defina os pesos da carteira, a semente e o custo de rebalanceamento. Confira a cobertura de retornos completos e os percentis e baixe todas as trajetórias em CSV.

Em Universe screen, abra Cross-sectional paper replay e carregue um relatório de liquidez. Defina a primeira decisão e os critérios de classificação. Confira seleções, ordens, caixa e volume financeiro ou baixe a reprodução completa em CSV.

Em Cross-sectional paper replay, abra Corporate cash reports e carregue os CSVs correspondentes. Execute a simulação para conferir direitos, revisões de pagamento, posições restauradas e recibos. Baixe o registro de caixa em CSV.

Em Bar backtest, abra Recorded trade execution e carregue o CSV de negócios. Defina os cortes efetivo e de conhecimento para conferir execuções parciais, identificadores exatos, caixa e patrimônio. Baixe o histórico completo em CSV.

Depois de executar a classificação, abra Cross-sectional walk-forward. Compare horizontes e quantidades de ativos, confira testes separados e avaliações incompletas e exporte resultados e fontes em CSV.

Selecione um gráfico e abra Time-series formulas. Informe uma expressão OHLCV e um corte de observação para ver valores exatos e linhas indisponíveis. Exporte fórmula, fonte, versão e resultados em CSV.

Carregue o histórico de barras e abra Formula paper backtest. Defina as expressões e os dois cortes. Compare o volume das barras com negócios registrados, examine sinais ausentes e exporte todos os recibos em CSV.

Baixe o pacote de um backtest aceito. Carregue-o em outro espaço para restaurar as duas fórmulas, o modo de execução e os ajustes exatos da conta. Reproduza o resultado com os mesmos dados e cortes.

[docs/historical-replay.md](../../docs/historical-replay.md) · [replay-sessions.csv](../../crates/core/tests/fixtures/nyse-2025-replay-sessions.csv) · [replay-ohlcv.csv](../../crates/core/tests/fixtures/nyse-2025-replay-ohlcv.csv) · [corporate-actions.md](../../docs/corporate-actions.md) · [split-actions.csv](../../crates/core/tests/fixtures/synthetic-split-actions.csv) · [split-sessions.csv](../../crates/core/tests/fixtures/synthetic-split-sessions.csv) · [split-ohlcv.csv](../../crates/core/tests/fixtures/synthetic-split-ohlcv.csv) · [cash-dividends.md](../../docs/cash-dividends.md) · [cash-dividends.csv](../../crates/core/tests/fixtures/synthetic-cash-dividends.csv) · [universe-membership.md](../../docs/universe-membership.md) · [universe-membership.csv](../../crates/core/tests/fixtures/synthetic-universe.csv) · [universe-screen.md](../../docs/universe-screen.md) · [universe-prices.csv](../../crates/core/tests/fixtures/synthetic-universe-prices.csv) · [sector-heatmap.md](../../docs/sector-heatmap.md) · [universe-sectors.csv](../../crates/core/tests/fixtures/synthetic-universe-sectors.csv) · [financial-statements.md](../../docs/financial-statements.md) · [financial-filings.csv](../../crates/core/tests/fixtures/synthetic-financial-filings.csv) · [financial-market-caps.csv](../../crates/core/tests/fixtures/synthetic-financial-market-caps.csv) · [macro-calendar.md](../../docs/macro-calendar.md) · [macro-calendar.csv](../../crates/core/tests/fixtures/synthetic-macro-calendar.csv) · [option-chain.md](../../docs/option-chain.md) · [option-underlying.csv](../../crates/core/tests/fixtures/synthetic-option-underlying.csv) · [option-quotes.csv](../../crates/core/tests/fixtures/synthetic-option-quotes.csv) · [replay-alerts.md](../../docs/replay-alerts.md) · [alert-rules.csv](../../crates/core/tests/fixtures/synthetic-alert-rules.csv) · [alert-observations.csv](../../crates/core/tests/fixtures/synthetic-alert-observations.csv) · [paper-ledger.md](../../docs/paper-ledger.md) · [paper-events.csv](../../crates/core/tests/fixtures/synthetic-paper-events.csv) · [bar-backtest.md](../../docs/bar-backtest.md) · [backtest-sessions.csv](../../crates/core/tests/fixtures/synthetic-backtest-sessions.csv) · [backtest-bars.csv](../../crates/core/tests/fixtures/synthetic-backtest-bars.csv) · [walk-forward.md](../../docs/walk-forward.md) · [seeded-scenarios.md](../../docs/seeded-scenarios.md) · [delisting-proceeds.md](../../docs/delisting-proceeds.md) · [split-revisions.csv](../../crates/core/tests/fixtures/synthetic-split-revisions.csv) · [dividend-positions.csv](../../crates/core/tests/fixtures/synthetic-dividend-positions.csv) · [portfolio-replay.md](../../docs/portfolio-replay.md) · [portfolio-holdings.csv](../../crates/core/tests/fixtures/synthetic-portfolio-holdings.csv) · [chart-workspace.md](../../docs/chart-workspace.md) · [relative-returns.md](../../docs/relative-returns.md) · [recorded-depth.md](../../docs/recorded-depth.md) · [recorded-footprint.md](../../docs/recorded-footprint.md) · [price-profiles.md](../../docs/price-profiles.md) · [listing-risk.md](../../docs/listing-risk.md) · [portfolio-scenarios.md](../../docs/portfolio-scenarios.md) · [cross-sectional-paper.md](../../docs/cross-sectional-paper.md) · [paper-corporate-cash.md](../../docs/paper-corporate-cash.md) · [recorded-trade-execution.md](../../docs/recorded-trade-execution.md) · [cross-sectional-walk-forward.md](../../docs/cross-sectional-walk-forward.md) · [time-series-language.md](../../docs/time-series-language.md) · [formula-paper-backtest.md](../../docs/formula-paper-backtest.md) · [formula-strategy-packages.md](../../docs/formula-strategy-packages.md) · [formula-walk-forward.md](../../docs/formula-walk-forward.md) · [formula-functions.md](../../docs/formula-functions.md) · [TypeScript SDK](../../packages/research/README.md) · [Python SDK](../../packages/python-research/README.md) · [MCP](../local-mcp-research.md) · [Research screen](../research-universe-screen.md) · [Local REST](../local-rest-research.md) · [WebSocket](../local-rest-research.md#websocket-streaming) · [gRPC](../local-rest-research.md#grpc-research) · [SQLite audit](../local-rest-research.md#sqlite-audit-receipts) · [Audit recovery](../local-rest-research.md#audit-backup-and-recovery) · [Concurrency](../local-rest-research.md#concurrency-and-retries) · [Managed credentials](../local-rest-research.md#managed-research-credentials) · [Localhost TLS](../local-rest-research.md#localhost-tls) · [Private research](../local-rest-research.md#private-interface-research) · [Research OCI image](../local-rest-research.md#research-oci-image)

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
