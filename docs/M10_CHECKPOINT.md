# M10 — ASO, exames e aptidão

- **Estado:** escopo autorizado pelo usuário ao responder “continua”; demonstração implementada. Em teste pelo usuário; aceite final do M10 pendente.
- **Dependência:** continuidade do M09 e escopo M10 autorizados pelo usuário após apresentação da proposta concreta; registro em DECISION_LOG.md.
- **Objetivo:** demonstrar o registro mínimo de ASO (Atestado de Saúde Ocupacional) com dados inteiramente fictícios, sem prontuário.

## Campos propostos

| Campo | Origem | Visibilidade proposta |
|---|---|---|
| Trabalhador fictício, empresa, unidade e função | Cadastro existente; vínculo validado no servidor | Médico vinculado; administradora/SST para acompanhamento administrativo |
| Data informada do atendimento e referência do ASO | Médico vinculado | Médico vinculado |
| Nome do exame e data informada, sem resultado clínico | Médico vinculado; sem catálogo normativo pré-carregado | Médico vinculado |
| Aptidão informada: não registrada, apto ou inapto | Seleção humana do médico; nunca calculada pelo sistema | Médico vinculado |
| Estado documental: rascunho, em revisão ou revisão interna registrada | Fluxo controlado no servidor | Médico vinculado e acompanhamento administrativo |
| Autor, datas de alteração e número da versão | Servidor | Médico vinculado; administradora/SST recebem apenas versão e última atualização |

Administradora e SST não receberão aptidão, exame, data de atendimento, referência do ASO ou histórico de conteúdo no navegador. A proposta não inclui disponibilizar aptidão ao empregador; essa autorização exige definição separada.

## Fluxo proposto

1. Administradora cadastra trabalhador fictício e vincula o coordenador médico à empresa/unidade pelo mecanismo do M09.
2. Somente esse médico pode iniciar e editar o registro do trabalhador daquela unidade. O acesso ao cadastro é projetado para os identificadores, nome fictício e função necessários ao formulário; não concede acesso geral à seção de trabalhadores.
3. Médico informa os campos e salva versões preservadas. O sistema não prescreve exames nem interpreta resultados ou decide aptidão.
4. Envio bloqueia edição; registro de revisão interna identifica o médico. Revisão simulada não gera assinatura, ASO oficial ou liberação automática do trabalhador.
5. Administradora/SST veem apenas trabalhador, unidade, estado documental, versão e atualização.
6. Cada leitura autorizada e alteração registra ação, ator e identificador; logs não recebem aptidão ou conteúdo do exame.

## Limites propostos para demonstração

- Sem diagnósticos, CID, resultados de exames, anexos, texto clínico livre ou prontuário.
- Sem periodicidades, validade legal ou exigências de exames pré-configuradas.
- Sem assinatura, envio externo ou decisões automáticas de acesso ao trabalho.
- Persistência exclusivamente local de fixtures; sem prazo legal presumido, descarte automático ou apagamento silencioso. A política real de retenção permanece pendente antes de dados reais.
- Profissional habilitado genérico, clientes, terceiros e SaaS Master não acessam o conteúdo.

## Critérios de verificação após aprovação

- Testar vínculo médico, consultoria, trabalhador e unidade em cada leitura/alteração, inclusive identificadores enviados diretamente.
- Testar que o médico não vinculado e os perfis administrativos não recebem os campos restritos ou suas versões anteriores.
- Preservar versões e recusar edição após envio/revisão e atualização com versão desatualizada.
- Testar auditoria sem aptidão/exames, validação de campos e limite de alterações.
- Executar tipos, análise estática, testes de autorização e conferência visual desktop/celular com dados fictícios.
- Registrar checkpoint e obter aceite humano antes de M11.

## Decisão registrada

Usuário respondeu “continua” à proposta concreta de aceite M09 e implementação M10. Responsável: usuário. Data: 2026-10-09. Matriz de campos/acesso e fluxo acima autorizados para demonstração fictícia; decisão registrada antes da implementação.

Essa definição é exigida pelas perguntas 4 e 12 de OPEN_QUESTIONS.md, cuja instrução é: “Registre resposta, responsável, data e impacto em DECISION_LOG.md antes de codificar comportamento de risco.” A autorização para dados reais, retenção definitiva e assinatura não integra esta proposta.

## Trabalho realizado nesta preparação

Lidos AGENTS.md, roadmap, perguntas abertas, checkpoint M09 e estrutura atual de trabalhadores. Criado apenas este documento; nenhum código, dado médico ou permissão foi alterado. Nenhum teste executado nesta preparação documental.

## Implementação e validação

- Registro local em examples/app/data/aso.json; médico vinculado pelo PCMSO recebe apenas o cadastro mínimo dos trabalhadores de suas unidades.
- Exames opcionais: nome e data, até dez itens como limite técnico da demonstração, sem resultados clínicos. Sem catálogo ou periodicidade normativa.
- Aptidão começa como não registrada. Médico seleciona apto/inapto; o envio exige seleção humana salva, sem qualquer inferência de aptidão. Esta é uma verificação de preenchimento do fluxo de teste, não uma regra normativa.
- Estados rascunho, em revisão e revisão interna registrada; histórico com snapshots. Edição bloqueada após envio, versão desatualizada recusada e vínculo rechecado em cada leitura/alteração.
- Administradora/SST recebem somente trabalhador, função, empresa/unidade, estado, versão e atualização. Aptidão, exames, referência, atendimento, conteúdo e versões não integram essa resposta.
- Auditoria de leitura e alteração sem conteúdo de saúde; limite em memória de 30 tentativas de alteração por minuto/usuário. Ações autenticadas no servidor com proteção de origem do Next.js.
- node --experimental-strip-types --test tests/*.test.ts: **20 testes passaram**. Incluem campos inválidos, datas impossíveis, autorização, perda do vínculo, identificadores forjados, isolamento entre consultorias, projeção administrativa, ausência de saúde nos logs, versões, estados e limite de alterações.
- node node_modules/typescript/bin/tsc --noEmit: **passou**, inclusive após ajuste final do formulário.
- ESLint dos arquivos TypeScript alterados e novo teste: **passou**. ESLint do formulário executado novamente após o ajuste final de prevenção de reset: **passou**.
- Navegador: criado Trabalhador fictício M10 na Empresa Fictícia Teste M08 / Unidade fictícia M08. Médico salvou versão 1 com exame fictício A e versão 2 com exames A/B; enviou e registrou revisão interna. Conferidos bloqueio de envio com alterações não salvas e bloqueio de edição após envio.
- Navegador: perfil SST e administradora exibem apenas andamento; conta administradora restaurada em ASO ao final. Isolamento Aurora verificado pelos testes do serviço; não repetido manualmente no navegador nesta etapa.
- Layout médico inspecionado em 1280 pixels e largura móvel de 390 pixels, sem transbordamento horizontal do documento. Evidências em assets/m10-medico.png, m10-medico-celular.png e m10-administradora.png.
- Encontrado reset nativo de campo de data após erro retornado pela ação. Adicionado preventDefault em onReset; o formulário continua limpando por remontagem somente após criação bem-sucedida. O ajuste final requer conferência manual adicional do erro de data durante o teste do usuário.
- Não executados build de produção, testes de carga ou auditoria externa de segurança.

## Roteiro para o usuário

1. Em http://127.0.0.1:3000/, a conta administradora está na seção ASO. Confira o andamento do ASO do Trabalhador fictício M10, versão 2, revisão interna registrada.
2. Para conteúdo médico: Sair; entrar com medico@ssthoje.local e senha MedicoFicticio2026! (conta exclusivamente fictícia local); abrir ASO.
3. Confira exames A/B e aptidão fictícia selecionada pelo médico; expanda Versões preservadas do ASO e Histórico do ASO. O registro revisado não deve permitir edição.
4. Para testar criação: expanda Novo registro fictício, selecione o trabalhador de teste, informe referência/data fictícias, selecione aptidão fictícia e informe exames opcionais. Salve, envie e registre revisão interna.
5. Para retornar à administradora: demo@ssthoje.local / SSTHojeDemo2026! (conta de demonstração M02).
6. Registrar aceite humano do M10 após a conferência, antes de iniciar M11.

## Arquivos alterados/criados nesta etapa

- examples/app/src/lib/aso-store.ts e aso-service.ts: armazenamento, autorização, vínculo, versões e projeções.
- examples/app/src/app/aso-actions.ts e aso-section.tsx: ações e interface.
- examples/app/src/lib/pcmso-store.ts, tenant-access.ts e audit-log.ts: projeção de vínculo médico, permissões e eventos.
- examples/app/src/app/page.tsx, dashboard.tsx e globals.css: integração, navegação e estilos.
- examples/app/tests/aso.test.ts: sete novos testes de cenário; suíte total com vinte testes.
- docs/DECISION_LOG.md, M09_CHECKPOINT.md, M10_CHECKPOINT.md e CHANGELOG.md: decisões, continuidade e validação.
- assets/m10-*.png, examples/app/data/aso.json e workers.json: evidências e fixtures criadas pela interface. Nenhum dado real usado.

## Limitações

Somente demonstração local. Arquivos sem criptografia, limite de requisições em memória, sem transação entre auditoria e registro e sem garantia de gravação simultânea entre múltiplos processos. Habilitação real, retenção definitiva, assinatura e governança de saúde permanecem pendentes antes de dados reais. Revisão interna não gera documento oficial nem libera o trabalhador.

## Continuidade
- Usuário solicitou “pode continuar” após disponibilização da demonstração para teste. Registrada autorização de avanço para M11; não equivale a validação clínica ou produção.
