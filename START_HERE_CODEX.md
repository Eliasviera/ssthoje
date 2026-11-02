# START HERE — SST Hoje

## Objetivo
Construir o SaaS **SST Hoje**, para consultorias de Saúde e Segurança do Trabalho, com fluxo didático, rastreável e seguro. O slogan é **“Não deixa para amanhã.”**

## Antes de começar
- Trabalhe numa pasta nova e mantenha este blueprint dentro do repositório.
- Verifique se o Codex está aberto na raiz do projeto.
- Se ainda não existir aplicação, comece por M00: inspecionar ambiente, propor stack com justificativa curta e registrar decisões antes de implementar.
- Não suponha que há código anterior no computador danificado.

## Método obrigatório
1. Leia `AGENTS.md`, `docs/ROADMAP.md` e apenas os documentos relacionados à milestone ativa.
2. Escolha uma única milestone ativa.
3. Implemente uma fatia vertical pequena e funcional.
4. Rode lint, typecheck, testes e build aplicáveis.
5. Inspecione visualmente os fluxos e corrija problemas.
6. Repita os testes após as correções.
7. Entregue o checkpoint no formato de `docs/UAT_CHECKPOINT_TEMPLATE.md`.
8. Se o checkpoint exigir teste/aceite do usuário, pare e aguarde. Não implemente a próxima tela dependente sem aprovação.

## Cada checkpoint precisa informar
- URL local/preview e como iniciar o projeto.
- Usuário e senha exclusivamente de demonstração, se houver autenticação.
- Perfil/role usado e dados fictícios disponíveis.
- Passos numerados e resultado esperado em linguagem simples.
- O que é funcional de verdade e o que é mock.
- Testes executados e resultados.
- Limitações conhecidas e como reportar divergência.

## Custos e agentes
- Use subagentes apenas quando tarefas puderem ser isoladas e o paralelismo economizar tempo.
- Use as skills disponíveis e relevantes; não crie delegações por rotina.
- Carregue contexto progressivamente, não leia todos os documentos em toda tarefa.
- Não peça ao usuário para copiar segredos para o chat.

## Ordem geral
Fundação M00–M03 → núcleo SST M04–M10 → terceiros e operação M11–M14 → SaaS e comercial M15–M18 → integrações M19 → resiliência M20 → UAT/produção M21.
