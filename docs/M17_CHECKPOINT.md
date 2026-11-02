# M17 — Assinaturas e ciclo comercial simulado

Entrega demonstrativa em 2026-10-11. Usuário aprovou o M16 e autorizou M17 com “aprovado, pode continuar”. Continuidade para M18 autorizada com “Continua” em 2026-10-11, registrando aceite para avanço da demonstração; não equivale à validação para produção.

## Entrega
- Área “Assinatura e cobranças · simulação” por consultoria no painel Master. Iniciar assinatura gera uma primeira cobrança pendente; próxima cobrança é emitida explicitamente. A assinatura ativa não significa que a cobrança esteja paga.
- Valores inteiros em centavos e cópia do plano/ciclo na cobrança. Cada emissão usa a base ilustrativa do catálogo atual, exibida no formulário. Adicionais sem preço. Alterar plano não reescreve cobrança anterior; revisão antiga de plano é rejeitada antes de emitir.
- Falha, reabertura, pagamento simulado, estorno integral, abertura de disputa e resolução favorável/perdida. Transições inválidas são recusadas no servidor. Disputa perdida termina como estornada; eventos distinguem a origem desse estado.
- Cancelar assinatura impede novas emissões nessa assinatura, preserva cobranças anteriores e permite eventos nelas. Pode iniciar uma nova assinatura após resolver pendências, falhas e disputas. Não altera acesso da consultoria, limites, módulos ou créditos.
- Nova emissão bloqueada enquanto houver cobrança pendente, com falha ou em disputa; suspensão da consultoria bloqueia início/emissão. Eventos de liquidação, cancelamento e conferência permanecem disponíveis ao Master.
- Conferência de extrato fictício por estado e valor: registra igualdade/divergência sem alterar silenciosamente a cobrança. Não consulta provedor, banco ou extrato real.
- Somente Master no servidor; alvo validado, busca de cobrança restrita à consultoria, justificativa, confirmação, revisão do ciclo e limite administrativo compartilhado de 20 ações por minuto/conta/processo.
- Identificador de operação e resumo criptográfico do comando persistidos: repetição idêntica não duplica; reutilizar identificador com valores diferentes falha. Arquivo JSON preserva assinatura, cobranças e eventos numa gravação conjunta. Auditoria da plataforma não copia justificativas.

## Como testar
1. Abra http://127.0.0.1:3000/master. Perfil Master fictício: `master@ssthoje.local` / `MasterFicticio2026!`.
2. Se precisar iniciar: na pasta examples/app, execute `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1`.
3. Em Horizonte, expanda “Assinatura e cobranças · simulação”. A assinatura ficou ativa, com uma cobrança fictícia de R$ 99,00 paga e quatro eventos preservados.
4. Abra “Conferir extrato da cobrança 1”. Estado Paga e 9900 centavos devem conferir. Outra combinação deve mostrar divergência, mantendo o estado da cobrança.
5. Em “Gerenciar assinatura simulada”, gere próxima cobrança com justificativa fictícia e confirmação. Deve aparecer outra cobrança pendente com a base atual do plano.
6. Abra os eventos da cobrança nova. Simule falha, confira o estado, reabra ou simule pagamento. Ao pagar, passam a estar disponíveis estorno e disputa. Confira cada resultado no histórico.
7. Simule disputa e resolução favorável; o estado retorna a Paga. Alternativamente, resolução perdida resulta em Estornada. Estorno integral só é permitido em Paga.
8. Cancele em “Gerenciar assinatura simulada”. Histórico e cobranças devem continuar visíveis, e gerar próxima cobrança deixa de ser uma opção. Novo início cria outra assinatura histórica, desde que não haja pendência/falha/disputa em aberto.
9. Confira que Aurora mantém assinatura não iniciada e nenhum evento comercial. Nenhuma ação deve alterar o estado de acesso da Horizonte.

## Funcional e simulado
Funcionais localmente: persistência, validação, controle de acesso, revisão, prevenção de duplicação, transições e conferência de valores informados. Todos os eventos financeiros são fictícios, iniciados pelo formulário do Master. Sem pagamentos reais, cartão, Pix, boleto, nota fiscal, contrato, webhook ou chamada externa. Não há renovação automática, vencimento, cálculo proporcional, estorno parcial ou liberação automática de créditos. A integração com provedor e adapters externos permanece no M19.

## Verificações executadas
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit`, aprovado.
- ESLint nos arquivos alterados/novos e tests/billing.test.ts, aprovado. Repetido no dashboard após inclusão dos rótulos de auditoria e ajuste do texto do rodapé, também aprovado.
- Build: `node node_modules/next/dist/bin/next build`, aprovado, com compilação, tipos e geração das páginas. As últimas alterações posteriores ao build foram apenas rótulos/texto do dashboard, sem alterar o fluxo.
- Suite completa final, em diretório temporário fora da restrição local, usando caminhos absolutos dos testes: `node --experimental-strip-types --test --test-concurrency=1 <app>/tests/*.test.ts <app>/tests/*.test.mjs`: 74 aprovados, zero falhas. Seis testes novos cobrem Master/alvo/entradas, duplicação e revisão, falha/estorno, disputa/cancelamento, conferência e cópia de preço/plano.
- A primeira execução restrita no diretório da aplicação teve 73 aprovações e uma falha EPERM em rename de platform.json, num teste anterior de módulos. Outra execução restrita em pasta temporária teve 19 aprovações/55 falhas, incluindo erros EPERM de substituição JSON. A execução temporária fora dessa restrição passou integralmente. Isso não prova falha exclusiva do OneDrive; não foi inserida repetição automática na persistência para esconder erros.
- Logs preservados: examples/app/data/m17-test-result.txt, m17-test-final.txt e m17-test-unsandboxed.txt. Diretórios de dados fictícios dos testes foram preservados; dados reais da aplicação não foram usados nos testes automatizados.
- Navegador: início de assinatura e cobrança pendente, falha, pagamento após falha, conferência divergente mantendo Paga. Revisão visual 1280 × 900 e 390 × 844; sem transbordamento visível nas áreas observadas. Tamanho padrão restaurado.
- Evidências: assets/m17-desktop.jpg e assets/m17-celular.jpg.

## Estado final para teste
Horizonte: assinatura simulada ativa, uma cobrança de R$ 99,00 paga; quatro eventos (início, falha, pagamento, conferência divergente). Aurora: sem assinatura/eventos comerciais. Acesso, módulos, limites e créditos M16 preservados. Nenhum meio de pagamento cadastrado.

## Arquivos alterados
Novos na aplicação: src/lib/billing-types.ts, billing-store.ts, billing-service.ts; src/app/master/billing-actions.ts e billing-panel.tsx; tests/billing.test.ts.
Alterados: src/lib/platform-store.ts (limite de ações reutilizado), audit-log.ts (tipos dos eventos); src/app/master/page.tsx, master-dashboard.tsx e master.css.
Persistência demonstrativa: data/billing.json e eventos em data/audit-log.jsonl; diretório data permanece ignorado pelo Git.
Documentação: aceite nos checkpoints M16, este documento, CHANGELOG.md e DECISION_LOG.md. Evidências em assets.

## Riscos e próximo passo
JSON local sem banco transacional, assinatura de provedor ou coordenação entre processos. Não é arquitetura de produção. O erro EPERM no ambiente restrito continua relevante para execução local e deve ser investigado antes de produção. Histórico é preservado por append no modelo da aplicação, sem proteção externa contra edição manual de arquivo. Idempotência e revisão garantidas apenas no processo local síncrono desta demonstração. Próximo passo: teste e aceite humano do M17 antes de iniciar M18.
