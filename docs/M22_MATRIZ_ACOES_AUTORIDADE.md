# M22 — Matriz operacional de ações e autoridade

2026-10-18. Contrato funcional candidato, não conectado ao runtime.

## Matriz de autorização

| Ação | Consultoria SST atribuído | SST do cliente atribuído | Gestor/dono do cliente | Admin do tenant | Terceiro | Aplicativo/API |
|---|---|---|---|---|---|---|
| Enviar evidência própria | Não por padrão | Não | Não | Não por padrão | Sim, somente seu cadastro | Somente se a ação de envio estiver concedida |
| Analisar evidência e emitir parecer | Recomendar, com fundamento; reanalisar quando reatribuído | Avaliar segundo competência e escopo concedidos | Não | Não por ser admin | Não | Não; eventual automação auxiliar exige ação própria e não decisória |
| Definir requisito SST do cliente | Não; pode recomendar | Sim, quando concessão/política permitir; registra requisito e efeito técnico | Não | Não por ser admin | Não | Não |
| Configurar/publicar versão da política SST | Não por vínculo de consultoria | Sim, se receber grant de administração da política | Não por ser gestor | Não por ser admin; exige grant separado | Não | Não |
| Impor bloqueio técnico | Recomendar bloqueio | Sim, dentro da política e escopo | Não remove bloqueio obrigatório | Não | Não | Não |
| Exigir correção antes de mobilizar | Recomendar | Pode registrar requisito técnico de correção conforme escopo/política | Sim, como decisão gerencial registrada | Não por ser admin | Não | Não |
| Autorizar ingresso condicionado | Não | Não substitui gestor | Sim, somente se regra permitir e sem pendência de bloqueio obrigatório | Não por ser admin | Não | Não |
| Devolver para nova análise SST | Não; reanalisa somente quando reatribuído | Pode encaminhar no fluxo técnico | Sim, como encaminhamento, sem editar parecer | Não por ser admin | Não | Não |
| Criar/revogar usuário, papel ou escopo | Não por ser técnico; apenas admin delegado separado | Não por ser técnico | Não por ser gestor | Sim, no próprio tenant e abaixo do teto de delegação | Não | Não |
| Criar/revogar/rotacionar credencial de app | Não | Não | Não | Sim, para tenant/escopo autorizado | Não | Não pode administrar a própria credencial |
| Gerir ciclo de vida do tenant e suporte da plataforma | Não | Não | Não | Não | Não | Não |

“Não” significa que a ação não decorre daquele papel. A mesma pessoa só pode executar ações de outra coluna se receber concessão separada e explícita para aquele papel, fluxo e escopo. Ser administrador, gestor ou profissional habilitado, isoladamente, não altera as permissões de outra trilha.

O papel `hierarchy_admin` pode administrar memberships comuns somente no tenant e escopo delegados; não pode conceder papel administrativo, autoridade técnica ou decisão gerencial. Administradores de tenant podem conceder papéis apenas abaixo do próprio teto de delegação. Planos, preços e limites comerciais estão fora desta etapa.

## Regras de escopo e fluxo

- **Escopo mínimo:** tenant obrigatório; depois empresa cliente, unidade, terceira, documento e etapa quando aplicável. `NULL`/escopo global só é aceito por concessão que explicitamente permita tenant inteiro.
- **Consultoria:** analista precisa de atribuição vigente à empresa/unidade/terceira/escopo. Vínculo à consultoria não concede acesso automático a todos os clientes.
- **Cliente direto:** administrador inicial provisionado define usuários e grants do próprio tenant. Não precisa de consultoria. Nunca consegue criar SaaS Master ou escrever fora do tenant.
- **Especialidade técnica:** profissão/registro cadastrado é qualificação declarada/verificada em fluxo próprio; não substitui o grant de ação nem o escopo. Mudança de tenant/escopo não é herdada pelo título profissional.
- **Decisão gerencial:** decisor previamente cadastrado/autenticado e com grant ativo. Escolhas permitidas: correção antes do ingresso, autorização condicionada pós-ingresso quando permitida, ou devolução à SST. O gestor não pode editar parecer, baixar severidade ou fechar pendência bloqueante.
- **Aplicativo:** principal de máquina isolado; somente allowlist de ações, tenant e escopo concedidos. Não pode assinar decisão técnica/gerencial como pessoa. Ação não prevista resulta em negação.
- **Suspensão/revogação:** conta, tenant, grant, unidade ou credencial inativos bloqueiam novas operações. Suspender membership revoga grants administrativos candidatos. O contrato de decisão deve aplicar a mesma validação a grants gerenciais e registrar a revisão do grant usado.
- **Auditoria:** registrar ator (ou principal de máquina), papel efetivo, tenant e escopo, ação, alvo, resultado, instante, justificativa quando exigida, versão da política e IDs das fontes/snapshot. Evento append-only; correção cria novo evento.

## Regra legal configurável

O sistema registra referências usadas por quem configura/avalia: jurisdição, norma e item, versão/edição, início e, quando aplicável, fim da vigência, escopo de aplicação, requisito, evidência e efeito operacional (`recommendation`, `requirement`, `block`, `conditional_allowed`). A configuração deve ser revisada por pessoa competente. O motor não deve inventar aplicação da norma nem transformar toda recomendação em bloqueio.

Se uma pendência vigente tiver efeito `block`, a decisão condicionada é recusada. Se tiver `conditional_allowed`, o gestor autorizado pode escolher ingresso condicionado e o sistema mantém a pendência aberta, registra plano informado, decisão e prazo/responsável somente quando fornecidos. Se a norma ou política não estiver identificada/versionada para a decisão, o sistema não declara conformidade legal automaticamente; encaminha para revisão responsável.

## Ordem das verificações no servidor

`principal autenticado/ativo` → `tenant ativo e modo correto` → `grant/role ativo` → `escopo cobre o alvo` → `ação está na allowlist` → `estado atual permite a transição` → `política/norma vigente permite a opção` → `módulo habilitado e limite técnico disponível` → `gravar decisão e auditoria atomicamente`.

Falha, ausência ou conflito em qualquer verificação nega a transição; o cliente não pode enviar um resultado calculado para substituir a política ou o estado do banco. Limites comerciais de assentos, preços e planos permanecem postergados; esta matriz trata somente autoridade e regras operacionais.

## Estado de implementação

O catálogo legível por máquina correspondente é `schemas/operational-authority-catalog.json`. Ele fixa códigos de ação, trilhas de autoridade, ações que aplicativos podem receber, negação de decisão humana por máquina e efeitos de política exigidos para transições. Ambos são candidatos e precisam de revisão do domínio antes de se tornarem configuração efetiva.

Esta matriz refina as definições aprovadas pelo usuário e os contratos candidatos descritos em `M22_HIERARQUIA_E_LIMITES.md` e `M22_IDENTIDADE_GESTOR.md`. Ainda não é configuração de runtime nem parecer jurídico. A prova PostgreSQL isolada está pendente porque Docker/WSL não estão acessíveis. Próxima implementação: contratos de grants por ação/escopo e vinculação à revisão de política; depois prova de isolamento/negação em PostgreSQL descartável antes de integrar à UI.
