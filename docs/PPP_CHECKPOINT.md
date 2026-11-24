# PPP — checkpoint de escopo e critérios

**Estado:** proposta documental; módulo não implementado.  
**Data:** 2026-11-15  
**Escopo:** organizar a preparação e conferência do Perfil Profissiográfico Previdenciário (PPP) por trabalhador e período, mantendo separação explícita do PPP eletrônico oficial.

## O que a pesquisa oficial estabelece

- Para períodos trabalhados a partir de **01/01/2023**, o PPP é emitido exclusivamente em meio eletrônico e fica disponível ao segurado pelo Meu INSS.
- O PPP eletrônico é formado pelas informações de SST declaradas no eSocial, em particular o histórico de condições ambientais do evento **S-2240**; mudanças nas condições formam períodos do histórico laboral.
- A empresa deve manter o conteúdo coerente com o **LTCAT** que o fundamenta. O eSocial esclarece que a responsabilidade técnica de SST se relaciona ao LTCAT; o PPP é elaborado pelo representante legal da empresa com poderes para isso.
- Por consequência, o SST Hoje não deve rotular uma minuta local como PPP eletrônico emitido, nem alegar transmissão ao eSocial ou ao Meu INSS sem integração oficial e recibo comprovável.

Fontes oficiais consultadas em 2026-11-15:

- [Serviço oficial Emitir PPP Eletrônico — INSS](https://www.gov.br/pt-br/servicos/emitir-ppp-eletronico-perfil-profissiografico-previdenciario)
- [Manual Web Geral do eSocial — eventos SST](https://www.gov.br/esocial/pt-br/empresas/manual-web-geral)
- [FAQ oficial de produção e ambiente de testes do eSocial — responsabilidade e coerência com LTCAT](https://www.gov.br/esocial/pt-br/empresas/perguntas-frequentes/perguntas-frequentes-producao-empresas-e-ambiente-de-testes/)
- [Notícia oficial do INSS sobre PPP eletrônico e períodos anteriores a 2023](https://www.gov.br/inss/pt-br/noticias/perfil-profissiografico-previdenciario-ppp-ja-esta-disponivel-no-meu-inss)

## Arquitetura observada

- O app executável está em `examples/app` (Next.js/TypeScript), com dados locais e partes do domínio em PostgreSQL.
- Há cadastros de trabalhadores/empresa/unidade e documentos versionados; a categoria `LTCAT` já existe.
- `src/app/pgr-ltcat-draft.tsx` produz roteiro de apoio a partir de PGR e alerta que não emite LTCAT nem conclui exposição.
- O snapshot de referências eSocial já contempla a Tabela 24/S-2240, mas não há transmissão de eventos, recibos ou controle de protocolos eSocial.
- Não foi localizada rota ou armazenamento de PPP no runtime.

## Proposta de milestone PPP

Construir um módulo de **preparação e conferência**, com:

1. Seleção explícita de trabalhador, empresa/unidade, vínculo e intervalo laboral, sempre revalidada no servidor para o tenant ativo.
2. Períodos de exposição com datas, função/atividade, setor, agentes e medidas de controle, vinculados à fonte documental e à revisão vigente do LTCAT. Valores ausentes viram pendências; não são inferidos do PGR.
3. Referências aos dados/eventos S-2240 e S-2220 somente quando fornecidas/importadas por fonte e versão identificadas; não afirmar que foram transmitidos ou aceitos pelo eSocial sem protocolo verificável.
4. Rascunho imprimível claramente rotulado **“apoio interno — não é PPP eletrônico oficial”**, com campos incompletos e divergências destacados.
5. Revisão humana, registro de autor/revisor, origem das informações, versão e auditoria; revisões anteriores preservadas como históricas, sem substituição silenciosa.
6. Exportação somente de cópia de conferência, sem declaração automática de conformidade, enquadramento previdenciário ou direito a benefício.

## Critérios de aceite propostos

- Acesso e toda leitura/escrita são restritos ao tenant, empresa e unidade no servidor; identificadores fornecidos pelo navegador não ampliam escopo.
- Somente trabalhadores vinculados ao escopo selecionado podem ser associados; nenhum vínculo, período ou exposição é criado por inferência automática.
- Uma minuta não pode ser marcada como PPP oficial ou como transmitida. O estado de transmissão só poderá existir em milestone separada, com integração/documentação oficial, recibo e aprovação explícita.
- Cada período exibe origem, revisão e estado de conferência do LTCAT; lacunas e divergências impedem apresentar o conjunto como pronto.
- Versionamento e trilha de auditoria preservam todas as revisões.
- Testes de autorização cobrem leitura/escrita entre tenants e entre empresas/unidades.
- Conferência visual e aceite humano antes de conectar a dados reais ou alterar fluxo de produção.

## Decisões necessárias antes da implementação de fluxo real

1. O PPP interno deverá cobrir apenas histórico e conferência para períodos anteriores a 2023, ou também preparar dados que serão transcritos/conferidos no fluxo do PPP eletrônico do eSocial?
2. Quais funções podem criar, revisar e autorizar a minuta? A fonte oficial indica o representante legal da empresa para elaboração do PPP; quais representantes terão identidade e delegação registradas no SST Hoje?
3. Quais dados do vínculo e do trabalhador estarão disponíveis no cadastro (matrícula, admissão/desligamento, CBO, categoria, lotação) e qual fonte os confirma?
4. Como registrar/importar evidências do S-2240 e os períodos históricos, já que o app atualmente não transmite eSocial?
5. Qual política de retenção, exportação e acesso se aplica ao histórico previdenciário individual? A pergunta geral 14 em `OPEN_QUESTIONS.md` ainda está aberta.
6. Há autorização e conteúdo revisado para gerar formulário histórico em papel? Um modelo genérico não deve ser apresentado como formulário oficial vigente sem fonte e versão confirmadas.

## Limites

Este checkpoint não altera dados de trabalhadores/empresas, não gera PPP, não implementa regra previdenciária no código, não cria integração eSocial e não substitui revisão profissional/jurídica. Referências normativas e técnicas devem ser revalidadas no início da implementação.

## Decisão do usuário — integração governamental preparada com autorização por cliente

Em 2026-11-15, o usuário definiu que o SST Hoje deve deixar disponíveis as opções necessárias para preparar envios a órgãos governamentais. A autorização para efetivar os envios será concedida pelo cliente de cada empresa atendida. A decisão vale como direção de produto para integrações governamentais, além do PPP, mas não constitui autorização de transmissão nem escolha do canal técnico.

Consequências para o desenho:

- Preparar catálogo de integrações/eventos por órgão, com estado explícito (disponível, requer configuração, autorização pendente, pronto para homologação, homologação aprovada, produção autorizada, suspenso), sem apresentar integração inexistente como disponível.
- Cada empresa/cliente deverá conceder e poder revogar autorização de forma autenticada e auditável, vinculada ao CNPJ, aos eventos, ao canal, ao ambiente e à vigência autorizados. Uma autorização de uma empresa nunca se estende a outra empresa do tenant.
- Separar perfis e etapas: preparação dos dados, revisão técnica, aprovação do representante autorizado do cliente, transmissão e conferência de recibo. Não enviar em nome do cliente antes da autorização vigente e da confirmação final da ação.
- Preparar opções para certificados do próprio cliente e procuração eletrônica/delegação, sem armazenar chaves privadas no SST Hoje; os meios efetivamente aceitos dependem do órgão, do evento e do contrato oficial de integração.
- Implementar adapters por órgão, leiautes versionados, validação pré-envio, ambiente de homologação, idempotência, recibos, rejeições, retificação/exclusão quando suportadas, auditoria e monitoramento. Recursos sem suporte oficial devem aparecer como indisponíveis, não simulados.
- Este aceite não aprova canal, fornecedor, credenciais, retenção, dados reais, envio automático ou produção. Esses pontos exigem revisão e checkpoints específicos antes de transmissão real.
