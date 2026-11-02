# Migração do checklist de Terceiros para o gate versionado

Status: preparação aprovada em 2026-10-16. Não aplicar migration, importação ou corte nesta etapa.

## Origem e destino

O campo legado `thirdPartyRequirements` pertence à empresa no cadastro atual. O destino candidato é um conjunto de requisitos por `tenant + empresa + unidade`, com revisão, vigência, itens e trilha de auditoria.

O importador futuro deverá criar somente a primeira revisão quando existir checklist explícito. Um checklist ausente não significa dispensa e não deve gerar conjunto vazio nem decisão liberada.

## Regras de reconciliação

1. Ler Empresas e Compliance em modo somente leitura e calcular hashes antes e depois.
2. Criar proposta apenas para empresa e unidade ativas com documentos permitidos e sem duplicidade.
3. Marcar ASO como requisito médico restrito, sem PDF, conteúdo clínico ou avaliação no portal.
4. Preservar o arquivo legado durante toda a reconciliação; não usar escrita dupla.
5. Exigir conferência completa de tenant, empresa e unidade no destino antes de qualquer corte.
6. Importar critérios e avaliações em lote separado, preservando versão, fonte, vigência, responsável e snapshots.

## Estado atual

O dry-run encontrou duas unidades ativas, sem checklist explícito, um critério ativo e nenhuma avaliação de contratada. Portanto, a proposta atual contém zero conjuntos e zero itens. O próximo preenchimento deve ser feito por uma pessoa responsável, com base no contrato, atividade e riscos aplicáveis.

## Configuração declarada para a Caldeiraria

Em 2026-10-16, a pessoa responsável declarou para a unidade da Caldeiraria: PGR, PCMSO, LTCAT, ficha de EPI, treinamento e ASO. O ASO terá a observação restrita “aptidão para trabalhos críticos”, que exige revisão médica e não autoriza armazenar ou exibir conteúdo clínico, diagnóstico, exame ou aptidão individual.

Esta configuração permanece pendente de persistência no modelo versionado. Requisitos adicionais no futuro criarão uma nova revisão do conjunto, preservando a versão anterior.
