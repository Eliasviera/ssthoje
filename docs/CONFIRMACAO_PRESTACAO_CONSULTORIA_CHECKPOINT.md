# Confirmação da prestação pelo responsável da empresa — candidato

Data: 2026-11-03. Escopo: prova de servidor/banco descartável; sem rotas ou telas do produto, sem migration ou liberação para clientes.

## Implementação

- `schemas/consultancy-service-confirmation-candidate.sql`: finalidade de autoridade verificada, propostas por empresa/unidade, decisões revisionadas e eventos imutáveis. Reutiliza `operational_authority_candidate.client_registrars` e `registrar_events`; não cria outro cadastro de representantes.
- `examples/app/src/lib/consultancy-service-postgres-candidate.ts`: repositório com pool e autenticação injetados, prévia da proposta, proposta, decisão e consulta de autorização. Tenant/ator vêm do contexto autenticado, não do comando do navegador.
- `examples/app/scripts/verify-consultancy-service-candidate.mjs`: cenários sintéticos dentro do PostgreSQL criado pelo verificador existente. A opção `--verify-service-confirmation` desse verificador executa a nova prova sem carregar `.env` ou pool ativo.

## Autoridade e confirmação

A identidade do representante precisa estar ativa, com papel cliente e designação vigente para a empresa/unidade. A designação operacional de Terceiros sozinha é insuficiente: uma revisão de finalidade específica exige referência de evidência, SHA-256, revisor e validade. Somente o papel confiável de verificação pode registrar essa revisão. Esse papel não é concedido ao runtime e não pode revisar a própria identidade. O registro depende de conferência humana; o hash não comprova autenticidade ou representação sozinho.

O operador verifica a evidência; quem confirma ou recusa é o responsável da empresa, pela própria identidade. Consultor, Master sem vínculo e usuário de outra empresa não confirmam. O runtime não recebe INSERT/UPDATE direto em revisão, proposta ou evento.

Uma proposta contém consultor identificado, empresa/unidade, descrição e validade. A prévia devolve esses dados com a revisão. A proposta não concede acesso operacional. Cada unidade exige sua própria confirmação; não existe expansão automática para toda a empresa. O conteúdo não é alterável pelas funções do runtime: mudança de escopo exige nova proposta, sem reaproveitar um aceite.

Decisões implementadas: pendente→confirmada, pendente→recusada e confirmada→revogada. Cada decisão verifica revisão atual, identidade, finalidade verificada e escopo. Histórico anterior fica preservado. Vencimento é efetivo na consulta de autorização, sem apagar a proposta. Renovação/substituição de vínculo efetivamente vencido ainda não tem fluxo próprio; o candidato não declara o ciclo completo de renovação pronto.

## Autorização no uso

`can_use` exige consultoria ativa, identidade e membership do consultor ativas, empresa ativa, proposta confirmada/vigente para o consultor e a unidade exatos, e autoridade do responsável ainda válida. A finalidade/representante revogados ou vencidos deixam de autorizar novas chamadas. As únicas ações preparadas são `dds.read`, `checklist.read` e `deviation.report`; não concede gestão documental, autoridade médica, assinatura de conformidade ou acesso Master.

Importante: essa função é uma fonte candidata de autorização. Ainda não foi ligada aos leitores/actions/downloads reais de consultor no produto. Portanto, negar `can_use` não é prova de que todas essas rotas já bloqueiam após revogação. O fluxo atual de cliente e as provas anteriores permanecem separados.

## Critério e limites da prova

Validação executada:

- `node --import ./scripts/test-node-loader.mjs --experimental-strip-types scripts/verify-client-company-bindings-isolated.mjs --verify-service-confirmation`: **aprovado, saída zero**, após os ajustes finais. A rotina anterior de vínculos também passou na mesma execução. A prova inclui prévia com revisão/escopo, representante sem revisão de finalidade, finalidade vencida, autoaprovação, Master sem vínculo, outra empresa/tenant, confirmação concorrente, ações fora da lista, suspensão de conta do representante/consultor, perfil administrativo inativo, acesso direto às tabelas, falha na auditoria, recusa e revogação com histórico.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: aprovado. O ESLint focado nos três arquivos TS/MJS novos/alterados também passou.
- As primeiras tentativas de repetição pararam na criação do contêiner, antes dos testes SQL. Docker voltou a criar contêiner local; a última execução completa passou. O timeout do comando Docker foi ampliado de 30 para 60 segundos e o diagnóstico passou a registrar somente código/status/sinal, sem argumentos ou credenciais.
- Consulta final ao Docker não encontrou contêiner da prova ainda em execução. Não houve build Next ou prova de navegador desta nova confirmação.

Provar: consultor não aprova a si mesmo; representante fora de escopo, não verificado, vencido ou revogado é negado; confirmação simultânea exige revisão; falha de auditoria desfaz a decisão; confirmação permite somente unidade/ações preparadas; recusa/revogação/suspensão retiram autorização na chamada seguinte.

Não prova autoridade de pessoa real, processo documental externo, frontend, CSRF/rate limiting de novas rotas (não existem nesta fatia), carga, todos os caminhos operacionais ou produção. Os schemas seguem o padrão SECURITY DEFINER dos candidatos M22; revisão de propriedade/privilégios para implantação continua necessária. A trava do representante deve ser compartilhada pelo fluxo confiável de revogação ao registrar seu evento; o runtime desta fatia não pode inserir eventos de designação/revogação diretamente.

Próximo passo: integrar a prévia/decisão ao ensaio isolado com sessão do responsável, demonstrando visualmente o escopo antes da confirmação, e conectar o gate candidato a uma única leitura/download de consultor. A habilitação no produto depende de prova e aceite específicos.
