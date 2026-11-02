# M07 — Avaliação configurável, fontes e evidências

- **Estado:** implementação local concluída; aguardando conferência manual do usuário.
- **Local:** checklist dentro de **Documentos** em http://127.0.0.1:3000/.
- **Acesso:** administradora cria critérios; administradora e profissional SST registram avaliações, conforme permissão `documents.review`.
- **Persistência:** `examples/app/data/compliance.json`, arquivo local ignorado pelo Git.
- **Demonstração:** use dados e evidências fictícios; todos os arquivos locais são texto sem criptografia.

## O que está disponível

- Critérios livres, sem regras legais ou técnicas pré-carregadas.
- Campos de fonte, jurisdição/âmbito, versão, tipo de documento, data inicial/final da vigência e responsável pela revisão.
- Nova revisão de regra preserva a anterior e incrementa a versão.
- Avaliação vinculada a uma versão de documento e a uma regra vigente do mesmo tipo.
- Resultados: atende ao critério registrado, pendente, inconclusivo ou não aplicável.
- Justificativa obrigatória; descrição de evidência para os resultados aplicáveis; PDF de evidência opcional.
- Pendência/resultado inconclusivo exigem responsável e próximo passo. Nenhum prazo é presumido.
- Avaliações são acrescentadas ao histórico com snapshots das referências e das versões de documento/regra.
- Eventos de criação de critério e avaliação são registrados na auditoria do tenant.

## Conferência manual

1. Entre com a conta de demonstração da administradora Horizonte configurada por `SST_DEMO_EMAIL` e `SST_DEMO_PASSWORD` no `.env.local`.
2. Em **Documentos**, cadastre um critério fictício, com uma referência e vigência de demonstração.
3. Confira fonte, jurisdição, versão, vigência e responsável na lista de critérios.
4. Registre avaliação de um PDF fictício; teste um resultado pendente com responsável e próximo passo.
5. Confira a avaliação no histórico e tente criar uma nova revisão do critério; a anterior deve continuar listada como substituída.
6. Entre como profissional SST configurado por `SST_DEMO_SST_EMAIL` e `SST_DEMO_SST_PASSWORD`: deve conseguir avaliar e consultar, sem cadastrar critério.
7. Entre como administradora Aurora, configurada por `SST_DEMO_TENANT_B_EMAIL` e `SST_DEMO_TENANT_B_PASSWORD`: não deve acessar os dados da Horizonte.

## Limitações

- Checklist não é parecer de conformidade nem substitui profissional habilitado ou revisão jurídica/técnica.
- Fonte e vigência são informadas pelo usuário e não verificadas automaticamente.
- Não há regra legal pré-carregada, prazo padrão, extração de PDF, análise por IA ou motor de conformidade.
- Evidências ficam como texto ou link para PDF fictício da mesma consultoria; sem criptografia ou antivírus.
- Uso restrito a dados fictícios até existir armazenamento protegido, revisão profissional e governança aprovados.

## QA

- `pnpm lint`: passou, sem avisos.
- `pnpm typecheck`: passou, incluindo a validação da sessão que apareceu no trecho enviado.
- `pnpm build`: passou em diretório temporário isolado, sem o aviso de `Date.now()` no prerender; o servidor aberto manteve `.next` em uso.
- Testes automatizados e revisão visual pelo navegador: não executados nesta alteração.

**Decisão necessária:** confira cadastro da regra, revisão, avaliação e isolamento entre consultorias. Aprove M07 ou indique ajustes antes de avançar.
