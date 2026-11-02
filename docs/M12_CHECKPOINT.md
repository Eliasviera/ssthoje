# M12 — Pendências, correção e reavaliação

Usuário autorizou o avanço ao responder “continua” ao checkpoint M11. Após entrega deste checkpoint, respondeu “pode continuar”, aceitando avançar a demonstração ao M13. Não representa validação profissional ou liberação para produção.

## Entrega e permissões
- Área Pendências conecta recebimentos de terceiros a motivo, correção solicitada, evidência interna e responsável ativo da mesma consultoria.
- Administradora/SST podem abrir, atribuir e comentar pendências; somente o responsável atribuído pode reavaliar após reenvio. Revisão interna não equivale a aprovação de conformidade. Políticas definitivas de reavaliação/dupla aprovação permanecem abertas para produção.
- Portal mostra motivo e correção solicitada, sem responsável, comentários ou evidências internos. Permite reenvio apenas quando há correção aberta para aquela categoria e convite.
- Reenvio cria novo arquivo/protocolo vinculado ao anterior, sem apagá-lo. Estados: aguardando correção, aguardando reavaliação e resolvida internamente. Nova solicitação de correção preserva o histórico de instruções e evidências.
- Histórico inclui ator, data, protocolo e comentários; downloads de cada versão exigem autenticação e tenant correto. Atualizações exigem revisão atual do registro, impedindo sobrescrita por formulários antigos.
- Administradora pode gerar novo link local por 24 horas, invalidando o anterior e preservando documentos/pendências. Convites revogados não podem ser renovados.
- Filtros de ativas, minhas ativas e todas. Avaliações pendentes/inconclusivas do M07 aparecem com acesso ao fluxo existente de Documentos; não são automaticamente aprovadas pelo M12.

## Verificação executada
- `node --experimental-strip-types --test tests/*.test.ts`: 35 testes passaram; sete novos testes cobrem permissões, atribuição, ciclo completo, isolamento, versões antigas, correção repetida, renovação, preservação e auditoria.
- `node node_modules/typescript/bin/tsc --noEmit`: passou.
- `node node_modules/eslint/bin/eslint.js src/app/issue-section.tsx src/app/envio/portal.tsx src/app/third-party-section.tsx src/app/third-party-actions.ts src/app/page.tsx src/app/dashboard.tsx src/lib/third-party-store.ts src/lib/third-party-service.ts src/lib/audit-log.ts tests/third-party-issues.test.ts`: passou.
- Navegador: pendência criada para PGR fictício recebido no M11, atribuída à administradora; portal mostrou instruções; reenvio de `assets/teste.pdf` gerou novo protocolo; comentário interno registrado; reavaliação fictícia encerrada. Dois PDFs e quatro eventos preservados. Mesmo PDF reutilizado intencionalmente para teste do fluxo, sem atestar correção real de conteúdo.
- Layout conferido em 390×844 e 1280×900. Tela móvel sem transbordamento horizontal do conteúdo. Tamanho temporário restaurado ao final.
- Evidências: `assets/m12-reenvio.png`, `assets/m12-celular.png`, `assets/m12-pendencias.png`.
- Reatribuição, solicitação de nova correção, renovação e restrição a outros perfis/consultorias foram verificadas nos testes automatizados; não houve troca de perfis no navegador neste marco. Não foi executado build de produção.

## Arquivos alterados
- Novos: `examples/app/src/app/issue-section.tsx` e `examples/app/tests/third-party-issues.test.ts`.
- Atualizados: `src/lib/third-party-store.ts`, `third-party-service.ts`, `audit-log.ts`; `src/app/third-party-actions.ts`, `third-party-section.tsx`, `envio/portal.tsx`, `page.tsx`, `dashboard.tsx`, `globals.css`.
- Documentação: M11_CHECKPOINT, DECISION_LOG, CHANGELOG e este checkpoint.

## Limitações e roteiro de aceite
Somente dados fictícios não clínicos. Sem envio externo, prazo legal padrão, assinatura, notificações ou aprovação automática. Arquivos/JSON locais continuam sem criptografia, antivírus, banco transacional ou garantias de produção; limitações do M11 permanecem. Posse do link não comprova identidade.

Na tela ao lado, Pendências está no filtro Todas para mostrar o exemplo resolvido. Abra o histórico para conferir eventos e baixar as duas versões. Para testar outra correção: Abra pendência → selecione o recebimento atual e responsável → informe motivo/instruções públicos e evidência interna. Em Terceiros, gere novo link local e abra o portal; reenvie PDF fictício. Retorne a Pendências para comentar, reatribuir ou reavaliar com a conta responsável. Resolver encerra apenas a pendência interna.

Próxima etapa após aceite: M13 — EPI e aceite fictício do trabalhador, com fluxo mock de link/OTP.
