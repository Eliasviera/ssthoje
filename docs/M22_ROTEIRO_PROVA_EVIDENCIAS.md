# M22 — roteiro de prova isolada de evidências e conciliação

2026-10-19. Etapa A executada em PostgreSQL 17 descartável, sem volume e sem porta publicada. Nenhuma etapa tocou no banco ativo, no runtime, em PDFs existentes ou em dados reais.

## Ordem dos candidatos

1. Preparar container PostgreSQL descartável, sem volume e com nome/ID próprio.
2. Aplicar somente as migrations-base exigidas pelos cabeçalhos: `0001_tenant_registry.sql`, `0004_client_companies.sql` e `0005_pgr_risk_inventory.sql` (confirmar dependências atuais antes de executar; `0004` cria empresas/unidades e `0005` acrescenta a chave composta usada pelo candidato).
3. Aplicar em ordem `operational-authority-grants-candidate.sql`, `third-party-evidence-candidate.sql`, `third-party-workforce-candidate.sql` e `third-party-legacy-reconciliation-candidate.sql`.
4. Etapa A valida parse, FKs, índices, RLS e privilégios. Ela não valida comportamento, autorização efetiva, armazenamento físico ou arquivo real.
5. Etapa B só existe depois de implementar/revisar funções confiáveis e adaptador de storage. Não conceder DML direto às tabelas candidatas.

## Fixtures fictícias mínimas

- Dois tenants isolados; empresa/unidade, terceira, caso/escopo e memberships fictícios em cada um.
- Um membership ativo `consultoria_admin`, um `sst_tst`, um `cliente`, um `terceiro` e um membership suspenso.
- O app e o PostgreSQL devem concordar em tenant, status e papel; fixture ausente ou divergente deve resultar em negação.
- Recibos sintéticos PGR, PCMSO, LTCAT, `Outro`, Ficha de EPI, Treinamento e O.S.; bytes gerados somente para a prova, com SHA-256/tamanho conhecidos.
- Objetos privados fictícios e eventos de estado. Não usar caminho real de arquivo nem credencial de backend.

## Casos da etapa A — estrutura e privilégios

| Caso | Resultado exigido |
|---|---|
| Parser aplica candidatos na ordem documentada | Todas as relações/constraints/triggers são criadas; se houver erro, parar e corrigir o candidato. |
| `document_versions.storage_object_id` com tenant/hash/tamanho divergente | FK nega. |
| Evento-head aponta evento de outro objeto/tenant | FK composta nega. |
| Recibo conciliado com caso de outro tenant, terceiro diferente ou categoria incompatível | FK/check nega. |
| `matched` sem série, versão ou caso completo | Check nega; eventos não conciliados mantêm os alvos nulos. |
| Categoria Ficha de EPI, Treinamento, O.S. ou ASO convertida para `OTHER` | Não permitir mapeamento automático; ASO não é categoria de origem permitida. |
| `UPDATE`, `DELETE` ou `TRUNCATE` em recibos/eventos/objetos/eventos de objeto | Triggers negam; confirmar que falha sem remover fixtures. |
| Seleção de tabela sem tenant/contexto | RLS retorna vazio ou nega, sem cruzar tenants. |
| Runtime candidato tenta SELECT/DML direto ou executar função não concedida | Negar. Roles/candidatos não recebem privilégios por padrão. |

## Casos da etapa B — autorização e fluxo (após funções confiáveis)

| Caso | Resultado exigido |
|---|---|
| `consultoria_admin` ou `sst_tst`, membership ativo e permissões web `documents.review` + `thirdparty.read` | Pode revisar somente dentro do tenant/escopo validado; registrar o `user_id` da sessão no servidor. |
| `terceiro`, `cliente`, membership suspenso, tenant inativo, módulo desabilitado ou `thirdparty.manage` sem `documents.review` | Negar antes de qualquer evento; não confiar em `actor_user_id` do formulário. |
| Usuário/tenant web divergem do membership PostgreSQL ou do GUC transacional | Negar e auditar motivo estável sem expor dados; não usar o lado que “parece correto”. |
| Browser envia `tenant_id`, `user_id`, `actor_user_id` ou estado `verified` manipulado | Ignorar/validar contra sessão e banco; nunca confiar no payload. |
| Hash/tamanho do recibo divergem dos bytes de origem, do objeto relido ou da versão documental | Negar associação; não criar `matched` nem liberar uso atual. |
| Objeto sem evento-head, com head alheio, estado diferente de `verified`, indisponível, quarentenado ou deletado | Negar criação/uso/download de documento atual. Preservar histórico e motivo. |
| Mesma chave idempotente importada novamente com mesmo conteúdo | Retornar resultado já existente, sem duplicar recibo/evento. |
| Mesma chave reaparece com hash/tamanho diferentes | Conflito; não sobrescrever o recibo de origem. |
| Snapshot do convite mudou entre abrir revisão e confirmar | Recarregar a origem e comparar com a captura apresentada; exigir nova confirmação ou marcar conflito, sem conciliar com contexto desatualizado. Como o JSON não oferece revisão transacional, não alegar lock da origem. |
| Convite/recibo ausente, tenant divergente ou campos mínimos de escopo não verificáveis | Negar associação e preservar `unavailable` ou `ambiguous` com motivo; não reconstruir empresa/unidade/CNPJ/escopo por similaridade. |
| Dois operadores revisam o mesmo `expected_revision` simultaneamente | Uma transição vence; outra recebe conflito, sem dupla versão corrente. |
| Cadeia `replacesReceiptId` inexistente, ambígua, cruzando tenant/store, com ciclo ou bifurcação | Não criar sequência automática; exigir análise humana. |
| PGR associa a PGR, PCMSO a PCMSO, LTCAT a LTCAT; `Outro` para `OTHER` | Associação pode prosseguir após hash/origem e confirmação humana; aplicabilidade continua pendente separadamente. |
| Assessment item cita evidência/critério por `requirement_code` | Etapa A prova FK ao item e ao membro exato do grupo do snapshot, fingerprint/revisão bem formados e compatibilidade grupo/papel; citação de membro ausente é negada. Etapa B ainda deve provar que a lista de membros veio da extração bloqueada e confere com o digest agregado, e que papel/completude corresponde ao `technical_state`. |
| Manifesto possui fingerprints dos cinco grupos, mas item não tem fonte vinculada | Não declarar cobertura item a item; o fingerprint do assessment é apenas snapshot global e não substitui as citações por requisito. |
| Membros persistidos não correspondem à lista extraída ou ao digest agregado | Função deve reconstruir a lista canônica na transação e negar o assessment diante de membro omitido, acrescentado, duplicado ou com revisão/fingerprint divergente; não confiar no valor fornecido pelo browser. |
| Estados `conforming`, `nonconforming`, `not_applicable`, `insufficient_evidence` e `not_assessed` têm citações incompatíveis | Exigir papéis de critério/evidência/base conforme o contrato; insuficiência pode não ter fonte e precisa justificar a lacuna; rejeitar resultado conclusivo sem suporte. |
| Itens não cobrem exatamente os `requirement_code` da versão de política bloqueada | Abortar gravação por requisito ausente, extra ou duplicado; não aceitar somente fingerprint completo das fontes. |
| Nova versão supersede versão atual | Mesmo commit registra nova versão, evento de estado apropriado e aplicabilidade `pending_review`; avaliação anterior continua histórica, não atual. |
| Erro após gravação no storage mas antes de commit do DB | Original legado permanece intacto; cópia órfã fica rastreável/quarentenada para limpeza controlada; retry idempotente não duplica. |
| Conflito após `matched` | Evento `reopened` invalida uso atual antes da nova revisão; avaliação anterior permanece histórica. |

## Limites e encerramento

- Uploads do portal público continuam JSON enquanto não houver principal de sistema; não inventar identidade humana para esse fluxo.
- Conciliação manual usa autorização web atual e membership validado. O GUC (`sst.user_id`, `sst.tenant_id`) é contexto da conexão server-side, não prova criptográfica; DB não pode ser exposto ao browser.
- Mapeamento de permissões entre TypeScript e banco deve ser comparado; divergência de membership/status/role é negativa.
- Parse/prova não migra, importa, transfere, exclui nem edita arquivos existentes. Limpeza alcança somente container/fixtures próprios e deve ser confirmada por ID.
- Registrar versão PostgreSQL e resultado sem nomes/IDs reais ou segredos. Qualquer falha de parse/segurança mantém candidatos fora de migrations e exige nova revisão.

## Estado

Roteiro escrito após aprovação do usuário para a regra de autorização e para falha fechada diante de divergência de membership. Em 2026-10-19, a Etapa A aplicou com sucesso as migrations-base 0001/0004/0005 e os quatro schemas candidatos na ordem acima, em PostgreSQL 17 descartável. A prova encontrou e corrigiu em `schemas/third-party-evidence-candidate.sql` uma FK do event head que omitia `object_id`; a sequência completa passou na repetição limpa. Na validação original, os catálogos confirmaram RLS habilitada e forçada nas 32 tabelas candidatas e 106 FKs.

O verificador reproduzível `examples/app/scripts/verify-m22-evidence-candidates.mjs` também passou em PostgreSQL 17 descartável: tenant A não leu o objeto real do tenant B e contexto sem escopo retornou vazio; FK negou unidade de outra empresa, hash/tamanho divergentes e event-head com objeto alheio; categoria ASO e mapeamento PGR→PCMSO foram negados; o papel de evidências foi negado em SELECT/INSERT/UPDATE/DELETE/TRUNCATE direto, com SELECT concedido temporariamente só para exercitar RLS; UPDATE/DELETE/TRUNCATE foram negados nos quatro históricos originais. A versão atual inclui a lista de membros do snapshot e a FK da citação ao membro; membro ausente, requisito inexistente e papel/grupo incompatível foram rejeitados; DML direto negado e UPDATE/DELETE/TRUNCATE bloqueados nos dois novos históricos append-only. Consulta de catálogo confirmou 34/34 tabelas com RLS forçada e 109 FKs. O script não lê arquivos de ambiente, não publica porta nem monta volume, e remove o container. Etapa B permanece não executada: a função deve comprovar que a lista de membros veio da extração autoritativa e confere com digest agregado, validar completude por estado, além de integrar storage e fonte de membership coerente. Nenhum banco ativo, runtime, PDF existente ou dado real foi acessado.

## Reprova do delta atual — 2026-10-20

A Etapa A atualizada passou em PostgreSQL 17 descartável com o verificador `examples/app/scripts/verify-m22-evidence-candidates.mjs`. A execução aplicou migrations-base e quatro schemas candidatos na ordem deste roteiro, confirmou 36/36 tabelas com RLS habilitada/forçada e 114 FKs, criou fixture sintética com snapshot de convite, vínculo `linked` e recibo `matched` apontando para o mesmo caso, e negou escrita direta pelo papel do app de reconciliação. UPDATE/DELETE/TRUNCATE foram negados nos oito históricos append-only (incluindo snapshots e eventos de vínculo), além das verificações anteriores do roteiro. Processo concluído e container removido pelo script. Sem volume, porta publicada, credenciais de backend, dados reais, PDF existente, runtime ou banco ativo.

A prova estrutural não demonstra a cabeça corrente do vínculo nem a coerência entre a captura e uma origem JSON mutável; isso continua sob responsabilidade das funções transacionais da Etapa B.

## Prova isolada do adapter local — 2026-10-22

O adapter candidato de filesystem local e o orquestrador de reconciliação foram exercitados juntos apenas com PDF sintético em diretórios temporários do teste. A suíte focada verificou gravação/readback/retry idempotente, conflito de conteúdo sem sobrescrever o primeiro objeto, digest e tamanho, manifestação alterada em quarentena, cópia recém-criada removida se a leitura de retorno falhar, falha de cleanup preservada para recuperação, limites e paths ausentes classificados como indisponíveis, contenção por tenant e recusa de junctions/symlinks de diretório. Resultado focado: 34 testes, 33 aprovados e 1 pulado: o Windows deste ambiente negou permissão para criar symlink de arquivo; junctions e isolamento por diretório foram exercitados. Suíte completa: 341 testes, 340 aprovados, 0 falhas e o mesmo teste de symlink de arquivo pulado. ESLint completo e `pnpm typecheck` passaram. Esta prova não escolhe backend de produção, não lê JSON/PDF local legado e não liga o adapter ao runtime ou ao banco ativo.
