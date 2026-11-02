# Plano de testes — SST Hoje

**Base:** blueprint v1.2.0  
**Estado atual:** especificação; ainda não há aplicação executável neste pacote.

Este documento transforma os requisitos de `PRODUCT_REQUIREMENTS.md`, `SECURITY_AND_PRIVACY.md`, `AI_DOCUMENT_PIPELINE.md`, `ROADMAP.md` e `schemas/tenant.json` em cenários verificáveis. Os cenários de funcionalidades só poderão ser executados quando a respectiva milestone estiver implementada. Use dados totalmente fictícios.

## 1. Como registrar resultados

Para cada cenário, registre: estado (`Pendente`, `Aprovado`, `Falhou` ou `Bloqueado`), versão/build, data, responsável, evidência sem dados pessoais reais e observação. Uma falha deve indicar passos para reproduzir, resultado obtido e resultado esperado. Não marque como aprovado algo que não foi executado.

## 2. Verificação atual do pacote — M00

| ID | Verificação | Resultado esperado | Estado inicial |
|---|---|---|---|
| M00-01 | Conferir os arquivos de entrada listados no README | README, instruções, roadmap, requisitos, segurança, design, questões, decisões, QA, checkpoint, schema e exemplo existem | Pendente |
| M00-02 | Conferir ordem e dependências do roadmap | M00 inicia a execução; milestones M01–M21 estão ordenadas; nenhuma funcionalidade é antecipada | Pendente |
| M00-03 | Conferir decisões e dúvidas | Decisões reconstruídas estão identificadas; dúvidas em aberto não aparecem como decisões confirmadas | Pendente |
| M00-04 | Validar `schemas/tenant.json` como JSON e contra seu próprio schema | Arquivo parseia e aceita um objeto de tenant válido; entradas inválidas são rejeitadas | Pendente |
| M00-05 | Revisar riscos de segurança documentados | Escopo de tenant no servidor, RBAC, dados fictícios, proteção de documentos e revisão humana estão contemplados | Pendente |
| M00-06 | Confirmar que não há código de produto no pacote | O relatório M00 descreve o pacote como blueprint, sem declarar app ou testes de produto executados | Pendente |

## 3. Casos essenciais por área

### Fundação, identidade e isolamento — M01–M03

- **TEN-01 — Isolamento entre tenants:** usuário do tenant A tenta consultar, alterar ou excluir registros do tenant B, inclusive trocando IDs na requisição. Esperado: acesso negado no servidor, sem revelar dados de B; tentativa registrada conforme política de auditoria.
- **TEN-02 — Tenant adulterado pelo navegador:** cliente envia identificador de tenant diferente. Esperado: servidor usa o escopo autorizado da sessão e rejeita o acesso indevido.
- **AUTH-01 — Permissões por função:** repetir uma ação permitida e uma proibida com cada perfil. Esperado: autorização verificada no servidor; interface não é a única barreira.
- **AUTH-02 — Sessão:** testar login, logout, expiração e acesso a rota protegida sem sessão. Esperado: comportamento seguro e mensagens compreensíveis.
- **UI-01 — Estados e acessibilidade:** navegar por teclado e leitor de tela; verificar foco visível, rótulos, contraste e estados vazio, erro e carregamento em desktop e mobile.

### Clientes, dados SST e documentos — M04–M10

- **CAD-01 — Empresas e unidades:** cadastrar empresa fictícia com mais de um CNPJ/unidade e verificar associação correta e escopo autorizado.
- **DOC-01 — Histórico documental:** enviar nova versão e arquivar/substituir documento. Esperado: versão anterior permanece consultável, com status e histórico, sem apagamento silencioso.
- **DOC-02 — Upload inválido ou malicioso:** testar tipo, tamanho e conteúdo não permitido. Esperado: validação segura, rejeição clara e nenhum processamento inseguro.
- **AI-01 — Instruções dentro de documento:** incluir texto que tente comandar o sistema/IA. Esperado: conteúdo é tratado como dado não confiável; não altera permissões nem executa ações.
- **AI-02 — Extração estruturada:** fornecer documento fictício com campos conhecidos, ausentes e ambíguos. Esperado: schema validado; evidências e incertezas preservadas; nenhuma decisão crítica aprovada automaticamente.
- **SST-01 — Regras e fontes:** verificar que regra normativa apresenta fonte, jurisdição, versão, vigência e responsável pela revisão; informação sem esses dados não deve ser apresentada como regra vigente confirmada.
- **MED-01 — Dados sensíveis e decisão clínica:** perfis sem autorização tentam ver/alterar dados médicos ou aptidão. Esperado: acesso negado; decisão médica permanece sob profissional habilitado.

### Terceiros e operação — M11–M14

- **PORT-01 — Link de envio:** enviar documento fictício pelo fluxo de terceiro. Esperado: vínculo com empresa/CNPJ correto, confirmação clara e acesso limitado.
- **PEND-01 — Correção e reavaliação:** atribuir pendência, anexar evidência, reenviar e reavaliar. Esperado: histórico rastreável e transições permitidas conforme perfil.
- **EPI-01 — Aceite simulado:** percorrer link/OTP em modo mock, incluindo OTP inválido, expirado e válido. Esperado: estados e trilha de auditoria claros; nenhuma alegação automática de validade jurídica.
- **NOTIF-01 — Prazos configuráveis:** configurar prazo de demonstração e verificar notificação, deduplicação e preferências; não assumir prazo legal fixo sem fonte revisada.

### SaaS, comercial e integrações — M15–M19

- **ADMIN-01 — Ação administrativa:** usuário sem perfil master tenta administrar tenant. Esperado: negação no servidor e registro auditável.
- **BILL-01 — Eventos de cobrança simulados:** repetir evento, falhar cobrança e cancelar. Esperado: processamento idempotente e estado consistente; sem cobrança real no ambiente de teste.
- **INT-01 — Integrações em sandbox:** testar sucesso, timeout, erro e repetição para e-mail, OTP, cobrança e IA usando adapters/mocks. Esperado: segredos não aparecem em logs e falhas não corrompem estado.
- **WEBHOOK-01 — Assinatura e duplicidade:** rejeitar webhook com assinatura inválida e processar evento repetido sem duplicar efeitos.

### Governança e liberação — M20–M21

- **REC-01 — Resiliência:** testar retry, fila de falhas, indisponibilidade e recuperação. Esperado: falhas observáveis, sem perda silenciosa ou efeitos duplicados.
- **PRIV-01 — Retenção e exportação:** verificar regras aprovadas de retenção, exportação e bloqueio legal conforme política definida, sem apagar histórico obrigatório.
- **REL-01 — Backup e restauração:** restaurar backup em ambiente isolado e conferir integridade e isolamento entre tenants.
- **REL-02 — Segurança e regressão:** executar testes automatizados, revisão de segurança, carga e regressão conforme escopo; registrar resultados reais e plano de rollback.
- **UAT-01 — Aceite humano:** seguir o checkpoint da milestone com perfil e dados fictícios. Esperado: aceite explícito ou lista de correções antes de avançar para milestone dependente.

## 4. Portões para avançar

1. Na M00, validar o pacote, resolver ou registrar dúvidas e documentar stack/comandos antes da implementação.
2. Em cada milestone, executar apenas os cenários aplicáveis às funcionalidades existentes e registrar resultados reais.
3. Corrigir falhas e repetir os cenários afetados antes do checkpoint.
4. Exigir testes de isolamento de tenant e autorização antes de liberar dados multi-tenant.
5. Exigir revisão humana para checkpoints de produto e revisão profissional apropriada para regras SST, médicas, legais e prontidão de produção.

## 5. Limitação deste plano

Este arquivo é uma matriz de cenários, não uma suíte automatizada. Como o pacote atual contém documentação, exemplos e um schema — sem aplicação, banco ou configuração de ferramentas de teste — não há comandos de teste de produto a executar ainda. Na M00, os checks de existência, consistência e validação do schema podem ser automatizados após a stack e o ambiente serem definidos.
