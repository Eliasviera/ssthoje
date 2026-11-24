# S-2240 — confirmação do vínculo do trabalhador

**Estado:** modelo e fluxo candidatos; não conectado ao runtime e sem dados reais.  
**Data:** 2026-11-15

## Fonte e regra de identificação consultadas

O leiaute oficial S-1.3 consolidado até a NT 07/2026 revisada em 20/10/2026 identifica o trabalhador do S-2240 pelo CPF. A matrícula, quando informada, precisa corresponder à que o empregador declarou para aquele contrato em S-2190, S-2200 ou S-2300. `codCateg` é preenchido somente para TSVE sem matrícula no evento S-2300; nesse caso é obrigatório e exclusivo. A data de início da condição não pode anteceder a admissão do vínculo ou o início da obrigação aplicável ao empregador, conforme validações do leiaute.

O evento identifica também o empregador e o estabelecimento/ambiente. O número de inscrição do empregador deve corresponder ao informado no S-1000; o ambiente próprio precisa existir na tabela S-1005. Esses identificadores não podem ser deduzidos apenas de um nome interno de empresa/unidade.

Fontes: [Leiaute oficial S-2240, NT 07/2026 rev. 20/10/2026](https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-07-2026-rev-20-10-2026/index.html) e [Manual Web Geral do eSocial](https://www.gov.br/esocial/pt-br/empresas/manual-web-geral).

## Mapeamento ao cadastro atual

O `WorkerRecord` atual contém ID interno, tenant, empresa, unidade, nome, função, área, categorias demonstrativas e estado ativo/arquivado. Não contém CPF, matrícula, categoria eSocial, evento de origem, data confirmada de admissão/desligamento, inscrição do empregador ou inscrição eSocial do estabelecimento. Portanto, um worker ativo no SST Hoje não é prova de vínculo ativo no RET (Registro de Eventos Trabalhistas do eSocial).

O usuário já definiu que a lista geral de colaboradores vem do RH por planilha (`DECISION_LOG.md`, 2026-11-12). A decisão ainda não fixou todos os campos gerais da planilha, formato definitivo, frequência de reimportação e autorização para acesso a dados de salário. O modelo daqui descreve apenas o mínimo a verificar para preparar o S-2240; não altera nem resolve o contrato geral de importação de RH.

## Processo candidato

1. Importar uma linha de RH como **informada, ainda não verificada**, sempre ligada ao tenant, empresa e unidade selecionados no servidor.
2. Registrar a origem e a revisão da linha/arquivo sem imprimir CPF em logs. Hash identifica a cópia recebida, mas não prova autoria ou autenticidade.
3. Conferir CPF, matrícula e data de admissão/desligamento contra fonte autorizada do vínculo. Registrar qual evento de origem (S-2190, S-2200 ou S-2300) e recibo/referência sustentam a conferência, quando disponíveis.
4. Confirmar a categoria apenas pela fonte de origem e pela regra aplicável à matrícula. Não inferir categoria pela função, tipo de empresa ou área.
5. Conferir inscrição do empregador e do estabelecimento com cadastros eSocial de referência, relacionando-os ao CNPJ/estabelecimento cadastrado no cliente. Conflitos ficam pendentes para correção.
6. Revalidar no servidor tenant, empresa, unidade, vínculo, estado e fonte imediatamente antes de associar o trabalhador a um período candidato S-2240.
7. Preservar correções e reimportações como revisões. Mudanças de vínculo não reescrevem silenciosamente períodos já preparados ou aprovados.

## Contrato criado

`schemas/esocial-worker-link-candidate.json` descreve somente a estrutura candidata: escopo interno, CPF como valor com origem/estado, matrícula/categoria/admissão/desligamento, evento de origem, inscrições do empregador/estabelecimento, fontes e revisão humana. O registro inicia bloqueado como `draft_pending_verification` e a transmissão é fixada como desligada. O schema não valida CPF de produção, não confirma status no eSocial e não autoriza consulta ao RET.

## Controles de privacidade e autorização

- CPF e identificadores de vínculo devem ter permissão e exposição mínimas, sem CPF em listagens gerais ou telemetria.
- Planilha RH não deve ser copiada para exemplos, screenshots, testes ou logs; usar apenas dados sintéticos se uma prova for autorizada.
- A retenção, exportação e expurgo de dados reais ainda depende da decisão geral 14 de `OPEN_QUESTIONS.md`.
- A autorização para envio é separada do vínculo: mesmo dados conferidos não permitem enviar sem delegação vigente e aprovação por conteúdo pelo cliente, conforme `INTEGRACOES_GOVERNAMENTAIS_CHECKPOINT.md`.
- Consultoria não pode declarar que confirmou um contrato no eSocial sem fonte e evidência apropriadas.

## Aceite futuro antes de implementar

- Decidir a origem aceitável para verificação (arquivo/relatório oficial de eventos ou consulta autorizada) e registrar limites.
- Definir quais papéis podem importar e revisar cada campo; representante legal do cliente aprova o uso para envio.
- Definir retenção, armazenamento protegido e atendimento a correções do RH.
- Provar isolamento entre tenants, empresas e unidades no servidor e impedir IDs de navegador de ampliar escopo.
- Validar condições de matrícula/categoria e vigência contra leiaute/XSD/tabelas oficiais no início da implementação.
- Manter transmissão desligada até adapter oficialmente documentado, homologação e autorização específica de produção.
