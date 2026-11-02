# Segurança, privacidade e dados sensíveis

## Controles mínimos
- Isolamento multi-tenant aplicado no servidor e reforçado por testes automatizados.
- RBAC + escopo por empresa/CNPJ; negar por padrão.
- Dados médicos separados logicamente, permissões específicas e trilha de auditoria de leitura/alteração.
- Criptografia em trânsito e em repouso conforme infraestrutura; gestão de segredos fora do código.
- Validação de upload, limites de tamanho/tipo, antivírus ou verificação equivalente, armazenamento privado e URLs assinadas com expiração.
- Proteção contra CSRF/XSS/SQL injection, rate limiting, headers seguros, sessão segura, MFA para perfis críticos quando aplicável.
- Auditoria append-only ou controles contra alteração indevida; acesso de suporte sempre limitado e auditado.
- Logs sem conteúdo de documentos, tokens, OTP ou informações médicas desnecessárias.
- Retenção, exportação, correção, exclusão e legal hold definidos com assessoria competente.

## Segredos
- `.env.example` deve conter nomes e instruções, nunca valores reais.
- Não solicitar chaves, senhas, tokens, OTPs ou chave privada SSH no chat.
- Credenciais inseridas pelo usuário somente na configuração segura apropriada, com mascaramento e teste de conexão.
- Rotacionar credenciais, aplicar privilégio mínimo e separar sandbox de produção.

## Incidentes
- Processo documentado para triagem, contenção, investigação, comunicação e recuperação.
- Definir responsáveis, severidade, registros e testes de backup/restore.

## Antes da produção
Revisão profissional de LGPD, contratos, bases legais, retenção, dados de saúde, assinatura eletrônica, responsabilidade médica, normas SST e requisitos regulatórios. Este documento é um baseline técnico, não parecer jurídico.
