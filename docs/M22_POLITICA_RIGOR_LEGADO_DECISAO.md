# M22 — Decisão necessária: política de rigor legada

Data da análise: 2026-10-18. Esta proposta não altera o comportamento atual nem autoriza migração.

## Fatos verificados

- Existe uma política v1 no arquivo local, com vigência declarada em 2026-10-17.
- Tenant, empresa e unidade conferem com o cadastro local; empresa ativa e unidade vinculada.
- Há um evento de auditoria associado à empresa, mas nenhum evento de criação/revisão da política.
- Os campos `createdBy` e `reviewer` são valores declarados no JSON, sem evento que comprove quem os registrou ou revisou.
- A referência no PostgreSQL candidato foi validada apenas com fixtures. O adaptador read-only foi testado em PostgreSQL descartável, mas não foi executado contra o banco ativo.

## Caminhos possíveis

| Opção | Tratamento | Efeito e limite |
|---|---|---|
| A — Atestar a política atual | Responsável autorizado da empresa revisa o snapshot exato e registra agora um evento de atestação, com identidade verificada, data do evento e digest. | Mantém o conteúdo atual como base operacional a partir da atestação. A autoria e a revisão históricas continuam desconhecidas; a atestação não pode ser retrodatada. |
| B — Exigir nova versão | Preservar v1 somente como legado não verificado e pedir que responsável autorizado publique uma v2 com escopo, níveis, vigência, autoria e revisão explícitos. | Recomendado para um corte futuro. Até a v2 ser aprovada, o gate PostgreSQL não deve usar v1 como política autoritativa. O runtime atual permanece intocado até implementação e aceite próprios. |
| C — Não migrar a política | Manter o domínio de rigor no JSON e fora do cutover de Terceiros. | Evita atribuir autoridade ao legado, mas mantém dependência de fonte separada e impede alegar transação única para publicação/decisão. |

## Recomendação técnica

Opção B. É a que preserva o registro legado sem conferir-lhe uma aprovação que não pode ser provada. A decisão requer que o responsável competente confirme quem pode aprovar/publicar a política pela empresa cliente e se a nova vigência começa na data da aprovação. Não inferir esse responsável a partir do campo `reviewer` atual.

## Registro da escolha

- Escolha: **A — atestar agora o snapshot existente**, aprovada pelo usuário em 2026-10-18.
- Limite confirmado: a atestação vale a partir do timestamp gerado pelo servidor; não prova nem retroage autoria, revisão ou vigência histórica declaradas.
- Responsável/identidade autenticada do cliente: ainda não vinculada no runtime. A mensagem de aprovação define o tratamento do projeto, mas não identifica uma sessão cliente autenticada para assinar o evento.
- Data/hora da atestação real: pendente de ação da identidade autorizada; será gerada pelo servidor, nunca digitada ou retrodatada.
- Implementação candidata: importação distingue `legacy_unverified`, preserva metadados legados literalmente e registra quem importou separadamente; `policy.legacy_attested` grava ator cliente, digest exato e hora de servidor em evento imutável. Gate candidato retorna a política como indisponível antes da atestação e usa o timestamp do evento como início efetivo, sem retroagir a data declarada.
- Estado ativo: JSON, runtime e banco ativo não foram alterados. A prova usa identidade fictícia em PostgreSQL descartável. A função candidata não está conectada à aplicação.
- Próxima ação: ligar a atestação somente depois de existir sessão/atribuição autenticada do responsável da empresa cliente, com gate que considera a política utilizável a partir da atestação; manter a origem e as afirmações históricas como não verificadas.

## Prontidão da identidade — 2026-10-18

Inspeção do runtime local: as contas de demonstração existentes correspondem a Master, médico, administradora da consultoria, TST e segunda administradora de consultoria. `DEMO_MEMBERSHIPS` não contém membro `cliente`; a sessão assinada autentica esses usuários, mas não lhes confere autoridade em nome da empresa cliente. A empresa/unidade da política é cliente da consultoria.

Conclusão: não há ator cliente autenticado no runtime para materializar uma atestação ativa. Não promover a administradora/TST da consultoria para responsável do cliente. Para a demonstração, usar apenas IDs e dados inteiramente fictícios em fixtures/provas isoladas; o cadastro e a atribuição reais ficam para etapa futura.

### Escolha do caminho de identidade

Escolha inicial: usar conta existente, sem criar conta demo. Esclarecimento posterior do usuário: os responsáveis serão cadastrados depois e devem permanecer fictícios agora. Portanto, IDs sintéticos são permitidos somente na demonstração isolada; não há atestação ativa nem autenticação real de cliente.

Atualização em 2026-10-18: o usuário esclareceu que os responsáveis serão cadastrados depois e autorizou mantê-los fictícios nesta fase. IDs sintéticos podem ser usados apenas em fixtures e provas isoladas; não usar contas reais da consultoria para assinar em nome do cliente. A atestação efetiva no banco/runtime ativo continua pendente do futuro cadastro e autenticação do responsável. Nenhum segredo ou dado pessoal deve ser criado para os atores demonstrativos.



Aceite humano — 2026-10-18: aprovado manter os atores fictícios até o cadastro futuro. O uso fica limitado à demonstração isolada, sem conta ativa, credencial, permissão ou atestação no banco/runtime ativo.

## Compatibilidade com o modelo geral de autoridade

A prova isolada de atestação usa `authorized_attestors` como fixture mínima e não substitui o ciclo candidato de representante do cliente, grants `thirdparty.policy.manage`, membership e auditoria descrito em `M22_CICLO_VINCULOS_AUTORIDADE.md` e `M22_FLUXO_POLITICA_SST.md`. Em integração futura, a autorização da atestação deve derivar desse modelo por escopo exato empresa/unidade, com ator de sessão verificado, revogação serializada e digest do snapshot; não se deve criar um segundo cadastro de permissões concorrente.
