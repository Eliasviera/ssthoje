# M20 — Roteiro consolidado para aceite demonstrativo

Estado em 2026-10-11: implementação demonstrativa e verificações registradas; aceite humano final aprovado pelo usuário. Este documento consolida o estado atual e não substitui os registros históricos das fatias. M21 não iniciado.

## Conferência na interface

| Área | Onde conferir | Resultado esperado |
|---|---|---|
| Fila | Master → Operação local | Três tarefas: duas concluídas e uma falha definitiva. Zero tarefas e eventos pendentes. |
| Recuperação | Histórico da tarefa de 13:53:00 | Duas falhas com intervalos de 5 e 10 segundos, sucesso na terceira; um evento entregue. |
| Falha definitiva | Histórico da tarefa de 12:39:29 | Três falhas preservadas, sem conclusão artificial. |
| Governança | Master → Governança local | Política revisão 1, 45 dias, bloqueio ativo; zero elegíveis. Incidente resolvido com três etapas no histórico. Resolver incidente não elimina falha da fila. |
| Referências | Conta da consultoria → Documentos → Checklist → Revisar fontes e referências | Critério fictício M20, versão 1; histórico de precisa de revisão e referência conferida. Master não tem acesso técnico. |
| Teclado | Tab e Enter nos formulários e históricos | Foco visível, campos com nomes, justificativa obrigatória bloqueando envio vazio; históricos com contexto do registro. |

Não é necessário criar novos registros para a primeira conferência. Se testar alterações, use justificativas fictícias e preserve o histórico. Não inserir dados reais.

## Evidências e estado atualizado

- Última suite completa: 104 testes aprovados, zero falhas (M20_DATAS_CHECKPOINT.md). Correção de vigência usa America/Sao_Paulo no checklist e nas referências.
- Último build: m20-20261011135919, aprovado com TypeScript e 19 páginas; lint dos dois painéis alterados aprovado. Não houve novo teste/build nesta consolidação documental.
- Fila, governança e referências: M20_CHECKPOINT.md, M20_GOVERNANCA_CHECKPOINT.md, M20_REFERENCIAS_CHECKPOINT.md.
- Acessibilidade pontual: M20_ACESSIBILIDADE_CHECKPOINT.md. Sem certificação WCAG ou teste audível de leitor de tela.
- HTTP de produção local: M20_DESEMPENHO_CHECKPOINT.md. Seis respostas públicas 200, HTML completo entre 34,6 e 112,2 ms; sem Core Web Vitals, rede móvel ou teste de carga.

## Limites que permanecem

JSON local e processo único; sem banco transacional ou coordenação entre processos. Fila processada por clique, adaptadores fictícios e nenhum envio externo. Retenção apenas simulada, sem descarte; exportação não é backup completo nem tem restauração. Referências declaradas pelo operador, sem verificação automática de fonte ou habilitação. Avaliação de PDF com a nova conferência não foi percorrida visualmente de ponta a ponta; gate coberto no serviço e integrado na action.

## Registro de aceite

Aceite humano: APROVADO. O usuário declarou explicitamente “APROVO O M20” nesta conversa. Aceite da demonstração fictícia com os limites documentados; não autoriza produção ou integrações reais.

A instrução permanente em AGENTS.md exige: “Cada milestone tem critério de aceite e checkpoint. Pare quando o aceite humano for obrigatório.” Esta consolidação deixa o resultado concreto para essa conferência.

