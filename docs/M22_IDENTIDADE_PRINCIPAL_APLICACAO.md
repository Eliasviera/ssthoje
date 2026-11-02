# M22 — identidade de aplicação e autoria de eventos

2026-10-18. Decisão de desenho para o schema candidato; nenhuma identidade de máquina ou conta real foi criada.

## Estado observado

O repositório não contém catálogo autoritativo de principals de aplicação nem fluxo de credenciais de máquina. O schema `operational-authority-grants-candidate.sql` contém `actor_application_id` como texto opcional em `audit_events`, mutuamente exclusivo com `actor_user_id`, mas sem FK. Os demais eventos de autoridade usam membership humano como autor. Não há base para preencher esse campo com nomes de serviços, IDs arbitrários ou um usuário humano sintético.

## Contrato antes de adicionar um principal

Uma futura entidade de principal de aplicação só pode ser ligada à auditoria após definir e documentar:

1. **Emissor da identidade:** serviço de autenticação confiável que gera identidade verificada no servidor; valor vindo de browser, header ou payload não é prova.
2. **Escopo:** tenant e ações permitidas explicitamente, com validação de que o principal não herda autoridade humana nem pode publicar política, decidir ou avaliar SST por si só.
3. **Ciclo de vida:** criação, habilitação, rotação/revogação de credencial, expiração e desativação; operações devem negar imediatamente após revogação.
4. **Rastreabilidade:** ID estável referenciado por FK, tipo/origem da credencial sem armazenar segredo em auditoria, horário do servidor e correlação segura da operação.
5. **Atomicidade:** validação de identidade/escopo e inserção do evento na mesma transação da operação que ele descreve.

Até esses pontos terem uma fonte de verdade e implementação revisável, a coluna permanece sem uso e a prova não insere atores de aplicação. Não criar tabela vazia de principals como se isso validasse identidade.

## Matriz atual de autoria

| Registro candidato | Autoria/identidade hoje | Lacuna ou condição |
|---|---|---|
| `authority_grants` e `grant_events` | Membership humano | FK composta assegura membership no tenant; serviço futuro precisa validar estado, delegação e representante quando aplicável. |
| `client_registrars` e eventos de representante | Membership humano | Designação exige prova de autoridade do cliente e escopo vigente. |
| `analyst_assignments` e eventos | Membership humano | Serviço valida representante, grant, qualificação e validade no uso. |
| Publicação/revisão de política | Membership humano | Não converter automatismo em publicador/revisor humano. |
| Avaliação técnica | Analista humano atribuído | A autoria precisa coincidir com atribuição vigente e ação concedida. |
| Decisão operacional | Membership humano | Decisor e autorização são verificados no escopo da decisão. |
| `audit_events` | Membership humano **ou** ID de aplicação | Ramo de aplicação sem catálogo/FK; indisponível até contrato e emissor confiável existirem. |
| Suspensão automática/revogação em cadeia | Sem autor humano inventado | Definir evento de sistema separado e verificável ou usar estado/generation autoritativo; pendente. |

## Consequência para a prova e sequência

- A Etapa A de parse pode verificar que o ramo de aplicação é nullable e não utilizado por fixtures, mas não prova identidade de máquina.
- A Etapa B deve negar principal de aplicação para ações de usuário e não deve aceitar um `actor_application_id` fornecido pelo cliente.
- Antes de usar o ramo, decidir se principals são globais ou tenant-scoped, apontar o mecanismo emissor, modelar revogação e adicionar FK/indexes compostos coerentes com esse escopo.
- Eventos automáticos de suspensão devem ter identidade de sistema distinta; não atribuir sua autoria ao admin que iniciou o processo caso ele não tenha executado cada evento como ator.

Esta decisão não altera migration, runtime, permissões, banco ativo ou registros de auditoria existentes.
