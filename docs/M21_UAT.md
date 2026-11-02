# UAT M21 — roteiro de aceite local

Data: 2026-10-11. Ambiente: demonstração local com dados fictícios. Este roteiro não autoriza publicação, integração externa, carga concorrente nem alteração/restauração de `data/`.

## Evidência automatizada já disponível

- Regressão anterior: 110 testes passaram antes das últimas fatias.
- Sessão: assinatura, expiração, adulteração e limites cobertos por `tests/session-token.test.ts`.
- Tenant/RBAC: escopo de tenant, associação de membro e negação por perfil cobertos por `tests/tenant-access.test.ts` e testes de serviços.
- Backup: manifesto/hash, adulteração e restauração isolada cobertos por `tests/m21-backup.test.mjs`.
- Concorrência: reprodução isolada confirma perda de atualizações no padrão JSON; não é benchmark.
- Saúde: respostas saudável/degradado cobertas por `tests/health-route.test.ts`.
- Rollback isolado: `tests/m21-rollback.test.mjs` confirma hash restaurado e preservação do estado simulado.

## Verificações visuais pelo usuário

Marcar cada item como aprovado, reprovado ou não executado; não usar cadastro, publicação ou exclusão para este aceite.

- [ ] Master: dashboard carrega e navegação principal funciona.
- [ ] Empresas: listagem abre e dados visíveis são fictícios; não salvar alterações.
- [ ] Documentos: listagem/visualização abre sem enviar, substituir ou arquivar arquivo.
- [ ] Auditoria: eventos exibidos pertencem ao contexto esperado; não exportar dados.
- [ ] Login/sessão: estado atual está compreensível; não compartilhar credenciais ou tokens.
- [x] Saúde: recarga da aba existente mostrou `{"status":"ok"}` em `http://127.0.0.1:3000/api/health`.
- [x] Conflitos visuais: usuário informou que não viu conflito na interface aberta.

## Limites e decisão

- A primeira abertura de `/api/health` mostrou erro de build: `dynamic = "force-dynamic"` conflita com `cacheComponents`. A configuração foi removida, e a recarga posterior da aba existente exibiu `{"status":"ok"}`; rota confirmada no servidor local.
- A solicitação de suíte completa isolada aguardou revisão de permissão e expirou sem iniciar. Não há resultado novo da suite completa nesta etapa; considerar somente as verificações focadas já registradas no checkpoint.
- Verificação focada após correção: 8 testes de health/backup/rollback/concorrência passaram; TypeScript e ESLint focado passaram.
- JSON local perde atualizações concorrentes; adequado apenas à demonstração de processo único. Sem métricas/alertas, backup externo criptografado ou RTO/RPO aprovados.
- Rollback real, publicação e integrações externas não foram feitos nem autorizados.

## Resultado humano

Status: aprovado pelo usuário em 2026-10-11, com ressalvas técnicas abaixo.

Itens reprovados/observações: preencher após inspeção.

Aceite M21: concedido explicitamente pelo usuário em 2026-10-11. A aprovação aceita o marco local/fictício, mas não substitui teste completo após as últimas mudanças e não remove os riscos listados. Publicação, integração real e rollback real continuam sem autorização.
