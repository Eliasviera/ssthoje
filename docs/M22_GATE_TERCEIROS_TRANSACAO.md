# M22 — Gate transacional para integração de Terceiros

Data: 2026-10-16. Estado: desenho técnico; nenhum schema, dado ou runtime foi alterado por este documento.

## Objetivo

Substituir o gate atual, que compõe `third-party.json`, `clients.json` e `compliance.json` em leituras separadas, por uma decisão que leia os insumos e grave a aprovação no mesmo commit do PostgreSQL.

O gate continua sendo uma ferramenta de apoio. Ele lista bloqueios explícitos e exige uma decisão humana registrada; não atesta conformidade, habilitação profissional, aptidão médica ou obrigação legal.

## Fontes que precisam estar na mesma transação

| Conjunto | Estado atual | Fonte transacional proposta |
| --- | --- | --- |
| Empresa, unidade e situação | PostgreSQL | `client_companies` e `client_units` existentes |
| Requisitos documentais da empresa | JSON, opcional na empresa | versão imutável por empresa/unidade no PostgreSQL |
| Critérios de avaliação | JSON | regra versionada no PostgreSQL |
| Avaliações documentais | JSON | avaliação com snapshot da regra e do documento no PostgreSQL |
| Convites, recebimentos e pendências | snapshots PostgreSQL importados, runtime JSON | modelo operacional de Terceiros, separado dos snapshots de migração |
| Aprovação e agendamento | JSON | decisão e agenda append-only no PostgreSQL |

Os snapshots criados pela migration `0008` permanecem históricos e somente leitura. Eles não devem receber mutações operacionais.

## Projeção mínima proposta

1. `third_party_requirement_sets`: conjunto versionado de requisitos configurado pela consultoria para empresa e unidade. Cada alteração cria uma versão; nunca substitui a versão usada por uma decisão anterior.
2. `third_party_requirement_items`: itens do conjunto, identificados por categoria documental. ASO só pode constar como requisito médico separado; o gate administrativo não recebe conteúdo clínico nem infere aptidão.
3. `compliance_rules` e `compliance_evaluations`: regras e avaliações com tenant, versão, origem, escopo e timestamps. Uma avaliação preserva o snapshot da regra e do recebimento que avaliou.
4. `third_party_integration_decisions`: aprovação humana com fingerprint calculado no servidor, usuário/role, data, justificativa e referência ao conjunto de requisitos/avaliações lidos no mesmo commit.
5. `third_party_integration_schedules`: agendamento que aponta para uma decisão ainda atual. Não envia convite externo nem libera acesso por si só.
6. Auditoria: a decisão, a agenda e o evento de auditoria são incluídos na mesma transação.

## Regras de consistência no servidor

- Derivar tenant e permissões da sessão; nunca aceitar tenant do navegador.
- Fixar o tenant no início da transação e bloquear a linha do escopo de Terceiros antes de calcular o fingerprint.
- Ler empresa/unidade ativas, requisitos vigentes, critério ativo, avaliação atual, convite/recebimento e pendências sob o mesmo isolamento.
- Negar a operação se qualquer dependência não tiver fonte transacional ou versão confiável. Não combinar JSON e PostgreSQL para aprovar.
- Gravar aprovação somente após conferência humana explícita; uma alteração posterior no escopo invalida a aprovação por fingerprint, sem apagar seu histórico.
- Revalidar o conjunto na data civil de um agendamento. O prazo operacional de correção já exibido no sistema não se transforma em prazo legal.
- Aplicar RLS forçada em todas as tabelas, chaves compostas por tenant e privilégios mínimos para o papel da aplicação.

## Sequência de implementação

1. Criar schema candidato e testes PostgreSQL descartáveis para RLS, tenant cruzado, rollback e concorrência. Nenhuma rota ativa usa o candidato.
2. Criar adaptadores server-only de leitura/escrita e testes de autorização. A escrita deve usar `FOR UPDATE` e revisão/fingerprint esperado.
3. Preparar captura, importação idempotente e reconciliação para requisitos e compliance. JSON permanece fonte ativa.
4. Migrar todos os leitores e ações de Terceiros juntos: painel, relatório, pendências, portal, PDF, revisão documental, aprovação e agendamento.
5. Executar validação integrada com dados fictícios e colher aceite humano antes do corte de runtime.

## Critérios de aceite do próximo bloco

- A decisão de integração falha se empresa, unidade, requisito, critério, avaliação, recebimento ou pendência mudar durante a operação.
- Uma consultoria não lê nem grava linhas de outra consultoria, inclusive quando IDs coincidem.
- A aprovação e sua auditoria são gravadas juntas ou não são gravadas.
- A agenda só referencia uma aprovação vigente; histórico anterior permanece consultável.
- Nenhum dado de ASO ou conteúdo médico aparece na decisão administrativa.
- O JSON e o PostgreSQL não são usados em conjunto para aprovar ou agendar.

## Fora de escopo desta fatia

Não há mudança de tela, importação, ativação do adaptador, integração externa, definição normativa automática ou uso de dados reais.
