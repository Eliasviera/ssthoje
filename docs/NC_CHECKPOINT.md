# Não conformidades — checkpoint inicial (2026-10-24)

- Estado: primeira fatia pronta para teste humano local; aceite pendente.
- URL: http://127.0.0.1:3107/nao-conformidades
- Como iniciar: ABRIR-PAINEL.cmd na raiz; abrir o link Relatórios de não conformidade na seção APR.
- Conta demo: mesma sessão demonstrativa do painel; instruções de acesso em M02_CHECKPOINT.md. Perfil com permissão pgr.manage. Nenhuma nova credencial criada.
- Dados: empresas/unidades fictícias existentes, sem ocorrência criada pela automação.

## Funcionalidade

Registro manual de empresa/unidade, título, local, descrição, evidência textual, plano de correção, responsável informado e prazo interno. Fluxo: aberta → em correção → aguardando revisão → encerrada pela equipe. A revisão pode devolver para correção e o encerramento pode ser reaberto. Cada etapa exige observação, conta autenticada e data; histórico e campos originais preservados. Registro e evento ficam no mesmo arquivo gravado atomicamente.

Actions e página exigem pgr.manage; tenant/ator vêm da sessão, e a criação confere empresa/unidade no servidor. Controle de revisão evita submissão desatualizada no processo local. Sem aprovação automática, decisão normativa ou liberação de atividade.

## Teste humano

1. Abrir a URL na sessão demo, expandir Registrar não conformidade e selecionar empresa/unidade fictícias.
2. Informar apenas dados fictícios e registrar: deve aparecer uma ocorrência aberta, revisão 1, com histórico da conta que registrou.
3. Registrar início da correção com observação: deve passar para Em correção.
4. Descrever evidência da correção e enviar para revisão: deve passar para Aguardando revisão.
5. Registrar a avaliação humana e encerrar, ou devolver para correção: todo o histórico deve permanecer.
6. Reabrir uma ocorrência encerrada com justificativa: deve voltar para Em correção preservando o encerramento anterior.
7. Em duas abas, tentar atualizar uma revisão antiga: deve pedir atualização sem sobrescrever o registro atual.

## QA

- Nove testes focados (quatro NC + cinco APR): aprovados. Casos cobrem isolamento de tenant, datas inválidas, limites de entrada, revisão antiga, transições proibidas, devolução, encerramento, reabertura e preservação do histórico. Fixtures temporárias sintéticas fora do sandbox por restrição de rename.
- TypeScript e ESLint focado aprovados antes do ajuste final da seleção conjunta; resultados finais registrados abaixo.
- UI autenticada: página, link de acesso, estado vazio, expansão do formulário, opções empresa/unidade e seleção conferidos no painel estreito; captura NC_VALIDACAO_2026-10-24.png. Sem submissão de ocorrência persistente, portanto ciclo completo pela UI ainda pendente.
- Build isolado: compilação e etapa TypeScript passaram; build completo falhou no prerender da rota existente /configuracoes/terceiros por acesso a dados runtime fora de Suspense. Sem alteração nessa rota. Também houve aviso de padrão amplo em /api/health. O build não está aprovado. Inclusões temporárias do build no tsconfig foram removidas.

## Limites

Demonstração JSON local sem criptografia em data/nonconformities.json (ignorado pelo Git), sem migration ou banco persistente alterado. Sem anexos, PDF/exportação, vínculo automático à APR, assinatura, notificação ou inclusão no painel de prazos. Evidência textual é declaração da equipe. Responsável informado não equivale à conta autenticada nem identidade verificada. Histórico próprio por ocorrência; não integrado à lista global de auditoria. Armazenamento de processo único, sem garantia de concorrência entre múltiplos servidores. Não adequado para produção/dados reais.

## Arquivos

- examples/app/src/lib/nonconformity-store.ts
- examples/app/src/app/nao-conformidades/{page.tsx,section.tsx,actions.ts}
- examples/app/src/app/safety-operations-section.tsx (link de acesso)
- examples/app/tests/nonconformity-store.test.ts
- docs/NC_CHECKPOINT.md e docs/NC_VALIDACAO_2026-10-24.png
- docs/APR_CHECKPOINT.md e docs/RETOMAR_PROJETO.md (retomada e aceite de sequência)

## Decisão

Conferir a primeira fatia antes de iniciar ficha/estoque de EPI. Aprova esta etapa ou quer correções?

Validação final após ajuste do seletor: TypeScript (`node node_modules/typescript/bin/tsc --noEmit`) e ESLint dos arquivos NC/link APR/testes concluídos com exit code 0. Reexecução dos nove testes focados aprovada (9/9). Build segue bloqueado conforme descrito acima.

2026-10-24: usuário respondeu “continua” ao pedido de aceite; interpretado como aceite da primeira fatia de não conformidades e autorização para ficha/estoque EPI. Não comprova execução do roteiro humano nem aprova conteúdo técnico. Ver EPI_ESTOQUE_CHECKPOINT.md.

Atualização 2026-10-24: bloqueio de build em /configuracoes/terceiros corrigido com Suspense/connection durante preparação PT/PTE. Build isolado completo final aprovado, incluindo /nao-conformidades. Limitações funcionais descritas neste checkpoint permanecem. Ver PT_PTE_CHECKPOINT.md.
