# Isolamento de empresas e autoridade de acesso

## Checkpoint de prova local — 2026-11-03

**Aceite humano em 2026-11-03:** usuário respondeu “aprovado” ao resultado deste checkpoint, incluindo as limitações declaradas. Aceite da prova local automatizada; a validação com duas contas independentes no navegador e o provisionamento confiável permanecem pendentes. Não constitui liberação para contas cliente ou produção.

Acrescentado `examples/app/tests/client-company-isolation.test.mjs`. A prova executa autorização, resolução de vínculo, leitores filtrados, escrita de desvios e rotas de PDF reais. Somente a sessão, a invalidação de cache do Next e o catálogo de empresas são simulados. Os arquivos de dados são inteiramente sintéticos e ficam em diretório temporário; nenhum cadastro ativo ou banco é utilizado.

Resultados observados:

- Uma conta cliente fictícia com vínculo alternado entre duas empresas da mesma consultoria vê somente a empresa e a unidade autorizadas nos leitores DDS/checklist e no catálogo filtrado.
- PDFs próprios de DDS/checklist retornam 200, conteúdo PDF e `private, no-store`; IDs de outra empresa, unidade ou tenant retornam 404.
- Registro de desvio nega escopo ausente, outra empresa e unidade não autorizada. A gravação válida usa tenant e ator do servidor, ignorando esses campos adulterados no formulário. A troca do vínculo oculta o desvio anterior mesmo quando o autor é o mesmo.
- Revogar o vínculo mantendo a identidade da sessão bloqueia novas chamadas de leitura, download e gravação. Ausência, duplicidade, expiração e JSON inválido também negam acesso.
- A conta cliente não recebe permissões para gerir DDS, aplicar checklist ou tratar desvios.

Validação: `node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test --test-concurrency=1 tests/client-company-isolation.test.mjs tests/tenant-access.test.ts`: **17 testes aprovados, zero falhas** (inclui teste agrupador e cinco subtestes novos). Execução autorizada fora da restrição de subprocessos, em diretórios temporários. `node node_modules/eslint/bin/eslint.js tests/client-company-isolation.test.mjs`: aprovado.

Limites: não é prova de duas contas independentes no navegador, provisionamento de cliente direto, vínculo de prestação de consultoria ou PostgreSQL. O teste alterna vínculos da mesma conta de demonstração para provar os dois escopos sem adicionar contas ao runtime. O cadastro confiável de vínculos continua pendente; módulos não liberados permanecem negados ao cliente. Nenhum código de produção, permissão, dado ativo ou documento regulatório foi alterado nesta prova. O aceite completo abaixo permanece aberto. Não houve nova compilação ou inspeção visual, pois somente teste e documentação foram acrescentados.

Próximo passo recomendado: definir e provar o provisionamento autenticado de duas contas cliente independentes e seus vínculos autoritativos, antes de habilitar essa modalidade. O aceite humano de liberação permanece obrigatório.

Decisão confirmada pelo usuário em 2026-11-02 durante o trabalho de convites e encerramento de testes.

## Regra de produto confirmada

| Situação | Acesso aos dados operacionais |
| --- | --- |
| Empresa usando o sistema | Somente aos dados da própria empresa. Não pode consultar outra empresa por lista, URL, identificador, busca, relatório, download ou API. |
| Elias presta a consultoria | Seu painel de consultoria pode acessar as empresas efetivamente vinculadas à sua prestação de serviço, conforme permissões e escopo registrados no servidor. |
| Elias vende somente o sistema | Os dados ficam restritos ao responsável autorizado da empresa contratante. Ser fornecedor ou Master da plataforma não concede leitura do conteúdo operacional. |
| Administração da plataforma/Master | Configuração comercial/técnica e contagens administrativas previstas. Não concede automaticamente acesso a documentos, trabalhadores, riscos, assinaturas, fotografias ou saúde. |

“Empresa” aqui significa o cliente cujo conteúdo deve ser isolado. Uma consultoria pode atender várias empresas, mas a conta de uma empresa atendida não pode herdar o acesso global da consultoria. Grupos com vários CNPJs precisam de escopo explicitamente autorizado; não há agrupamento automático por nome, e-mail, CNPJ ou titularidade de cobrança.

O painel de consultoria e o painel Master são papéis de acesso distintos, mesmo quando pertencem à mesma pessoa. O acesso de consultoria depende do vínculo de prestação do serviço. Nenhum novo vínculo foi criado por esta decisão.

As regras médicas existentes permanecem aplicáveis: ser responsável pela empresa ou administrador não concede automaticamente papel médico. Esta decisão não resolve delegação a outros usuários nem representação legal por inferência.

## Estado atual conferido

- `tenant-context.ts` usa a sessão do servidor e `requireTenantAccess`; o navegador não escolhe livremente a consultoria autorizada.
- `tenant-access.ts` separa o Master das memberships operacionais. O Master não possui membership de consultoria por padrão.
- A ficha em `src/app/empresas/[companyId]/page.tsx` busca a empresa dentro do tenant autorizado. A prova visual anterior confirmou 404 ao usar, pela segunda conta, a URL da empresa da primeira.
- O cadastro de testadores atual cria ambientes de **consultoria** com papel `consultoria_admin`. Ele não implementa a modalidade comercial de empresa contratante direta.
- As memberships legadas não têm vínculo de empresa/unidade. Permissões como leitura de DDS/checklists são concedidas por papel no tenant. **Isso não comprova isolamento entre empresas atendidas que compartilham uma consultoria.** Não habilitar contas de empresas atendidas com acesso a esse tenant sem aplicar o escopo de empresa em todos os leitores e mutações correspondentes.
- A autoridade candidata M22 já distingue `direct_client` de `consultancy`, mas seu bootstrap/grants relacionais não são o cadastro JSON de convites e não foram conectados por esta decisão.

Portanto, a prova entre duas consultorias/tenants não deve ser apresentada como prova completa da modalidade “venda somente do sistema” ou do escopo de cliente dentro de uma consultoria.

Validação executada nesta conferência: 42 testes focados aprovados, incluindo teste adicional em `tests/tenant-access.test.ts` para negar 13 permissões operacionais ao Master com e sem tenant informado e para negar a troca de tenant entre os dois administradores fictícios. TypeScript e ESLint focado passaram. Essas provas não cobrem ainda dois responsáveis de empresas distintas dentro de uma mesma consultoria; esse critério permanece abaixo.

## Critério de aceite da implementação seguinte

1. Provisionamento confiável registra a modalidade: consultoria ou cliente direto. Cliente direto recebe ambiente próprio e responsável autenticado/designado; não recebe `consultoria_admin` como atalho.
2. Contas de empresas atendidas recebem escopo de empresa/unidade no servidor. Todas as consultas/mutações/downloads intersectam esse escopo com tenant e permissão; o menu não é controle de autorização.
3. O consultor só recebe acesso às empresas vinculadas ao serviço. Suspensão/revogação do vínculo retira o acesso nas requisições seguintes, incluindo sessões abertas e links aplicáveis.
4. O Master segue sem acesso automático ao conteúdo dos clientes que compraram somente o sistema. Uma eventual política de suporte excepcional exigirá decisão específica; não foi criada aqui.
5. Provas sintéticas cobrem duas empresas na mesma consultoria, dois tenants independentes, empresa contratante direta, fornecedor sem vínculo de consultoria, tentativa de alterar tenant/companyId e revogação. Incluir leitura, escrita e download em cada módulo antes de habilitá-lo.

Próxima meta: concluir o desenho da fonte autoritativa desses vínculos e adaptar a autorização central e os consumidores. Não provisionar cliente direto ou novas contas cliente no tenant compartilhado antes desse aceite. Nenhuma conta existente, permissão, documento, migration ou banco ativo foi alterado nesta conferência.
