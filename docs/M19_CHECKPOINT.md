# M19 — Primeira fatia: bancada local de contratos

Atualização de escopo: usuário determinou usar tudo fictício e autorizou continuidade. Ver M19_FICTICIO_CHECKPOINT.md para entrega de código local e critério de avanço demonstrativo; contas externas não são exigidas neste escopo. Integração real não concluída.

2026-10-11. Continuidade autorizada com “continua” após M18; aceite para avanço da demonstração registrado. Após disponibilização da bancada, usuário solicitou “continua”, autorizando o complemento descrito em M19_ASAAS_RECEPTOR_CHECKPOINT.md. Integrações com provedores ainda pendentes. M20 não iniciado.

## Entrega
- `/master/integracoes`, com entrada no painel Master. Acesso verificado no servidor, consultoria fictícia ativa validada, justificativa, limite administrativo compartilhado e auditoria.
- Adaptadores internos para e-mail/OTP, cobrança e assistência por IA. Respostas fixas, sem rede, dados pessoais, credenciais ou SDKs externos. Não autentica OTP, liquida cobrança M17, consome créditos M16 ou altera documentos.
- Cenários: sucesso, evento duplicado, assinatura inválida, falha de transporte. Verificação HMAC SHA-256 e comparação em tempo constante sobre mensagem interna fictícia; duplicação dentro do cenário processa somente uma vez.
- Idempotência persistida da requisição por consultoria, integração e chave. Repetir mesma requisição retorna registro anterior; mudar cenário com mesma chave é recusado. Histórico de execuções/eventos preservado; tela mostra últimos 30.
- Persistência em `data/integration-sandbox.json`, ignorada pelo Git. Segredo aleatório interno somente em memória por processo; não é segredo de fornecedor nem autenticação de webhook externo. Não há endpoint público de callbacks.

## Arquivos
Novos: `src/lib/integration-adapters.ts`, `integration-store.ts`, `integration-service.ts`; `src/app/master/integracoes/page.tsx`, `panel.tsx`, `actions.ts`; `tests/integrations.test.ts`.
Alterados: `src/lib/audit-log.ts`, `src/app/master/master-dashboard.tsx`. Documentação: este checkpoint, M18_CHECKPOINT.md, CHANGELOG.md, DECISION_LOG.md. Evidências: `assets/m19-desktop.jpg`, `assets/m19-celular.jpg`.

## Verificação executada
- `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
- ESLint dos arquivos novos e alterados: aprovado.
- `node node_modules/next/dist/bin/next build`: aprovado, incluindo `/master/integracoes`.
- Suite completa em pasta temporária fora da restrição Windows: `node --experimental-strip-types --test --test-concurrency=1 <app>/tests/*.test.ts <app>/tests/*.test.mjs`: 82 testes, 82 aprovações, zero falhas; log `examples/app/data/m19-tests.txt`. Primeira rodada falhou por chave de fixture contendo sublinhado não permitido; corrigida a fixture e repetida a suite completa.
- Testes novos: acesso Master/entradas, integridade da assinatura, três adaptadores e duplicação, recusa/falha, idempotência por consultoria e ausência de mutações em billing/plano.
- Navegador: quatro registros Horizonte — e-mail/OTP duplicado ignorado, cobrança com assinatura recusada, IA com falha, IA com resposta fixa aceita. Revisão visual 1280 × 900 (histórico) e 390 × 844 (formulário), sem transbordamento visível nessas áreas. Dimensões restauradas.

## Roteiro para teste humano
1. Como Master, abrir `http://127.0.0.1:3000/master/integracoes`.
2. Selecionar consultoria, integração e cenário; informar justificativa fictícia e executar.
3. Conferir resultado e eventos no histórico. No cenário duplicado, verificar um Aceito e um Duplicado ignorado; na assinatura inválida, verificar Evento recusado sem resultado.
4. Conferir que cobrança e consumo dos marcos anteriores permanecem independentes da bancada.

## Próxima fatia e limites
M19 ainda requer implementações específicas para ambiente sandbox dos fornecedores, mapeamento de eventos, autenticação conforme documentação oficial, endpoint de webhook, idempotência durável de callbacks recebidos entre requisições/processos e testes reais de contrato. HMAC desta bancada não comprova compatibilidade com Asaas, SMTP ou OpenAI. Não há envio nem pagamento; OTP de autenticação real permanece fora desta fatia.

Antes de qualquer efeito externo: selecionar fornecedor/conta de teste, destino fictício autorizado e limites de uso; configurar segredos somente no servidor, fora do chat e do Git; verificar documentação oficial vigente; então testar uma integração por vez. Não solicitar segredos no chat. A preparação local não autoriza cobrança ou produção.

JSON local e idempotência síncrona não coordenam múltiplos processos. Não há fila, retry, DLQ ou outbox (M20); falhas ficam registradas, sem reenvio automático. Erros EPERM do ambiente restrito observados anteriormente continuam relevantes; testes executados fora da restrição, sem inserir retries para mascarar falhas. Histórico local não possui proteção externa contra edição manual.
