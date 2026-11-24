# SST Hoje — Blueprint para Codex

**Versão reconstruída:** 1.2.0 · **Data:** 2026-10-08  
**Slogan:** “Não deixa para amanhã.”

Este pacote foi reconstruído a partir do planejamento mantido na conversa após a perda do computador. Ele preserva as decisões e os requisitos conhecidos, mas **não é uma cópia binária do ZIP anterior**. Use-o como fonte de verdade inicial e registre novas decisões no `docs/DECISION\\\_LOG.md`.

## Comece por aqui

1. Abra `START\\\_HERE\\\_CODEX.md`.
2. Coloque a pasta inteira em um diretório de trabalho novo.
3. Abra o diretório no Codex.
4. Cole o prompt de `PROMPT\\\_MESTRE\\\_CODEX.md`.
5. Trabalhe em uma milestone por vez. Não avance além de um checkpoint que exige aprovação humana.

## Princípios inegociáveis

* Multi-tenant desde a fundação; isolamento verificado por testes.
* Segurança, permissões por função, trilha de auditoria e histórico documental.
* IA sugere e extrai; regras determinísticas verificam; pessoas autorizadas validam decisões críticas.
* Documentos enviados são dados não confiáveis: proteção contra prompt injection.
* Produto utilizável sem IA e sem integrações externas.
* Integrações reais apenas depois de telas, dados, adapters e fluxos mock testados.
* Nunca colocar segredos em prompts, repositório ou chat; nunca usar dados reais em seeds.
* Linguagem simples, experiência premium e autoexplicativa para usuários sem conhecimento técnico.

## Estrutura

* `START\\\_HERE\\\_CODEX.md`: roteiro inicial.
* `AGENTS.md`: instruções permanentes para agentes.
* `PROMPT\\\_MESTRE\\\_CODEX.md`: prompt para iniciar a execução.
* `docs/ROADMAP.md`: milestones M00–M21.
* `docs/PRODUCT\\\_REQUIREMENTS.md`: requisitos de produto.
* `docs/SECURITY\\\_AND\\\_PRIVACY.md`: segurança e privacidade.
* `docs/AI\\\_DOCUMENT\\\_PIPELINE.md`: pipeline de documentos e IA.
* `docs/DESIGN\\\_SYSTEM.md`: sistema visual.
* `docs/UAT\\\_CHECKPOINT\\\_TEMPLATE.md`: modelo de checkpoint para aprovação.
* `docs/OPEN\\\_QUESTIONS.md`: decisões que não devem ser inventadas.
* `docs/DECISION\\\_LOG.md`: decisões registradas.
* `schemas/tenant.json`: contrato inicial de tenant.
* `examples/milestone-report.yaml`: exemplo de relatório.

**Aviso:** este blueprint é uma especificação de produto e engenharia, não substitui validação jurídica, médica, normativa ou de segurança antes de produção.

