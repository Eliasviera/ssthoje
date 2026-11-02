# Estratégia de QA

- Unitários: validação de regras, datas, permissões e transições de estado.
- Integração: repositórios, banco, uploads, filas, eventos e adapters.
- Segurança: isolamento tenant A/B, RBAC, IDOR, upload malicioso, prompt injection, rate limit e segredos em logs.
- E2E: fluxos principais com dados sintéticos.
- UI: desktop/tablet/mobile, estados vazios, erro, loading, teclado e foco.
- Resiliência: timeout, retry, idempotência, duplicidade de webhook, falha de e-mail/IA.
- Dados: migrations reversíveis quando viável, backup/restore testado, seeds fictícios.
- Release: smoke tests, observabilidade, plano de rollback e checklist de aprovação.

Toda falha encontrada deve ser corrigida e o teste repetido antes do checkpoint. Registrar comandos reais e resultados reais.
