# M05 — Trabalhadores, funções e riscos

- **Estado:** aceito pelo usuário ao solicitar continuação; conferência manual continua recomendada.
- **URL:** http://127.0.0.1:3000/
- **Acesso:** administradora cria/arquiva; profissional SST consulta os vínculos do próprio tenant.
- **Persistência:** `examples/app/data/workers.json`, ignorado pelo Git.
- **Privacidade:** arquivo sem criptografia. Use somente dados fictícios; não há campos de saúde, documentos pessoais ou endereço.

## Escopo disponível

- Vincular um nome fictício e função a uma empresa e unidade já cadastradas.
- Categorias ilustrativas de risco: ruído, ergonômico, químico, biológico, acidente e outro.
- Categorias servem apenas para organização inicial. Não são laudo, enquadramento normativo ou avaliação de exposição.
- Consultoria e unidade são verificadas no servidor; empresa arquivada não aceita novo vínculo.
- Arquivar/reativar mantém o cadastro e inclui o evento no histórico do vínculo.
- Editar função/categorias registra quais campos mudaram, sem copiar seus valores para a auditoria.
- Histórico de criação e mudanças de situação, além dos eventos gerais na auditoria.
- Dados ficam vinculados ao tenant e são lidos somente após verificação de permissão.

## Conferência manual

1. Entre como administradora Horizonte: `demo@ssthoje.local` / `SSTHojeDemo2026!`.
2. Em **Trabalhadores**, crie um vínculo usando empresa/unidade fictícias cadastradas na M04.
3. Confirme função, unidade, categorias e histórico de criação.
4. Edite a função ou as categorias; confirme que a mudança aparece no histórico.
5. Arquive e reative o vínculo; confira o histórico de situação.
6. Reinicie o servidor e confira a persistência.
7. Entre como profissional SST e confirme que pode consultar sem criar/editar/arquivar.
8. Entre como administradora Aurora e confira que não vê os vínculos da Horizonte.

## QA

- `pnpm lint`: passou.
- `pnpm typecheck`: passou.
- `pnpm build`: passou, sem avisos.
- Testes automatizados e revisão visual pelo navegador: não executados nesta alteração.

**Decisão necessária:** confira o fluxo e aprove M05 ou indique ajustes antes de avançar.
