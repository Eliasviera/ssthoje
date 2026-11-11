# Análise de pendências — SST Hoje

**Data:** 2026-11-03 21:13 (America/Sao_Paulo)
**Autor:** Meu assistente (análise automatizada, sem alteração de código, dados ou banco)
**Objetivo:** mostrar o que já está pronto, o que falta e o que está travando o projeto hoje.

---

## 1. Retrato do projeto

| Item | Estado medido |
|---|---|
| Stack | Next.js 16.4.2 · React 19.3 · TypeScript 5 · Tailwind 4 · PostgreSQL 17 (Docker) |
| Código-fonte | 357 arquivos, ~24.700 linhas em `examples/app/src` |
| Migrations aplicáveis | 13 (`0001`–`0013`) |
| Testes | 568 testes, **552 aprovados, 15 falhas, 1 ignorado** |
| TypeScript (`tsc --noEmit`) | **Passou, 0 erros** |
| ESLint | **10 erros, 4 avisos** |
| Milestones | M00–M22 documentados; M20 e M21 aceitos; **M22 em andamento** |
| Banco local | container `app-db-1` existe, mas **parado**; app **não está rodando** (porta 3107 fechada) |

Leitura curta: a base é sólida e bem documentada. O que falta não é "mais tela" — é
**fechar a persistência (M22)**, **limpar a dívida técnica acumulada** e **decidir os
pontos comerciais/jurídicos** que estão na lista de perguntas abertas.

---

## 2. O que já está pronto (funcional no código)

- Login por sessão assinada, escopo de tenant e permissões verificadas no servidor.
- Painel da consultoria: Empresas, PGR, Documentos, PCMSO, ASO, Terceiros, EPI,
  Pendências, Não conformidades, DDS, Permissões de Trabalho (PT/PTE), eSocial, Relatórios.
- Painel Master: billing, planos, convites, governança, operações, conteúdo do site, integrações.
- Landing page (`/site`) com CMS local em PostgreSQL.
- Portal público de envio de terceiros (`/convite/[token]`), relatório documental de contratadas.
- Auditoria append-only, versionamento documental, ficha e estoque de EPI, fluxo de correção
  e reavaliação de pendências.
- Testes de isolamento multi-tenant em boa parte dos domínios.

---

## 3. Pendências por prioridade

### P1 — Bloqueiam o uso real do sistema

1. **M22 não fechado: dois mundos de dados convivendo.**
   - PGR, PCMSO e Site CMS já usam PostgreSQL.
   - **Terceiros, Empresas, ASO, EPI, Operações e Master ainda leem JSON.**
   - O próprio `ACESSOS-PAINEIS.md` avisa: o snapshot de Terceiros foi importado para o
     PostgreSQL, mas o app continua lendo do JSON — portal, PDFs, pendências, aprovações e
     agendas ainda precisam migrar juntos, senão as fontes divergem.
   - Critério de fechamento (em `docs/M22_PLANO_FECHAMENTO.md`): um único cenário completo e
     auditável de Terceiros, do anexo de evidência até a decisão do gestor do cliente.
   - Bloqueio concreto registrado: não existe ponte autoritativa entre `invitation.id` (convite),
     `scopeId` (análise) e `workflow_id`/`third_party_id` (SQL candidato). Sem essa ponte,
     a interface de confirmação fica corretamente desabilitada.

2. **Autenticação e identidade ainda são de demonstração.**
   - `src/lib/demo-accounts.ts` monta as contas a partir de variáveis `SST_DEMO_*` do `.env.local`.
   - Não existe cadastro de usuários, recuperação de senha, nem provedor de identidade real.
   - Consequência: membership do PostgreSQL não autentica; o sistema não pode ir para produção assim.

3. **Armazenamento de arquivos privados não escolhido.**
   - O contrato de custódia de bytes existe e foi testado, mas o backend privado de produção
     (S3, R2, disco com política de locator) continua sem decisão.
   - Sem isso, ASO e documentos de terceiros não podem sair do fictício.

### P2 — Dívida técnica que já causa falhas hoje

4. **15 testes falhando.** Duas causas distintas:
   - **EPERM de rename no OneDrive** — a maioria (EPI, estoque, issues, plataforma). O projeto
     grava arquivos temporários dentro de `data/`, que está no OneDrive sincronizado; o Windows
     bloqueia o `rename`. **Isso não é bug de lógica, é bug de ambiente.**
   - **1 falha real de teste:** `tests/safety-checklist-suggestions.test.ts` espera o texto
     `/atividade diversa/` e recebe `'03 · APR Genérica'`. Teste e implementação divergiram —
     precisa de decisão: corrigir o teste ou o catálogo de checklists.
5. **10 erros de ESLint**, todos `no-explicit-any`, em dois arquivos:
   - `src/app/pgr-contractor-annex-section.tsx` (linha 94, 6 ocorrências)
   - `src/app/third-party-section.tsx` (linhas 24, 40, 60, 65)
6. **27 arquivos órfãos `*-Eliaseng.*`** em `src/` (ações, stores e seções duplicadas de PGR,
   PCMSO, ASO, Terceiros, clientes, documentos, sessão). **Nenhum arquivo do projeto os importa.**
   São ~27 arquivos de confusão: quem abrir o repositório não sabe qual é o bom.
7. **`data/` com 5.012 subpastas de teste** (`asaas-tests-*`, `issues-tests-*`, `platform-tests-*`)
   e **28 pastas `.next-verify-*`** de builds antigos. Isso infla o OneDrive, atrasa sincronização
   e é a origem provável do EPERM. O `audit-log.jsonl` já tem 7,6 MB.
8. **README desatualizado e contraditório.** `examples/app/README-Eliaseng.md` manda rodar
   `pnpm dev` na porta 3000 e diz que "não há banco de dados" — hoje é PostgreSQL na 3107.
   Quem seguir o README vai se perder.
9. **Build de produção bloqueado no Windows** (registrado em checkpoints de 2026-10-14):
   `next build` falha por acesso negado. O app só roda em modo dev.

### P3 — Decisões que faltam (não é código, é resposta sua)

10. **15 perguntas abertas em `docs/OPEN_QUESTIONS.md`** — as mais críticas para destravar:
    - Retenção, exclusão, exportação e legal hold de dados reais (ASO, documentos SST).
    - Base legal e retenção da foto do grupo e das assinaturas do DDS (LGPD de imagem).
    - Quem pode reavaliar pendências e o que exige dupla aprovação.
    - Fluxo de assinatura/aprovação de PGR/PCMSO/ASO por profissional habilitado.
    - SLAs, disponibilidade, backup e recuperação.
11. **Comercial e fiscal.** Os planos Essencial/Profissional/Avançada estão definidos
    (R$ 200 / 400 / 750), mas **não há CNPJ**, então cobrança real (Asaas) e formalização
    fiscal seguem bloqueadas.
12. **Validação profissional das regras SST.** O próprio `README.md` avisa: o blueprint não
    substitui validação jurídica, médica e normativa antes de produção.

### P4 — Riscos de segurança a corrigir

13. **Segredos em pasta sincronizada com OneDrive:** `.env.local` na raiz, outro em
    `examples/app/.env.local` (com `SESSION_SECRET` e senhas de banco) e um
    `chave 02 11 LightsailDefaultKey-us-east-2 (2).pem.txt` na Área de Trabalho.
    Devem sair do OneDrive. O `.gitignore` protege o git, **não protege o OneDrive**.
14. **Git fora do PATH nesta máquina.** O repositório existe (`.git` na raiz, 33 MB, branch
    `main`, último commit `9727166`), mas sem `git` instalado não há como versionar, revisar
    diffs ou reverter. Recomendo instalar o Git for Windows.
15. **Senhas de demonstração em texto claro** no `README-Eliaseng.md` (`SSTHojeDemo2026!` e
    outras). Aceitável para demo local; precisa sair antes de qualquer ambiente compartilhado.

---

## 4. Sequência recomendada (o que fazer primeiro)

| Ordem | Ação | Por quê |
|---|---|---|
| 1 | Tirar `.env.local`, `.pem` e senhas do OneDrive | risco real hoje, custo baixo |
| 2 | Limpar `data/*tests*` e `.next-verify-*`; apontar testes para `%TEMP%` | destrava ~14 dos 15 testes |
| 3 | Decidir o teste `safety-checklist-suggestions` (teste ou catálogo) | zera a suíte |
| 4 | Corrigir os 10 `any` do ESLint e remover os 27 arquivos `-Eliaseng` | deixa o repo legível |
| 5 | Instalar Git e commitar um ponto limpo | permite reverter qualquer passo seguinte |
| 6 | Fechar a ponte convite→caso→terceiro e o cenário ponta a ponta de Terceiros | fecha M22 |
| 7 | Escolher provedor de identidade + backend privado de arquivos | libera produção |
| 8 | Responder as perguntas de retenção/LGPD e formalizar CNPJ | libera comercial real |

---

## 5. O que eu não medi (e não posso afirmar)

- Não rodei o app nem abri o painel: o banco (`app-db-1`) está parado e a porta 3107 está fechada.
- Não executei `next build` de produção (falha conhecida no Windows).
- Não avaliei a correção das regras SST contra NR-1, NR-7, NR-18 ou NR-33 — isso exige
  revisão de profissional habilitado, como o próprio projeto determina.
- Não acessei nem alterei banco persistente, documentos reais ou dados de clientes.
