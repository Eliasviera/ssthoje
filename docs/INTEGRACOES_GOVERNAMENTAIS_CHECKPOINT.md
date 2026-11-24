# Integrações governamentais — catálogo e preparação

**Estado:** checkpoint de produto e arquitetura; nenhum envio governamental foi implementado ou autorizado.  
**Data:** 2026-11-15  
**Decisão-base:** a plataforma deixa opções preparadas; cada empresa cliente autoriza separadamente qualquer envio em seu nome.

Artefatos candidatos criados nesta etapa:

- `schemas/government-integrations-catalog-candidate.json` — contrato de validação da estrutura do catálogo.
- `schemas/government-transmission-authorization-candidate.json` — estrutura candidata para delegação por empresa/serviço, aprovação de conteúdo e revogação.
- `schemas/esocial-s2240-preparation-candidate.json` — estrutura interna candidata para reunir dados/fontes do S-2240, com transmissão fixada como desativada.
- `schemas/esocial-s2240-timeline-candidate.json` — estrutura candidata para períodos completos e históricos preservados do trabalhador, também sem transmissão.
- `schemas/esocial-worker-link-candidate.json` — registro candidato para conferir vínculo/identificadores de trabalhador com suas fontes, ainda bloqueado para preparação até revisão.
- `examples/government-integrations-catalog-candidate.json` — registros iniciais dos serviços encontrados no inventário, com transmissão explicitamente desativada.
- `S2240_PREPARACAO_CHECKPOINT.md` — leiaute oficial consultado, mapeamento às fontes atuais do app e bloqueios antes de tela/conversor.
- `S2240_VINCULO_CHECKPOINT.md` — campos mínimos de conferência do vínculo e limites do cadastro atual.

A página autenticada de consulta `/integracoes-governamentais`, acessível pelo atalho em `/referencias`, consome a cópia local `examples/app/src/lib/government-integrations-catalog.json`, necessária para o Next.js resolver o catálogo dentro da raiz do app. Ela deve permanecer sincronizada com `examples/government-integrations-catalog-candidate.json`. A página é somente leitura e usa escopo de sessão/tenant. Os schemas de autorização e S-2240 continuam candidatos sem validação conectada, armazenamento de autorização, credenciais ou chamadas externas; nenhuma transmissão é habilitada.

### Autorização — integração com vínculos existentes

A inspeção encontrou candidatos M22 para identidade do tenant, designação de representantes e vínculo da conta cliente a empresa/unidades (`schemas/client-company-bindings-candidate.sql` e contratos relacionados). O vínculo cliente-empresa serve para limitar o escopo de leitura/ação no app; **não comprova, por si só, poderes legais para declarar ou transmitir dados a um órgão**. Não criar cadastro paralelo de representantes.

Proposta de duas camadas, ainda não implementada:

1. **Delegação vigente por empresa e serviço:** pessoa autenticada já identificada no mecanismo de representantes, com evidência revisada de poderes, empresa/unidades, órgão, evento/serviço, versão de leiaute, ambiente, início/fim de vigência e revogação. A evidência precisa apontar para documento/referência protegidos; hash isolado não prova autenticidade.
2. **Aprovação por operação:** antes de cada envio, representante autorizado confere e aprova a versão exata do conteúdo (hash), empresa/unidade, evento, ambiente e destinatário. Qualquer edição invalida a aprovação anterior. Autorizar acesso geral não aprova conteúdo futuro.

O servidor deve resolver identidade, empresa, tenant, grants e vigência da delegação a partir da sessão/fonte confiável; nunca aceitar `tenantId`, `companyId`, poder legal ou estado de autorização como autoridade fornecida pelo navegador. Revalidar imediatamente antes do envio. Revogação, suspensão, vencimento ou mudança do payload bloqueia a operação. O evento de auditoria precisa registrar a cadeia entre delegação, aprovação, payload e recibo sem copiar segredos.

**Pendente de decisão:** quais evidências e processo de revisão comprovam representante legal/procurador; quais papéis internos podem preparar e revisar tecnicamente cada evento; se a mesma pessoa pode aprovar e transmitir; e qual provedor/fluxo autenticará a assinatura ou procuração aceita pelo órgão. Até isso ser definido e revisado, os contratos ficam no plano candidato.

## Princípio operacional

O SST Hoje poderá preparar dados e eventos, mas não transmite em nome de uma empresa sem autorização autenticada, vigente, específica para aquele CNPJ/evento/ambiente e confirmada para a operação. A autorização pode ser revogada. Autorização, credencial ou procuração de um cliente nunca se aplica a outro cliente do mesmo tenant.

Separar sempre estes estados, sem saltos automáticos:

1. **Preparação** — dados reunidos e associados às fontes.
2. **Validação** — leiaute, campos obrigatórios, vínculos e versão conferidos.
3. **Revisão técnica** — responsável revisa conteúdo técnico e pendências.
4. **Aprovação do cliente** — representante autenticado aprova aquele envio e conteúdo.
5. **Autorização do canal** — delegação/certificado válido para empresa, órgão, evento e ambiente.
6. **Transmissão** — ação explícita, idempotente e auditada.
7. **Retorno oficial** — protocolo/recibo, rejeição ou processamento, preservado com o evento enviado.
8. **Correção** — retificação/exclusão apenas se o leiaute e o órgão suportarem, com novo vínculo de histórico.

Homologação e produção são ambientes independentes. Aprovação em homologação não autoriza produção. Não usar etiquetas “disponível” ou “pronto para enviar” quando só existe referência, formulário ou protótipo.

## Catálogo inicial conhecido

| Órgão/canal | Serviço/evento | Situação atual no SST Hoje | Próxima preparação | Limite/observação |
|---|---|---|---|---|
| eSocial | S-2210 — CAT | O app monta CAT de demonstração; não transmite | Definir contrato do adapter oficial, leiaute vigente, validação, autorização por cliente, homologação, recibo/rejeição e retificação | CATWeb continua canal oficial alternativo conforme o caso; este checkpoint não muda a decisão existente de “cliente transmite” até milestone própria |
| eSocial | S-2220 — monitoramento de saúde | Consulta local da Tabela 27 e associações manuais; não gera nem transmite evento | Modelar minimização e acesso clínico, campos do leiaute, vínculo com registros autorizados e validação médica | ASO/app não equivale a evento aceito; conteúdo de saúde requer acesso restrito |
| eSocial | S-2240 — condições ambientais/agentes nocivos | Consulta local da Tabela 24 e associação manual a risco estruturado; não gera nem transmite evento | Modelar períodos, trabalhador/vínculo/lotação, agentes e evidências; vincular ao LTCAT vigente; validar evento por versão | PGR e associação de código não comprovam exposição previdenciária |
| INSS / Meu INSS | PPP eletrônico | Sem integração direta. PPP eletrônico é formado a partir de informações SST declaradas no eSocial | Manter rastreabilidade dos eventos aceitos e preparar conferência/consulta de documento obtido por canal oficial, se houver mecanismo permitido | Não inventar endpoint de transmissão do PPP nem anunciar PDF interno como PPP oficial |
| Previdência / CATWeb | CAT eletrônica | Sem adapter; o módulo de acidentes não transmite | Investigar canal técnico oficialmente suportado e permissões antes de qualquer adapter; manter instrução de transmissão pelo cliente | A decisão atual é apenas montar CAT e registrar dados de transmissão externa |
| CAEPI / MTE | Consulta de Certificado de Aprovação | Consulta manual; integração automática explicitamente pendente | Só construir adapter quando houver API/documentação e permissão oficial de uso; começar por contrato mock isolado | Formulário Web Forms/desafio anti-automação observado; scraping não está autorizado |
| Outros órgãos | A definir pelo produto e cliente | Nenhuma integração identificada no inventário atual | Incluir no catálogo somente com órgão, serviço, fundamento, documentação, campos e responsável identificados | Não criar transmissões genéricas ou presumir APIs |

## Registro de autorização por cliente — campos mínimos de desenho

- Identificador do tenant e do CNPJ/estabelecimento abrangidos, derivados e conferidos no servidor.
- Órgão, serviço/evento, versão do leiaute, finalidade e ambiente (homologação ou produção).
- Representante do cliente autenticado, evidência de poderes/delegação, data/hora, vigência e escopo.
- Canal escolhido: certificado do próprio cliente, procuração/delegação ou outro mecanismo formalmente aceito pelo órgão; status e validade, sem guardar chave privada ou senha no SST Hoje.
- Pessoas/roles autorizadas a preparar, revisar, aprovar e transmitir, cada uma revalidada no servidor.
- Ação explícita de aprovação ligada ao hash/versão do conteúdo a transmitir; alteração do conteúdo invalida a aprovação anterior.
- Revogação, expiração e suspensão bloqueiam novas transmissões. Revalidar também imediatamente antes da chamada externa.
- Auditoria append-only: autor, revisor, aprovador, transmissor, horários, versão do payload, ambiente, chave de idempotência, resposta/protocolo e mudanças posteriores.

## Contrato técnico por adapter

Cada integração futura terá pacote isolado por órgão: interface interna estável; implementação mock determinística; cliente oficial separado; esquemas/leiautes versionados com fonte, versão e vigência; validação pura antes de rede; timeout/retry com idempotência; prevenção de duplicidade; fila e estado consultável; armazenamento protegido de payload e recibo; classificação de erros; rate limit; auditoria; métricas sem dados pessoais; desligamento emergencial; e instruções de configuração/revogação.

O mock serve apenas para testes e deve exibir “simulação”; nunca cria protocolo ou recibo com aparência oficial. Nenhuma chave privada de cliente deve ser carregada em fixture, log ou repositório. A assinatura/transmissão com certificado deve ocorrer sob mecanismo aprovado, com consentimento do cliente e sem custódia desnecessária de segredo.

## Fases e critérios de aceite

### Fase A — fundação sem rede

- Catálogo de órgãos/serviços e estados claros, sem prometer suporte inexistente.
- Contratos tipados, leiautes versionados, validações offline e mocks isolados.
- Registro de autorização por CNPJ/evento/ambiente com concessão, expiração e revogação.
- Separação de papéis, aprovação ligada ao hash do payload, auditoria e testes de isolamento tenant/cliente.
- Nenhuma chamada externa nem payload real.

### Fase B — homologação de um serviço

- Selecionar um evento prioritário em checkpoint próprio.
- Confirmar documentação oficial, contrato/canal, identificação do cliente, política de credenciais e retenção.
- Testar cenários aceitos, rejeitados, timeout, retry, duplicidade e revogação em conta/ambiente de testes autorizado.
- Registrar retornos reais de homologação sem confundi-los com protocolo de produção.

### Fase C — produção por cliente

- Revisão de segurança, privacidade e responsável técnico/jurídico, consentimento do cliente e autorização específica de produção.
- Teste de ponta a ponta acompanhado pelo cliente, plano de interrupção e atendimento de rejeições/retificações.
- Ativação por CNPJ e evento; desligada por padrão para demais clientes.
- Monitorar recibos, falhas, reconciliação e revogação. Não enviar lote sem aprovação explícita correspondente ao conteúdo.

## Decisões que seguem abertas

1. Ordem de prioridade entre S-2240, S-2220, S-2210, consulta CAEPI e futuros serviços.
2. Qual forma de autorização será oferecida por serviço: certificado do cliente, procuração eletrônica ou fluxo delegado, conforme contrato oficial.
3. Quem pode preparar/revisar cada evento e quem representa legalmente cada empresa no app.
4. Retenção, criptografia, acesso, exportação e expurgo de payloads, documentos e recibos.
5. Canal/fornecedor e contrato de conectividade por órgão; requisitos de homologação e suporte.
6. Se transmissão será sempre manual após cada aprovação ou se algum órgão/cliente poderá autorizar lote agendado. Não habilitar lote automático sem decisão expressa e controles adicionais.

## Referências oficiais iniciais

- [Documentação técnica do eSocial](https://www.gov.br/esocial/pt-br/documentacao-tecnica/documentacao-tecnica/)
- [Manual Web Geral do eSocial](https://www.gov.br/esocial/pt-br/empresas/manual-web-geral)
- [Serviço PPP eletrônico — INSS](https://www.gov.br/pt-br/servicos/emitir-ppp-eletronico-perfil-profissiografico-previdenciario)
- [FAQ eSocial sobre SST, responsabilidade e consistência com LTCAT](https://www.gov.br/esocial/pt-br/empresas/perguntas-frequentes/perguntas-frequentes-producao-empresas-e-ambiente-de-testes/)
- [CAT checkpoint local](CAT_CHECKPOINT.md)
- [Análise local PGR/PCMSO/eSocial](ANALISE_PGR_PCMSO_ESOCIAL.md)

Revalidar fontes, leiautes, contratos e permissões no início de cada implementação: este documento não é especificação oficial de API nem autorização jurídica para transmitir.
