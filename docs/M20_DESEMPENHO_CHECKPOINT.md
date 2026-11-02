# M20 — Medição inicial de produção local

2026-10-11. Build existente m20-20261011132120 executado por node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001, com SST_ISOLATED_BUILD=1 e SST_BUILD_VERIFY_ID correspondente. Servidor pronto em 204 ms. Não houve deploy ou alteração de código. Mesmo armazenamento fictício local, apenas leitura durante esta verificação.

## Medidas HTTP

curl.exe --silent --show-error --output NUL --write-out '%{http_code},%{time_starttransfer},%{time_total},%{size_download}' URL. Três amostras consecutivas por rota, sem cookies/credenciais, localhost sem limitação de rede. Todas status 200.

| Rota | Amostra | Primeiro byte (ms) | HTML completo (ms) | Bytes de HTML |
|---|---:|---:|---:|---:|
| /site | 1 | 49,1 | 112,2 | 28220 |
| /site | 2 | 9,2 | 40,4 | 28220 |
| /site | 3 | 9,2 | 36,6 | 28220 |
| /login | 1 | 33,4 | 61,2 | 16441 |
| /login | 2 | 7,9 | 35,5 | 16441 |
| /login | 3 | 5,9 | 34,6 | 16441 |

Resultados brutos em assets/m20-http-producao.json. A primeira tentativa restrita não alcançou a porta local; seus resultados inválidos foram substituídos pelas seis respostas válidas acima. Medidas não incluem scripts, CSS, fontes, pintura ou interação e não representam rede móvel, concorrência ou capacidade de produção. Amostragem pequena, sem estabelecer meta de desempenho.

## Navegador

Fila operacional e governança abriram completamente no build de produção local com a sessão Master existente. Zero tarefas pendentes, uma falha preservada; política revisão 1, 45 dias, bloqueio ativo. Não foram executadas mutações. Evidência assets/m20-producao-local.jpg. A API de observação do navegador não disponibilizou performance.getEntriesByType; não foram medidos FCP/LCP/CLS/INP. Nenhuma alegação de Core Web Vitals aprovada.

Aba temporária fechada e servidor da porta 3001 encerrado ao final. Porta 3000 preservada. Arquivos criados: este checkpoint, JSON das medidas e screenshot; atualizados M20_CHECKPOINT.md e CHANGELOG.md.

Próximo passo: aceite humano dos fluxos demonstrativos. Acessibilidade por leitor de tela e métricas de experiência de navegação permanecem pendentes; M20 não liberado para produção e M21 não iniciado.
