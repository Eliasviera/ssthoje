# PGR — anexos de serviços contratados

## Decisão — 2026-10-31

O usuário definiu o critério como recurso geral de contratação de terceiros para todas as empresas clientes: serviços MEI/ME cuja atividade não faça parte do processo operacional habitual devem receber avaliação/anexo de riscos no PGR da contratante durante a execução e encerramento quando cessarem, com histórico preservado. O caso EMA é apenas exemplo de empresa cliente; não há terceiro contratado cadastrado nela. O enquadramento MEI/ME, a existência de PGR próprio e quem executa são informações distintas. Não se deve inferir dispensa para ME nem riscos/controles pelo porte.

### Base normativa para enquadramento

- NR-1, 1.5.8.1 e 1.5.8.1.1: o PGR da contratante inclui medidas de prevenção para contratadas que atuam nas dependências ou local previamente convencionado, ou utiliza os programas da contratada; se utilizar esses programas, a contratada fornece inventário e plano de ação relativos ao serviço.
- NR-1, 1.5.8.1.2: se o serviço é prestado somente pelo titular ou sócios, a contratante estende suas medidas de prevenção aos riscos da atividade no local aplicável.
- NR-1, 1.8.1 e 1.8.1.1: MEI dispensado de elaborar o próprio PGR; a dispensa não alcança as obrigações preventivas da contratante quando o MEI trabalha nas dependências ou local previamente convencionado.
- NR-1, 1.8.4: a dispensa prevista para ME/EPP de graus de risco 1 e 2 depende das condições do item; não é consequência automática de ser ME.
- NR-1, 1.5.8.4: riscos resultantes da interação entre atividades no estabelecimento exigem medidas definidas em conjunto, sob coordenação da contratante.

A norma trata das condições acima; a seleção de atividade fora do processo operacional habitual é um critério de produto/triagem para orientar a equipe a abrir o anexo, não uma citação literal da NR-1 nem substituto da avaliação profissional.

## Entrega

- Aplicabilidade geral: qualquer empresa cliente que contrate terceiro; o anexo se destina sobretudo a atividade fora do processo operacional habitual da contratante. Local: Empresas → ficha do cliente → PGR da empresa → anexos de riscos dos serviços contratados, para o PGR digitalizado com documento de trabalho existente.
- Cadastro de contratada, enquadramento informado (sem seleção automática), quem executa, local, início e cobertura dos riscos declarada pela equipe. “Não contemplados” ou “Ainda não avaliado” sinalizam necessidade de avaliar a integração ao PGR; não há comparação automática dos riscos. EMA ainda não tem contratadas; é somente exemplo da empresa cliente para um recurso geral.
- Anexo criado em rascunho. Perigos/danos, interferências, medidas/responsabilidades, plano de ação e evidências são informados pela equipe. Nenhum conteúdo técnico foi pré-carregado. Jurídico tem campo de referência/encaminhamento; não foi criado upload ou repositório jurídico restrito.
- Inclusão na prévia do PGR de trabalho exige confirmação explícita, participantes definidos, cobertura avaliada e seções preenchidas. Registra a declaração da conta autenticada; não verifica qualificação, conformidade ou liberação de serviço. Alterar anexo incluído cria nova revisão em rascunho e exige nova inclusão.
- Encerramento exige confirmação da cessação, data real não futura nem anterior ao início, motivo e situação de riscos/ações remanescentes. Não há encerramento por data prevista nem exclusão. O anexo sai da relação atual de incluídos e permanece no histórico. Título/ID/término e encaminhamentos ficam no índice histórico da prévia; ações remanescentes não são resolvidas automaticamente.
- Encerrado é somente leitura; nova atividade exige novo anexo. Cada versão conserva conteúdo, ator, motivo e horário. PDF original intacto.

## Escopo, persistência e limites

- Consultoria da sessão + cliente ativo + unidade e SHA-256 do PGR digitalizado. Action exige `pgr.manage` e obtém tenant/unidade/ator no servidor, ignorando esses valores do navegador.
- Arquivo append-only em `data/pgr-contractor-annexes/<tenant>/<cliente>/<unidade>/<hash>.jsonl`, com lock exclusivo e revisão esperada. Sem migration. Lock abandonado por interrupção exige análise operacional; não é removido automaticamente por idade.
- Fluxo local do PGR de trabalho, ainda sem backend de produção, assinatura, alteração do PDF original ou alimentação automática do inventário PostgreSQL, análise de Terceiros, convites, APR ou PCMSO. Evidências são referências textuais.
- Mudança do hash/origem demanda futura conciliação dos anexos; não são transferidos automaticamente. A consulta histórica é vinculada à origem atual, como as demais edições do PGR de trabalho.

## Verificação

- Comando Node com loader do projeto e testes `pgr-contractor-annex.test.ts`, `pgr-contractor-annex-store.test.mjs`, `pgr-contractor-annex-action.test.mjs`, `pgr-working-store.test.ts`, `pgr-working-document.test.ts` e `pgr-profile-projection.test.ts`: **16/16 aprovados**.
- Cobrem aviso, revisão explícita, conteúdo incompleto, alteração voltando a rascunho, término/data/pendências, histórico, ausência de sessão/permissão, empresa inativa/origem alterada/unidade divergente, identidade derivada do servidor, isolamento entre scopes, revisão obsoleta, lock e preservação de versões.
- `node node_modules/typescript/bin/tsc --noEmit`: código 0. ESLint focado nos arquivos criados/alterados: código 0, repetido para os últimos ajustes e teste da action.
- Navegador: orientação e formulário conferidos na aba PGR do cliente, sem envio de formulário, inclusão/encerramento ou mudança de registro real. Escritas exercitadas apenas com fixtures sintéticas em diretório temporário removido ao final. Não afirmar teste ponta a ponta de salvamento pela interface nem impressão/PDF.
- Evidência sem dados pessoais: `docs/PGR_TERCEIROS_ANEXOS_2026-10-31.png`.

## Arquivos

- `src/lib/pgr-contractor-annex.ts` e `pgr-contractor-annex-store.ts`.
- `src/app/pgr-contractor-annex-actions.ts`, `pgr-contractor-annex-section.tsx`, `pgr-contractor-annex-document.tsx`.
- Integração: `src/app/empresas/[companyId]/page.tsx`, `pgr-working-editor.tsx`, `pgr-working-document.tsx`.
- Os três testes `pgr-contractor-annex*` citados acima.

## Referências para revisão técnica

Brasil: NR-1/MTE, capítulo 1.5 com vigência desde 26/05/2026, especialmente 1.5.8; tratamento diferenciado ao MEI/ME/EPP em 1.8. Texto oficial consultado em 31/10/2026: https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-01-atualizada-2025-i-3.pdf . Orientação MTE sobre MEI: https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/mei . NR-18 deve ser consultada quando aplicável ao cenário de construção. A equipe deve definir o responsável e verificar aplicabilidade/edição ao revisar o serviço concreto. As validações do app são estruturais, sem conclusão normativa automática.

## Próximo passo

Aceite registrado em 31/10/2026: usuário respondeu “Certo, aprovado” após a apresentação da primeira versão, evidência visual e resultados de testes. Aceite restrito ao fluxo estrutural demonstrado (rascunho, inclusão explícita e encerramento com histórico). Não constitui aprovação técnica de anexo concreto, parecer jurídico, assinatura, liberação operacional ou confirmação de teste ponta a ponta pela interface.

Validar criação → inclusão na prévia → encerramento → histórico pela interface em PGR exclusivamente fictício e conferir impressão antes de apresentar como recurso pronto para uso operacional ou divulgação comercial definitiva.
