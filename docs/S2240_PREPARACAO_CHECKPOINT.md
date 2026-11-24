# S-2240 — preparação interna para futura homologação

**Estado:** contrato documental candidato; não gera XML/payload oficial, não conecta ao eSocial e não transmite.  
**Data da revisão das fontes:** 2026-11-15  
**Foco:** preparar o histórico de condições ambientais por trabalhador necessário para alimentar, quando corretamente declarado pelo empregador, a formação do PPP eletrônico.

## Fontes oficiais consultadas

- [Leiautes eSocial S-1.3, NT 07/2026 revisada em 20/10/2026](https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-07-2026-rev-20-10-2026/index.html): estrutura S-2240, campos, grupos e regras vigentes consultadas nesta data.
- [Manual Web Geral — S-2240](https://www.gov.br/esocial/pt-br/empresas/manual-web-geral): orientações operacionais, histórico, informações de ambiente, atividade, agente, EPC/EPI e responsáveis.
- [MOS S-1.3 consolidado até NO 07/2026](https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-07-2026-com-marcacoes.pdf): regras gerais e lógica do histórico laboral.
- [Serviço PPP eletrônico — INSS](https://www.gov.br/pt-br/servicos/emitir-ppp-eletronico-perfil-profissiografico-previdenciario): confirma que o PPP eletrônico é obtido pelo segurado no canal oficial.

As versões/leiautes devem ser atualizados antes de implementar conversão ou integração real. Não codificar prazo, códigos ou regras de aplicabilidade como constantes permanentes sem controle de versão e revisão.

## O que o evento representa

O S-2240 declara condições ambientais do trabalho e agentes nocivos/atividades da Tabela 24. As informações prestadas compõem o PPP eletrônico. O evento exige uma **data de início da condição**; mudanças posteriores originam novo evento com o retrato completo da condição a partir daquela data. O MOS determina replicar informações que continuam válidas no novo período, não agrupar alterações ocorridas em datas diferentes e manter coerência com eventos anteriores.

A fonte oficial atualmente consultada apresenta, entre outros grupos/campos: identificadores do empregador e vínculo; data inicial e, para categorias específicas de trabalhador avulso, data final; ambiente/setor; descrição de atividades; um ou mais agentes; informações condicionais de EPC/EPI; responsáveis pelos registros ambientais e observações. Os detalhes e ocorrências variam conforme categoria e leiaute.

## Mapeamento de fontes do SST Hoje

| Parte da preparação | Fonte candidata no app | Estado e lacuna |
|---|---|---|
| Tenant, empresa e unidade | Cadastros atuais de consultoria, cliente e unidade | Há chaves internas; validar vínculo e CNPJ cadastral real no domínio do cliente antes de mapear para o empregador/estabelecimento eSocial. |
| Trabalhador | `worker-store.ts`: ID, empresa/unidade, nome, função, área e categorias demonstrativas | Faltam CPF, matrícula, categoria e admissão validados como dados do vínculo do eSocial. A importação de planilha/PDF pode conter dados extraídos, mas não é fonte verificada. |
| Período da condição | Não existe registro versionado de exposição individual com datas | Deve ser novo domínio temporal. Não inferir início pela admissão, cadastro de trabalhador, versão do PGR ou data do LTCAT. |
| Ambiente/setor e atividade | PGR estruturado quando existente; `worker.area` e `worker.jobTitle` | Campos atuais são insuficientes para o leiaute. A descrição tem de ser confirmada para a atividade real, ambiente e período selecionados. |
| Agente nocivo | Associação manual opcional da Tabela 24 no risco estruturado do PGR | Referência/código selecionado não comprova exposição. A aplicabilidade, descrição e período precisam de revisão profissional e fonte previdenciária correspondente. |
| Evidência e responsável ambiental | Documentos versionados e roteiro preparatório do LTCAT | Vincular à versão vigente e às evidências originais; identificar quem elaborou o LTCAT/documento aceito e os dados profissionais exigidos. A minuta do LTCAT não é evidência de LTCAT emitido. |
| EPC/EPI | Registros atuais de medidas no PGR e módulos EPI | Não mapeiam necessariamente os campos condicionais do S-2240 nem provam eficácia. Exigir revisão/correspondência ao agente e ao período; CA consultado manualmente não valida eficácia previdenciária. |
| Recibo e histórico transmitido | Nenhum no domínio S-2240 | Futuro módulo precisa preservar payload aprovado, recibo, retornos e eventos posteriores com versão e idempotência; nada disso existe atualmente. |

## Contrato preparado

Criado `schemas/esocial-s2240-preparation-candidate.json`, deliberadamente separado do leiaute eSocial. Seu objetivo é organizar rascunho interno com:

- escopo tenant/empresa/unidade/trabalhador;
- cada valor acompanhado de estado de completude e referências de origem;
- períodos, ambientes, atividades, agentes, medidas e responsáveis com revisão humana;
- fontes documentais com tipo, revisão, status e hash opcional;
- estados separados de revisão técnica e aprovação do cliente, associados ao hash da versão;
- transmissão desativada, adapter `none` e recibo nulo por contrato.

O schema não implementa validação estrutural em runtime, não monta evento oficial e não contém dados pessoais de teste.

## Linha do tempo interna — proposta de versionamento

Criado `schemas/esocial-s2240-timeline-candidate.json` para organizar vários períodos relacionados ao mesmo vínculo do trabalhador. É uma camada interna e não copia o XML do governo.

O contrato de identidade e conferência do vínculo está em `schemas/esocial-worker-link-candidate.json`; o fluxo, as fontes e as lacunas estão em `S2240_VINCULO_CHECKPOINT.md`. Esses registros são separados da linha do tempo de exposição: corrigir uma identificação de vínculo exige revisão e não deve reescrever snapshots antigos.

- Cada período possui identificador e revisão; a edição cria nova revisão/snapshot, preservando a anterior e seu histórico.
- O novo período aponta para o anterior (`supersedesPeriodId`), registra data efetiva, motivo da mudança e seções alteradas. Seções mantidas precisam ser confirmadas explicitamente, pois o leiaute oficial exige que o novo evento descreva a situação completa naquela data.
- A fotografia completa guarda ambiente, setor, atividade, agentes, evidências de medidas e responsáveis. Campos sem fonte ou sem revisão ficam pendentes.
- Revisão técnica, aprovação do cliente e hash da fotografia ficam separados. Mudança de conteúdo deve invalidar aprovação/hash anteriores; o schema sozinho não executa esse comportamento.
- Cada transição entra no histórico append-only; período substituído continua consultável. Não há recibo ou transmissão neste modelo.

Datas coincidentes, sobreposições, vínculo ativo, sequência de eventos, categoria do trabalhador e regras especiais de trabalhador avulso requerem validação de servidor baseada no leiaute vigente. Não devem ser aceitas apenas por validação de formulário/schema. A autorização não é aplicar datas retroativas por inferência: a data efetiva deve ter origem/evidência e ser confirmada pela pessoa responsável.

## Bloqueios antes de uma tela de preparação

1. Definir fonte confiável e fluxo de importação/confirmacão para CPF, matrícula, categoria, admissão, estabelecimento/CNPJ e vínculos no RET. Esses dados devem ser coletados minimamente e protegidos.
2. Conectar o modelo temporal candidato a um domínio persistente apenas após especificar autorização, armazenamento e retenção; snapshots completos, datas efetivas, origem, preservação append-only e isolamento tenant/empresa/unidade precisam de prova no servidor.
3. Vincular trabalhador a risco/grupo exposto e avaliação correspondente do PGR/LTCAT com vigência e evidência, sem automatizar enquadramento.
4. Definir a origem autorizada e validação de responsável pelos registros ambientais; não assumir que perfil interno de TST atende a qualificação/requisito do documento de origem.
5. Conferir leiaute integral do S-2240, XSD vigente, Tabelas 24/23/28 pertinentes, regras do vínculo e os campos condicionais de EPC/EPI antes de escrever o conversor.
6. Definir retention, criptografia, minimização, papéis e acessos para CPF, vínculos, payloads, hash, recibos e histórico.
7. Só então criar fluxo de revisão por técnico, autorização da empresa cliente e aprovação por conteúdo; aprovação não poderá ser reutilizada após qualquer mudança.

## Fases e aceite proposto

### Preparação interna sem transmissão

- Receber/importar dados com origem identificada; cada campo ausente ou sem comprovação permanece pendente, não é inferido.
- Permitir selecionar manualmente trabalhador, empresa/unidade, período, fontes e códigos; servidor revalida todo o escopo.
- Mostrar prévia legível com todas as lacunas e comparativo à versão anterior do período.
- Criar snapshot versionado ligado à revisão do LTCAT, inventário e evidências, sem declarar conformidade ou exposição automaticamente.
- Revisão técnica e aprovação do representante autorizado ficam separadas e auditadas.
- Nenhuma chamada de rede, credencial, XML de produção, declaração de “pronto no eSocial” ou recibo simulado.

### Futuro adapter de homologação

- Especificação de conversão mapeada campo a campo ao leiaute oficial, XSD e tabelas vigentes.
- Cliente oficial em adapter isolado; mock claramente identificado; credencial e autorização por cliente/ambiente.
- Testar validações, categorias, datas, alterações simultâneas, duplicidade, rejeição, retry e revogação no ambiente de homologação.
- Preservar cada payload aprovado e o retorno oficial; não tratar aceite estrutural local como recebimento pelo governo.

### Produção

Só após aprovação de segurança/privacidade, revisão técnica/jurídica, autorização específica do cliente e do canal, homologação e checkpoint separado. Envio deve exigir ação explícita e aprovação vinculada ao hash exato do conteúdo.

## Próximo passo independente

Antes de codificar a tela, decidir e documentar a fonte dos identificadores de vínculo e o procedimento de revisão do responsável técnico/representante. Nenhuma regra de preenchimento ou prazo pode ser inferida dos dados atuais do SST Hoje.
