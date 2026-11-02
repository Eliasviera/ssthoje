# M21 — Segurança, regressão e preparação de lançamento

Status: ACEITO PELO USUÁRIO EM 2026-10-11, com ressalvas técnicas registradas abaixo. Usuário autorizou avançar ao M21 e pediu deixar a montagem conjunta da empresa fictícia para depois. M20 aprovado explicitamente. Escopo permanece local e fictício; nenhuma autorização para publicação ou integração real.

## Primeira fatia: baseline

Suite completa executada em diretório temporário isolado: 104 testes aprovados, zero falhas, aproximadamente 7,5 s. Comando node --experimental-strip-types --test --test-concurrency=1 com tests/*.test.ts e tests/*.test.mjs. Log examples/app/data/m21-baseline-tests.txt. Não houve alteração de código; build não repetido. Último build aprovado: m20-20261011135919.

Inspeção pontual de src/lib/session.ts: assinatura HMAC, comparação timingSafeEqual, segredo com mínimo de 32 bytes, duração de 8 h, cookie httpOnly, sameSite=lax, secure em production, validação de conta e expiração. Inspeção não substitui teste de adulteração/expiração nem auditoria de segurança. Não foram lidos ou copiados valores de .env.local.

## Portões de lançamento

| Item | Situação |
|---|---|
| Regressão atual | 110 testes aprovados em pasta temporária isolada |
| Autorização e isolamento | Cenários da suite existentes; revisão abrangente pendente |
| Backup e restauração isolada | Cópia atual validada e restauração isolada conferida; ferramenta local disponível |
| Segurança de sessão e entradas | Testes dedicados de token e limites reforçados; revisão abrangente de entradas pendente |
| Carga/concorrência | Ensaio controlado confirmou perda de atualizações no padrão JSON sem trava; benchmark de throughput e limite operacional ainda pendentes |
| Observabilidade | Rota local de saúde mínima e testes adicionados; alertas, métricas e operação de produção pendentes |
| Rollback | Procedimento local documentado e ensaio isolado aprovado; rollback real permanece manual e não autorizado |
| UAT final M21 | Usuário aprovou explicitamente em 2026-10-11; endpoint de saúde local confirmou `{"status":"ok"}`; suíte completa após as mudanças atuais: 127 testes aprovados em 2026-10-12 |
| Publicação | Bloqueada; não autorizada nesta etapa |

## Fatia 1 — backup e restauração isolada

Implementado `examples/app/scripts/m21-backup.mjs`, com comandos locais para criar backup, conferir integridade por SHA-256 e restaurar em um diretório temporário novo. O backup contém a pasta `data/`, inclusive PDFs e registros JSON/JSONL, e um manifesto sem caminho de origem. Arquivos `.env*`, dependências e código ficam fora por estarem fora de `data/`. Artefatos de testes conhecidos (`*-tests-*`, `mNN-*-tests*.txt` e `m21-baseline-tests.txt`) são excluídos; arquivos temporários `.tmp` fazem a operação falhar.

A criação exige `--confirm-app-stopped`, recusa destino existente ou dentro/contendo a pasta do aplicativo, detecta mudanças ocorridas durante a cópia e valida o backup após gravar. Links simbólicos e tipos especiais são recusados. A restauração só aceita o destino temporário gerado pela ferramenta, valida o manifesto antes e depois da cópia e grava `.sst-m21-isolated-restore.json`. Não há comando para restaurar sobre o app.

Comandos, a partir de `examples/app` no PowerShell:

```powershell
pnpm backup:data backup "$env:TEMP\sst-hoje-backup-20261011" --confirm-app-stopped
pnpm backup:data verify "$env:TEMP\sst-hoje-backup-20261011"
pnpm backup:data restore "$env:TEMP\sst-hoje-backup-20261011"
```

Verificação desta fatia: `node --test tests/m21-backup.test.mjs` — 3 testes aprovados. Suíte completa em pasta temporária isolada — 110 testes aprovados, zero falhas após incluir os testes de sessão. ESLint e TypeScript aprovados. Build de produção isolado `.next-verify-m21-security-20261011` aprovado, 19 rotas geradas. Cobertos: hash/manifesto, arquivos binários, exclusão de artefato conhecido, destino existente, arquivo `.tmp`, adulteração e restauração isolada.

Ensaio do armazenamento local concluído em 2026-10-11, após confirmar ausência de processos Node e ouvintes do app nas portas 3000–3010. Backup `examples/backup-m21-20261011`: 29 arquivos, 928.468 bytes. `verify` confirmou a integridade; `restore` criou e conferiu cópia isolada em diretório temporário com marcador. Nenhum arquivo de `.env` foi incluído. A restauração não alterou `examples/app/data`.

A cópia lê vários arquivos sequencialmente; hash e detecção de mudanças reduzem risco de cópia instável, mas não equivalem a snapshot transacional do conjunto. O backup não é criptografado e deve permanecer em local protegido; usar somente dados fictícios neste projeto.

## Fatia 2 — sessão e cabeçalhos do navegador

Extraída a codificação/verificação HMAC para `src/lib/session-token.ts`, preservando o cookie HttpOnly, SameSite=Lax e Secure em produção. A verificação limita o token a 2 KiB, valida formato/tipos/conta/e-mail, exige expiração inteira futura de no máximo oito horas e compara a assinatura com `timingSafeEqual`. Três testes dedicados cobrem sessão válida, adulteração, assinatura inválida, conta/e-mail desconhecidos, expiração, duração excessiva, tamanho e segredo curto.

`next.config.ts` aplica em todas as rotas `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`. A revisão pontual das fronteiras encontrou verificação de sessão/perfil em ações administrativas e escopo do tenant nos serviços; portais públicos usam tokens com expiração e limites de consulta. A documentação local do Next.js confirma proteção de Server Actions por POST e comparação Origin/Host. Esse exame não é auditoria independente nem teste dinâmico completo.

Limites: contadores de tentativas e armazenamento JSON são locais ao processo, sem coordenação entre instâncias. Não há política CSP/HSTS nesta configuração local. Isso mantém o M21 de preparação local e não habilita uso de produção.

Revisão inicial de autorização/sessão/entradas concluída nesta etapa, sem falha crítica identificada na leitura das fronteiras inspecionadas. Os testes atuais cobrem isolamento e permissões dos serviços, além da sessão HMAC. Próxima fatia: carga/concorrência e registrar limites observados. Depois: observabilidade, plano e ensaio de rollback e percurso UAT M21. Publicação e integrações reais continuam bloqueadas e não autorizadas.

Após o M21, a empresa fictícia Teste Caldeiraria, Montagens e Pintura foi criada e preenchida em conjunto, sem semeadura automática. Em 2026-10-12, os 20 placeholders de trabalhadores foram substituídos por nomes e sexo demonstrativos fictícios (10 Feminino, 10 Masculino); o vínculo `elias` e a empresa M08 foram preservados. Não há CPF, endereço, contato ou data de nascimento nos dados adicionados. Backup parcial dos placeholders mantido em `examples/backup-workers-fictitious-20261012/`. TypeScript e suíte completa (127 testes) passaram. O usuário informa ser responsável técnico e confirmou manter `Outro` como categoria para riscos adicionais não contemplados nas opções listadas; preservar as escolhas atuais, sem inferir categorias por função. Ver também `docs/RETOMAR_PROJETO.md`.

## Fatia 3 — concorrência do armazenamento local

`examples/app/scripts/m21-concurrency-probe.mjs` reproduz, somente em diretório temporário, o padrão usado pelos stores JSON: vários escritores leem o mesmo snapshot, acrescentam registros independentes e publicam arquivos completos. Com oito snapshots concorrentes, uma atualização permanece e sete são perdidas. O teste não chama endpoints nem toca `examples/app/data`; não é benchmark de throughput da aplicação.

Resultado: probe isolado — 8 snapshots, 1 persistido, 7 atualizações perdidas. A atomicidade do rename protege contra JSON parcialmente escrito, mas não coordena leitura-modificação-gravação entre processos. Portanto, o armazenamento atual só é adequado a uso local de processo único e não deve receber múltiplos workers/instâncias nem escritas concorrentes. Antes de escalar, migrar para armazenamento transacional com controle de concorrência e repetir teste com operações reais; nenhuma publicação está autorizada.

Próxima fatia: definir métricas e política operacional de observabilidade local; em seguida plano/ensaio de rollback e UAT M21. Benchmark de carga da aplicação permanece pendente até haver backend transacional e ambiente isolado apropriado.

## Fatia 4 — observabilidade local

Adicionada `GET /api/health`: responde `200 {"status":"ok"}` se a pasta de dados local está acessível, ou `503 {"status":"degraded"}` caso contrário. Respostas não são armazenadas em cache e não expõem versão, caminho, tenant ou conteúdo. Dois testes cobrem os estados saudável/degradado. A auditoria de negócio já existente continua em `data/audit-log.jsonl` e não substitui logs operacionais.

Limite: a verificação confirma apenas acessibilidade da pasta, não integridade de todos os JSON, disponibilidade futura, capacidade, alertas ou funcionamento de dependências externas. Esta demonstração não possui agregador de logs, métricas, alertas nem plantão. Em execução local, consultar `http://127.0.0.1:3000/api/health` e os logs do processo; em falha, preservar os arquivos, parar novas alterações e seguir o procedimento de backup/rollback ainda a definir. Não utilizar essa rota como garantia de produção.

Verificação desta fatia: `node --experimental-strip-types --test tests/health-route.test.ts tests/m21-concurrency.test.mjs` — 4 testes aprovados; `pnpm typecheck` aprovado. ESLint tentou executar, mas falhou lendo arquivo (`UNKNOWN: unknown error, read`) no ambiente sincronizado com OneDrive; sem diagnóstico de lint. A primeira tentativa direta de teste não carregou o alias `next/server` no Node standalone; o handler foi adaptado para resposta nativa para remover essa dependência do teste.

## Fatia 5 — plano e ensaio de rollback

Procedimento para incidente local:

1. Interromper novas alterações e registrar horário/sintoma sem copiar tokens ou dados pessoais para o relato.
2. Preservar a pasta `data/` atual para investigação; não apagá-la nem sobrescrevê-la.
3. Confirmar que nenhum processo do app está gravando. Criar backup novo com `--confirm-app-stopped` em uma pasta protegida fora do projeto e executar `verify`.
4. Restaurar o backup escolhido usando `restore`; a saída fica em diretório temporário novo e só é considerada pronta se hashes/manifesto forem válidos.
5. Comparar os dados restaurados com o estado esperado e fazer a decisão de recuperação com o responsável humano. A ferramenta atual não substitui `data/`, não troca código/build e não executa rollback automático.
6. Só após autorização humana, planejar a troca manual preservando a pasta original como cópia de retorno; documentar a origem, hashes, responsável e resultado. Não fazer essa troca durante o M21 sem pedido explícito.

Ensaio `scripts/m21-rollback-drill.mjs`/`tests/m21-rollback.test.mjs`, em fixture fictícia temporária: backup criado, alteração posterior simulada, manifesto verificado e snapshot restaurado com hash idêntico ao anterior; fixture ativa permaneceu com a versão posterior e o marcador confirmou restauração isolada. `node --test tests/m21-rollback.test.mjs tests/m21-backup.test.mjs` — 4 testes aprovados; `pnpm typecheck` aprovado. Isso valida cópia/recuperação de arquivo, não tempo de recuperação, restauração da aplicação/build, processo operacional humano nem recuperação de produção.

Não há RTO/RPO aprovados (tempo/ponto de recuperação), backup criptografado ou cópia externa. O backup local pode estar no mesmo disco e deve conter apenas dados fictícios. Rollback real exige autorização explícita, parada confirmada do app e cópia adicional validada.

## Fatia 6 — UAT e aceite humano

Roteiro manual em `docs/M21_UAT.md`. O usuário informou que não viu conflito na interface e aprovou explicitamente o M21 em 2026-10-11. A abertura visual de `/api/health` revelou incompatibilidade de `dynamic = "force-dynamic"` com `cacheComponents`; removida a configuração da rota. Após recarregar a aba existente, o browser exibiu `{"status":"ok"}`; endpoint local confirmado. A solicitação da suite completa isolada expirou durante revisão de permissão antes de iniciar; sem resultado novo. Não foram executadas ações de escrita na UI.

Aceite humano registrado; M21 concluído no escopo local/fictício, com ressalvas. Não interpretar o aceite como aprovação de produção ou autorização para publicar. Riscos técnicos abertos permanecem: armazenamento JSON sem coordenação, teste de carga real pendente, observabilidade limitada, backup sem criptografia/cópia externa e recuperação sem RTO/RPO.

Atualização 2026-10-12: após o cadastro dos 20 trabalhadores fictícios e inclusão do campo demonstrativo de sexo, TypeScript e 127 testes passaram. ESLint focado nos arquivos alterados de trabalhadores foi reexecutado e terminou com código 0. A categoria `Outro` segue válida para riscos adicionais não listados; valores existentes foram preservados sem inferência por função.

Correção após inspeção do UAT: removida exportação `dynamic` incompatível em `src/app/api/health/route.ts`. `node --experimental-strip-types --test tests/health-route.test.ts tests/m21-concurrency.test.mjs tests/m21-rollback.test.mjs tests/m21-backup.test.mjs` — 8 testes aprovados; `pnpm typecheck` aprovado; ESLint focado nos arquivos alterados aprovado. Recarregamento posterior confirmou `{"status":"ok"}` servido em `/api/health`.
