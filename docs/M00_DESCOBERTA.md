# M00 — Descoberta e ambiente

**Data:** 2026-10-08  
**Estado:** concluída como inspeção; proposta técnica aguarda validação humana.  
**Escopo:** preparar a reconstrução sem criar funcionalidades de M01.

## O que foi encontrado

- Pacote de planejamento do SST Hoje, versão reconstruída 1.2.0.
- Documentos de produto, segurança, design, roadmap, QA e decisões.
- Logo em `assets/`, exemplo de relatório e `schemas/tenant.json`.
- Nenhum código de aplicação, configuração de dependências ou histórico Git nesta pasta. O pacote não permite recuperar literalmente o programa perdido; será necessário reconstruí-lo a partir da especificação.

## Ambiente inspecionado

- Windows x64.
- Node.js `v24.19.0` disponível.
- pnpm `11.25.0` disponível.
- npm, Docker e PostgreSQL local não foram encontrados nos comandos disponíveis.
- `schemas/tenant.json` foi lido pelo Node.js e parseou como JSON válido. Isso não substitui validação completa contra JSON Schema.
- `git status` não pôde ser usado: esta pasta não é um repositório Git.

## Proposta técnica para aprovação

- **Interface e servidor web:** Next.js com TypeScript, para manter telas e rotas do produto numa aplicação web única.
- **Estilos:** CSS com tokens do design system SST Hoje e fonte Manrope.
- **Banco de dados quando necessário:** PostgreSQL, com execução local ou serviço de desenvolvimento decidido antes da M03.
- **Testes:** testes unitários e de integração para regras e permissões; testes de navegador para fluxos principais quando houver telas.
- **Dependências:** pnpm, já disponível no ambiente.

Essa é uma proposta, não uma escolha final confirmada. A implementação precisará verificar a disponibilidade de dependências e registrar detalhes de banco e hospedagem antes de depender deles. Não usar documentos ou dados reais de trabalhadores como dados de teste.

## Riscos e dúvidas que continuam abertas

- Sem cópia do código antigo, nomes de telas e comportamentos não descritos no blueprint podem precisar ser decididos durante a reconstrução.
- Banco, hospedagem e processo de publicação não estão definidos.
- As questões normativas, médicas, jurídicas, de cobrança e integrações permanecem abertas conforme `OPEN_QUESTIONS.md`.
- O pacote atual não pode executar testes funcionais de produto porque ainda não existe aplicação.

## Próxima etapa

Após aprovação da proposta de stack, iniciar M01: criar a fundação executável, identidade visual básica, navegação responsiva e estados vazios/erro/carregamento. Não iniciar autenticação nem funcionalidades SST antes do checkpoint de M01.

## Checkpoint para validação

- **Milestone:** M00 — Descoberta e ambiente
- **Estado:** pronto para validação da proposta
- **URL / comando:** ainda não há aplicação executável.
- **Conta demo / perfil:** não aplicável nesta etapa.
- **Dados preparados:** nenhum dado pessoal; somente especificações do produto.
- **Funcional de verdade:** inspeção das pastas e verificação de parse do JSON descritas acima.
- **Mock:** nenhuma tela ou fluxo de produto implementado.
- **QA executado:** `node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('schemas/tenant.json','utf8')); console.log('tenant.json: JSON válido');"` — passou. `node --version` — `v24.19.0`. `pnpm --version` — `11.25.0`.
- **QA não executado:** testes automatizados de aplicação, lint, typecheck, build e verificação visual; não existe aplicação/configuração para executá-los.

**Decisão necessária:** aprova a proposta Next.js + TypeScript + pnpm, com PostgreSQL quando a etapa de dados chegar? Se aprovar, começo M01. Se preferir outra tecnologia, diga qual ou descreva sua preferência.
