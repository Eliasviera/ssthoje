# Roadmap — 23 milestones (M00–M22)

Cada milestone deve terminar com QA, revisão visual quando houver UI e checkpoint. Dependências não podem ser puladas.

| ID | Milestone | Escopo / aceite mínimo |
|---|---|---|
| M00 | Descoberta e ambiente | Inspecionar repo, stack, comandos, plano incremental, decisões e riscos documentados. Não construir funcionalidades grandes. |
| M01 | Fundação da aplicação e design system | App executável, tokens, tipografia Manrope, layout responsivo, navegação e estados vazios/erro/loading. |
| M02 | Identidade, autenticação e sessão | Login/logout, sessão segura, recuperação planejada, mensagens úteis; contas fictícias apenas. |
| M03 | Multi-tenant, RBAC e auditoria | Tenants, membros, papéis, escopo de acesso no servidor, trilha auditável e testes de isolamento. |
| M04 | Cadastro de clientes e CNPJs | Consultoria, empresas clientes, múltiplos CNPJs/unidades, contatos e estado de cadastro. |
| M05 | Trabalhadores, funções e riscos | Cadastro mínimo, vínculos, funções, perigos/riscos e histórico de mudanças. |
| M06 | Documentos SST e versionamento | Upload, metadados, status, vigência, versão, substituição e arquivamento sem apagar histórico. |
| M07 | Avaliação de documentos e conformidade | Checklist configurável, regras com fonte/versão/vigência, pendências e evidências. |
| M08 | PGR e documentos do cliente direto | Fluxo de elaboração assistida, revisão, exportação e aprovação por pessoas autorizadas. |
| M09 | PCMSO e fluxo médico responsável | Escopo mínimo, responsabilidade do coordenador médico, permissões restritas; sem prontuário completo por padrão. |
| M10 | ASO, exames e aptidão | Registrar apenas campos necessários, acesso restrito, estados e validação por profissional habilitado. |
| M11 | Terceiros e envio documental | Portal/link de envio, empresa contratada, CNPJ relacionado, lista de documentos e confirmação. |
| M12 | Pendências, correção e reavaliação | Atribuição, evidências, comentários, reenvio e reavaliação por perfis autorizados. |
| M13 | EPI e aceite do trabalhador | Itens/entregas, comprovante, fluxo mock de link/OTP, trilha de auditoria e estados claros. |
| M14 | Painel operacional e notificações | Pendências prioritárias, prazos configuráveis, deduplicação, preferências e histórico de notificações. |
| M15 | SaaS Master e gestão de tenants | Visão administrativa, estado dos tenants, suporte controlado, limites e ações auditadas. |
| M16 | Planos, módulos, limites e créditos | Mensal/anual, add-ons/overrides, armazenamento, uso de IA e limites configuráveis. |
| M17 | Billing e ciclo comercial | Assinaturas, eventos de cobrança, falhas, cancelamentos, estornos/disputas e reconciliação preparados. |
| M18 | Landing page e CMS | Textos, imagens, FAQ, planos e conteúdo editável com preview e publicação auditável. |
| M19 | Integrações externas em sandbox | E-mail/SMTP/OTP, Asaas, API OpenAI; adapters, webhooks assinados, idempotência e instruções didáticas. |
| M20 | Governança, resiliência e readiness | Filas/retries/DLQ/outbox, status, incidentes, retenção/export/legal hold, governança normativa, performance e acessibilidade. |
| M21 | Hardening, UAT e produção | Testes de segurança, carga e regressão, backup/restore, observabilidade, UAT assinado, plano de rollback e checklist de lançamento. |
| M22 | Persistência transacional | Migrar gradualmente os stores locais para PostgreSQL, com escopo tenant no servidor, transações por caso de uso, auditoria append-only, migração/rollback ensaiados e concorrência sem perda de atualização. |

## Faixas
- Fundação: M00–M03
- Núcleo SST: M04–M10
- Terceiros e operação: M11–M14
- SaaS/comercial: M15–M18
- Integrações: M19
- Governança/readiness: M20
- Hardening e produção: M21
- Persistência transacional: M22

## Regras de avanço
- Uma milestone ativa por vez.
- Não considerar concluída apenas por compilar: executar testes, verificar fluxo e corrigir falhas.
- Checkpoint de usuário obrigatório para mudança visual/fluxo principal e antes de integrações com efeitos externos.
- Não declarar pronto para produção sem revisão profissional das regras SST/médicas/legais.
