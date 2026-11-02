# M22 — Ciclo de vida de representantes e atribuições SST

2026-10-18. Contrato funcional para vínculos candidatos; sem criação de usuários, integração ou alteração de dados.

## Conceitos separados

- **Membership**: pertencimento de uma conta autenticada a um tenant. Não concede ação operacional por si só.
- **Administração do sistema/tenant**: provisionada no onboarding conforme a titularidade da instalação. Quando a empresa cliente compra o sistema, provisiona-se o admin inicial do tenant cliente; quando a instalação pertence à consultoria, o admin do sistema é somente da consultoria. Usuários cliente numa instalação da consultoria não recebem papel administrativo do sistema por serem representantes operacionais.
- **Representante de concessão do cliente**: pessoa que o cliente designa, com evidência e escopo empresa/unidade, para autorizar atribuições/grants no âmbito do cliente. Não administra a consultoria nem a plataforma.
- **Grant**: ação por principal e escopo, emitida por autoridade delegável. Não substitui atribuição SST.
- **Atribuição SST**: encaminha análise a profissional específico, empresa/unidade/terceira/fluxo e período. Não substitui grant `thirdparty.analysis.recommend` nem qualificação.
- **Qualificação**: informação validada por processo/fonte confiável, com referência e validade. Texto livre/registro digitado não é verificação.

## Designar representante

1. Alvo já é membership ativo e autenticável no tenant, no papel compatível com a organização cliente. Não criar conta implícita.
2. No fluxo de consultoria, o `consultoria_admin` apenas revisa a evidência e propõe a designação; um representante do cliente identificado na autorização formal, com conta cliente ativa, confirma a proposta. Essa confirmação operacional não requer perfil de admin do sistema/tenant. O revisor, a pessoa designada e o confirmador não podem ser a mesma pessoa. Admin da consultoria sozinho não constitui confirmação.
3. A empresa cliente é responsável por indicar quem possui autoridade para confirmar. Como `tenant_memberships.role` só distingue `cliente` e não identifica owner/responsável nem comprova poderes legais, a consultoria precisa conferir humanamente a evidência e associá-la à identidade da conta antes do uso. A função candidata registra referências e a confirmação, mas o papel `cliente` e os textos de referência não autenticam juridicamente o documento nem a pessoa.
4. Selecionar empresa e unidade existentes. A designação não inclui outras unidades, inclusive futuras.
5. Registrar quem revisou, quem confirmou, quando, base documental/operacional, motivo, início/fim e snapshot. A referência identifica a evidência de autorização sem copiar documentos sensíveis desnecessários.
6. A proposta não ativa autoridade. Somente a confirmação cliente acrescenta o evento `designated`; proposta, confirmação e auditoria são append-only. Remoção de escopo ou substituição cria evento de revogação e nova designação, sem editar a linha antiga.

## Atribuir profissional SST

1. Conferir membership ativo, grant de análise, tipo (`client_sst` ou `consultancy_sst`), qualificação validada, unidade e vínculo à terceira/fluxo.
2. Toda atribuição requer representante do cliente vigente no mesmo tenant/empresa/unidade. No sistema comprado pelo cliente, o admin inicial provisionado no onboarding administra o tenant e designa o representante conforme seus poderes. Na instalação pertencente à consultoria, o admin da consultoria administra o sistema; a designação do representante do cliente ainda exige a confirmação operacional independente descrita acima.
3. Atribuição de consultoria tem duas condições: grant de análise dentro do tenant da consultoria e autorização do representante do cliente para atender aquele escopo. Não equivale a liberação da mobilização.
4. Registrar período, finalidade, ator e motivo. Nova pessoa/escopo exige nova atribuição; mudança de unidade não altera uma atribuição anterior.
5. Papel sem grant, grant sem atribuição ou qualificação não verificada resulta em negação da análise técnica final.

## Expiração, suspensão e revogação

- Checar a cada uso membership/tenant ativos, janela de validade e ausência de evento de revogação. Data e identidade vêm do servidor.
- Revogação do representante impede novas designações/grants dependentes dele. Revogação de atribuição impede nova análise nesse fluxo. Revogação do grant impede a ação mesmo com atribuição ainda vigente.
- Suspender membership invalida imediatamente grants, designações e atribuições daquele principal. O processo de suspensão deve acrescentar eventos de revogação no mesmo commit (ou marcar uma geração de autoridade inválida); reativar a conta nunca restaura autoridade automaticamente.
- Encerrar unidade, tenant ou escopo também nega operações imediatamente. Não excluir histórico nem alterar decisões já registradas.
- Corridas entre decisão/avaliação e revogação serializam por locks sobre as linhas de autoridade. Operação confirmada antes da revogação permanece no histórico; ação posterior é negada.
- Revogar autoridade de quem concedeu invalida descendentes no instante do commit; nenhum descendente pode ser usado numa janela posterior. A decisão mantém os IDs/revisões originais como prova histórica.

## Retificação e reativação

- Não editar identidade, tenant, papel, escopo, validade ou qualificação numa atribuição existente. Retificar com nova emissão e evento que referencia a anterior.
- Reativar membership apenas recupera acesso de identidade. Para voltar a analisar, administrar, representar o cliente ou decidir, emitir novos grants/designações/atribuições ativos.
- Se uma qualificação expirar, a atribuição deixa de ser elegível. Após nova verificação confiável, criar nova atribuição com a nova referência e período.

## Implementação que falta no schema candidato

1. FKs compostas já adicionadas ao DDL candidato provam que representante, atribuição e versão de política usam a mesma tenant/empresa/unidade. Elas validam integridade de escopo, mas não provam que a designação está vigente ou autorizada.
2. As funções candidatas isoladas agora propõem, confirmam e revogam designações e provisionam casos; o app não recebe acesso direto às tabelas de eventos. O onboarding do admin inicial por titularidade e a associação verificada entre evidência formal e conta cliente não estão implementados. A função de confirmação ainda reconhece apenas membership ativo `cliente`, insuficiente por si só para provar poderes de representação; essa verificação externa continua obrigatória antes de qualquer integração.
3. Definir como suspensão do membership gera eventos de revogação sem inventar um usuário autor: identidade de evento automatizado precisa ser distinta da autoria humana, ou operações devem checar uma geração/estado autoritativo.
4. Revogação em cadeia precisa ser transacional/idempotente e relida por toda operação que usa grants, atribuições ou representante.
5. Fechar schema e provar no PostgreSQL descartável suspensão/reativação, substituição do representante, expiração e concorrência antes de qualquer UI.

O candidato atualmente exige representante do cliente para toda atribuição SST, inclusive em cliente direto; o owner/admin desse cliente primeiro designa a pessoa no escopo. Em grants, o campo de representante é opcional para permitir concessão direta conforme a regra do tenant, mas obrigatório pelo serviço confiável quando o tenant opera via consultoria e a ação depende de autoridade do cliente. Ainda não há serviço que imponha essa condição.
