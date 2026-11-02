# M20 — Primeira fatia: fila e caixa de saída fictícias

Continuidade autorizada pelo usuário com “PODE CONTINUAR”. Complemento de incidentes, retenção simulada e exportação descrito em M20_GOVERNANCA_CHECKPOINT.md. M20 permanece em andamento.

Nova continuidade autorizada com “CONTINUA”: revisão das referências existentes, isolada por consultoria e exigida antes de novas avaliações. Ver M20_REFERENCIAS_CHECKPOINT.md. Não há regras legais novas ou validação profissional automática.

2026-10-11. Usuário solicitou “CONTINUA” após M19 fictício. Aceite para avanço da demonstração registrado; M20 iniciado exclusivamente com dados fictícios. Esta entrega não encerra todo o M20 e não inicia M21.

## Entrega
- Nova área Master `/master/operacao`, com link no painel, contadores e histórico.
- Enfileirar tarefa fictícia de mensagem por consultoria ativa. Chave idempotente por consultoria: mesma requisição não duplica, conteúdo divergente é recusado.
- Processamento manual de uma tarefa pronta por clique; sem serviço em segundo plano. Cenários fixos: sucesso imediato, duas falhas e sucesso, três falhas e fila de falhas para análise (DLQ). Máximo de três tentativas, intervalos técnicos de 5 e 10 segundos. Consultoria suspensa não tem tarefas processadas ou eventos entregues.
- Conclusão e evento da caixa de saída (outbox) persistidos juntos no mesmo arquivo. Outro clique confirma uma entrega exclusivamente local, sem criar eventos adicionais. Tarefas e falhas preservadas; histórico de tentativas não é substituído.
- Master verificado no servidor em todas as leituras e ações, consultoria validada e limite administrativo compartilhado. Justificativa fica no registro local, sem copiar para auditoria.
- Nenhuma mensagem, cobrança, chamada de IA ou mutação regulatória externa. Falhas simuladas da tarefa são distintas de erros reais de arquivo; erros reais não recebem retries ocultos.

## Arquivos
Novos: `src/lib/job-sandbox.ts`; `src/app/master/operacao/page.tsx`, `actions.ts`, `panel.tsx`; `tests/job-sandbox.test.ts`.
Alterados: `src/lib/audit-log.ts`, `src/app/master/master-dashboard.tsx`. Persistência: `data/job-sandbox.json`, ignorada pelo Git. Documentação: este checkpoint, M19_FICTICIO_CHECKPOINT.md, CHANGELOG.md e DECISION_LOG.md.

## Verificação executada
- TypeScript `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
- ESLint dos arquivos desta fatia e dashboard/auditoria: aprovado.
- Build `node node_modules/next/dist/bin/next build`: aprovado, incluindo `/master/operacao`.
- Suite completa em pasta temporária fora das restrições Windows: `node --experimental-strip-types --test --test-concurrency=1 <app>/tests/*.test.ts <app>/tests/*.test.mjs`: 94 testes aprovados, zero falhas. Log `examples/app/data/m20-tests.txt`.
- Quatro testes novos: autorização/entradas/idempotência por consultoria; conclusão e outbox sem duplicação; intervalos e sucesso na terceira; falha definitiva preservada e sem outbox de sucesso.

## Roteiro humano
1. Abrir `/master/operacao` como Master. Enfileirar sucesso imediato com justificativa fictícia.
2. Processar próxima tarefa pronta; conferir conclusão e evento pendente. Confirmar entrega fictícia; repetir e verificar que não duplica.
3. Enfileirar cenário de três falhas. Processar, aguardar 5 segundos, processar, aguardar 10 segundos, processar. Conferir fila de falhas e histórico com três tentativas.
4. Testar cenário de duas falhas e sucesso e conferir um único evento de saída. Atualizar a página para refletir prazos ou mudanças de outra janela.

## Limites e próxima fatia
JSON local e escrita síncrona sem coordenação entre processos: demonstração em processo único, sem garantias de fila distribuída ou entrega externa exatamente uma vez. O adaptador usado é puro e fictício; este desenho não resolve interrupção durante uma chamada real. Não há worker persistente, retenção, incidentes, exportação, bloqueio de descarte legal (legal hold), governança normativa ou auditoria completa de acessibilidade/performance; esses itens do M20 permanecem pendentes. Não há reprocessamento de DLQ nesta primeira fatia. Não apagar histórico para simular recuperação.

EPERM observado anteriormente no ambiente restrito continua relevante. Testes fora da restrição não validam arquitetura de produção. Próximo passo: teste e aceite desta fatia para continuar governança/status/retencão demonstrativos do M20; integrações externas continuam fora do escopo autorizado.

## Evidência visual e estado final
Navegador: tarefa de sucesso concluída e entrega fictícia confirmada; segunda tarefa com três falhas, intervalos respeitados e histórico expandido. Estado final Horizonte: uma concluída, uma na fila de falhas, um evento entregue localmente; zero pendentes. Revisão desktop 1280 × 900 e celular 390 × 844 na área de histórico sem transbordamento visível; dimensões restauradas. Evidências assets/m20-desktop.jpg e assets/m20-celular.jpg.


Verificação visual inicial: M20_ACESSIBILIDADE_CHECKPOINT.md. M20 permanece aberto; build desta fatia bloqueado por EPERM.

Continuação: build aprovado em saída nova identificada; validação de formulário por teclado conferida. Detalhes em M20_ACESSIBILIDADE_CHECKPOINT.md.

Mensagens e fila em celular verificadas; build e lint aprovados. Evidências em M20_ACESSIBILIDADE_CHECKPOINT.md. M20 segue aberto.

Medição inicial do build de produção local concluída, com limites explícitos: M20_DESEMPENHO_CHECKPOINT.md. Sem publicação; aceite humano ainda pendente.

Consistência de vigência corrigida: M20_DATAS_CHECKPOINT.md. 104 testes, lint e build aprovados; painel lateral visível.

## Conferência visual de recuperação transitória

2026-10-11, tela lateral visível. Executado cenário fictício Duas falhas e sucesso na terceira na consultoria Horizonte. Enfileirada 13:53:00, primeira falha 13:53:04 (aguardar 5 s), segunda 13:53:17 (aguardar 10 s), conclusão 13:53:34. Um evento novo gerado e entregue exclusivamente localmente às 13:53:38. Repetição da confirmação retornou Nenhum evento pendente de consultoria ativa, sem duplicar evento. Histórico expandido e preservado; evidência assets/m20-recuperacao-transitoria.jpg.

Estado atualizado: três tarefas totais (duas concluídas, uma falha definitiva preservada), dois eventos entregues, zero tarefas/eventos pendentes. Nenhum envio externo. Sem mudança de código nesta conferência; testes/build não repetidos. Evidência automatizada mais recente: 104 testes e build aprovados na correção de datas.

Identificação dos históricos melhorada e conferida por teclado; ver M20_ACESSIBILIDADE_CHECKPOINT.md.

Roteiro consolidado atual: M20_ACEITE.md. Aceite humano final pendente; não confundir com liberação de produção.

## Aceite humano final
Usuário declarou explicitamente: APROVO O M20. M20 aprovado como demonstração fictícia com os limites registrados em M20_ACEITE.md. Sem autorização de produção ou integrações reais. M21 não iniciado neste registro.
