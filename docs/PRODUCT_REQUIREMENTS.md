# Requisitos do produto

## Públicos e estrutura
- SaaS multi-tenant vendido a consultorias de SST.
- Uma consultoria atende múltiplas empresas; uma empresa pode ter vários CNPJs/unidades.
- Papéis distintos para SaaS Master, administradores da consultoria, SST/TST, cliente, terceiros e profissionais habilitados. Permissões sempre verificadas no servidor.

## Dois fluxos principais
1. **Terceiros contratados pelo cliente:** enviam PDFs e evidências existentes (PGR, PCMSO, documentos de trabalhadores, treinamentos etc.). A consultoria verifica escopo, validade, assinatura quando aplicável, funções, aptidão e evidências. O sistema lista conformidades, incertezas e pendências, com rastreabilidade. Não presumir que a consultoria cria os documentos dos terceiros.
2. **Cliente direto da consultoria:** a consultoria cadastra trabalhadores, funções e riscos, realiza avaliação e pode elaborar/gerar documentos SST no escopo contratado, com revisão e aprovação adequadas.

## Documentos e pendências
- Guardar arquivo original, metadados, versões, data de recebimento, origem, status, vigência e vínculo empresa/CNPJ.
- Substituição muda qual versão é vigente, sem apagar versões anteriores.
- Pendências mostram motivo, evidência, responsável, data, estado e próxima ação.
- Prazos e regras de correção são configuráveis e precisam ser confirmados por especialistas; não codificar prazos legais presumidos.
- Busca global respeita autorização e escopo do tenant.

## Dados médicos e documentos
- PCMSO é responsabilidade do coordenador médico competente; geração, revisão e assinatura só por profissional autorizado.
- ASO/exames/aptidão são dados sensíveis, com acesso mínimo necessário e logs de acesso.
- Não construir prontuário médico completo sem decisão explícita de escopo, base legal e governança.
- Regras de conformidade precisam indicar fonte, jurisdição, versão, vigência, responsável pela revisão e estado de aprovação.

## EPI e assinatura
- Fluxo de recebimento de EPI com registro do item, trabalhador, data, evidência e aceite.
- Pode usar link de assinatura e OTP por e-mail, inicialmente simulado.
- Antes de produção, validar identidade, expiração, replay, trilha de auditoria e adequação jurídica. Não prometer validade legal automaticamente.

## Administração SaaS
- SaaS Master: tenants, planos, preço mensal/anual, módulos, limites, créditos de IA, armazenamento, add-ons/overrides, pagamentos, integrações, logs/filas, suporte, diagnóstico, segurança, auditoria e métricas unitárias.
- Landing/CMS: textos, imagens, FAQ e planos editáveis com revisão/preview.
- Preparar arquitetura para plano de consultoria/parceiros sem implementar cedo demais.

## UX e acessibilidade
- Interface responsiva, PWA se viável, desktop com sidebar e mobile/tablet com navegação inferior.
- Verde chá claro e verde floresta, gradientes discretos, Manrope, ícones consistentes, espaçamento generoso, fonte legível.
- Toda configuração explica o que faz, onde afeta, como obter credenciais e como corrigir erros.
- Metas de referência: WCAG 2.2 AA, teclado, foco visível, contraste, rótulos e mensagens acionáveis.
- Datas/timezone explícitos; notificações com dedupe e quiet hours configuráveis.

## Requisitos operacionais
- Exportação, retenção, offboarding, legal hold e descarte controlado.
- Idempotência, retries, dead-letter queue, outbox e logs sem segredos.
- Plano de resposta a incidentes, página de status, backup/restore, monitoramento e rollback.
- Matriz de navegadores/dispositivos, metas de performance e escalabilidade documentadas.
