# M22 — Fluxo de configuração e publicação da política SST

2026-10-18. Contrato funcional candidato; sem tela, runtime, migration ou parecer legal.

## Autoridade

- `thirdparty.policy.manage` é uma ação independente de `tenant.membership.manage`, `tenant.authorization.grant`, decisão gerencial e análise SST.
- Ela é concedida por empresa/unidade. Não existe publicação global para todas as unidades e unidade nova não herda política automaticamente.
- O SST do cliente pode receber um preset de administração de política separado. Receber `client_sst` ou `client_manager` não concede a ação implicitamente.
- Cliente sem SST designa previamente um responsável de política por escopo. Owner/gestor só publica se receber esse grant distinto.
- No tenant de consultoria, a consultoria não configura/publica política do cliente por associação. Publicação exige designação do representante do cliente ligada ao escopo exato.
- API e terceiro não recebem essa ação.

## Preparar uma versão

1. Selecionar empresa e unidade existentes; confirmar tenant e grant `thirdparty.policy.manage` ativo.
2. Criar uma proposta completa, sem sobrescrever a versão publicada. Identificar requisitos, efeito operacional, evidência esperada e escopo de aplicação.
3. Para cada requisito que cita legislação, registrar jurisdição, fonte/norma, versão/edição, item, período normativo aplicável, escopo, revisor e instante da revisão. Requisito interno do cliente pode ser marcado como interno e não deve ser apresentado como imposição legal.
4. Se o efeito bloquear ou permitir ingresso condicionado, registrar motivo e fundamento revisável. A interface não deve sugerir que a classificação é automaticamente correta ou que o motor interpretou a norma.

## Revisar e publicar

1. Revalidar conta/membership, grant, escopo e eventual autorização do representante do cliente no momento da publicação.
2. Registrar `published_by`, `reviewed_by`, `reviewed_at`, fingerprint da proposta e instante `effective_at`. A revisão precisa anteceder ou coincidir com o início de vigência.
3. `effective_at` deve ser corrente ou futuro e estritamente posterior à última versão daquela unidade. Serializar publicação por tenant/empresa/unidade; rejeitar retroatividade e instantes duplicados.
4. Inserir cabeçalho, itens e auditoria na mesma transação. Publicação incompleta faz rollback integral. Depois de publicada, cabeçalho e itens não recebem UPDATE/DELETE; corrigir gera nova versão.
5. Na consultoria, a designação do representante do cliente deve corresponder à empresa/unidade e continuar ativa até o commit. O administrador da consultoria é registrado como operador técnico da aplicação, não como autor da decisão do cliente.

`published_by` e `reviewed_by` preservam papéis separados no registro. A exigência de duas pessoas distintas ainda não foi definida para produto; enquanto isso, o sistema não deve simular dupla aprovação. Se a mesma pessoa publicar e revisar por falta de outro responsável, registrar a mesma identidade nos dois campos e exibir isso de forma transparente para auditoria.

## Aplicação aos casos de Terceiros

- Cada compilação/decisão escolhe a versão da mesma empresa/unidade com maior `effective_at` que seja menor ou igual ao instante da decisão.
- A decisão guarda ID, versão e fingerprint da política e dos itens avaliados. Relatório/decisão antiga continua no histórico com o snapshot original.
- Nova política não altera, fecha ou reduz severidade de pendências existentes por si só. Para uma decisão nova, recalcular evidências e requisitos contra a versão atual e registrar nova avaliação.
- A publicação de uma versão não cria aprovação, não agenda ingresso e não altera mobilização. Gate/aprovação e agenda continuam independentes e verificam bloqueios atuais.
- Efeito `block` impede release técnico enquanto o requisito estiver não resolvido e impede ingresso condicionado como exceção. Evidência nova e avaliação favorável de SST autorizado podem resolver a pendência e permitir novo release; mudar o próprio efeito requer nova política autorizada. A versão anterior, a avaliação e o bloqueio histórico permanecem auditáveis. Ver `docs/M22_ESTADOS_AVALIACAO_TECNICA.md`.
- Política ausente, vencida por referência normativa ou sem versão/escopo confiável nega nova decisão até revisão responsável. A aplicação não afirma conformidade legal.

## Evento de auditoria

Registrar evento de publicação com ator autenticado, tenant, empresa/unidade, ID/versão/fingerprint, instante efetivo, revisor, representante do cliente se houver, motivo e resultado. Armazenar apenas metadados necessários. Nunca copiar conteúdo médico à auditoria da política.

## Critérios de aceite para o fluxo

1. Admin de usuário, gestor e SST sem `thirdparty.policy.manage` não publicam política.
2. SST com `client_sst` pode avaliar segundo grants próprios, mas só administra política se também receber o grant independente.
3. Representante de cliente de escopo X não publica para unidade Y ou outra empresa.
4. Publicação concorrente, retroativa ou com início duplicado falha sem política parcial.
5. Nova versão afeta decisões futuras conforme `effective_at`; decisões anteriores preservam snapshot.
6. Nova versão sozinha não limpa bloqueio nem cria mobilização/agenda.
7. `block` impede ingresso condicionado; `conditional_allowed` permite apenas gestor concedido e mantém pendência aberta.
8. Fonte normativa citada mantém versão/período/escopo e revisão responsável; o sistema não inventa conteúdo nem interpretação.

## Pendências

- Definir representação probatória da designação do cliente e seu processo de substituição.
- Definir se publicação requer revisor distinto, mantendo alternativa auditada para cliente sem estrutura de SST.
- Ligar IDs de terceiros e fluxos às tabelas autoritativas quando o schema operacional de Terceiros for reconciliado.
- Implementar publicação/seleção temporal em funções transacionais candidatas e comprovar em PostgreSQL descartável antes de conectar a UI.
