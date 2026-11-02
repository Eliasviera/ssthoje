# M19 — Receptor Asaas e caixa persistente

2026-10-11. Usuário solicitou “continua” após a primeira bancada, autorizando esta preparação. Integração externa ainda não ativada; M19 continua em andamento, M20 não iniciado.

## Entrega
- `POST /api/webhooks/asaas`, desativado por padrão. Exige configuração explícita de sandbox e token de webhook válido; valida `asaas-access-token` em comparação de tempo constante. Não usa o HMAC fictício da bancada como autenticação Asaas.
- Limite real de leitura de 32 KiB, JSON e campos de cobrança validados. Somente ID, tipo, ID da cobrança e valor normalizado são projetados. Corpo completo, dados de cliente, token e atributos extras não são persistidos.
- Um vínculo de cobrança/consultoria fictícia definido no servidor. `tenantId` enviado no corpo é ignorado. Cobrança sem vínculo, valor diferente de R$ 1,00, consultoria suspensa ou evento não tratado ficam identificados para revisão. Não alteram cobrança M17, assinatura ou acesso.
- Eventos previstos: PAYMENT_CREATED, PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_REFUNDED. Estados preservados como evidências independentes, sem aplicar ordem de chegada ao estado comercial.
- Um arquivo imutável por origem e ID em `data/asaas-inbox/`. Publicação por hard link exclusivo de arquivo completo; duplicação entre requisições e reinícios não cria outro evento. Mesmo ID com campos projetados diferentes retorna 409. HTTP 200 somente após persistência ou reconhecimento de duplicata; falha de armazenamento retorna 503.
- Caixa restrita ao Master, últimos 30 eventos e controles Registrar/Reenviar evento local. Teste local separado da origem externa. Não requer chave de provedor nem abre conexão de rede.

## Verificações
- Suite completa: 87 testes aprovados, zero falhas. `node --experimental-strip-types --test --test-concurrency=1 <app>/tests/*.test.ts <app>/tests/*.test.mjs`, pasta temporária fora da restrição Windows. Log: `examples/app/data/m19-inbox-tests.txt`.
- Cinco testes novos cobrem receptor desativado/token, HTTP 200 e repetição, novo processo reconhecendo o arquivo anterior, conflito de ID, campos privados descartados, vínculo do servidor, valor/tipo para revisão, limites HTTP e autorização Master.
- Tipos `node node_modules/typescript/bin/tsc --noEmit`: aprovado. ESLint nos arquivos desta fatia: aprovado, repetido após ajustes finais de classe/textos.
- Build `node node_modules/next/dist/bin/next build`: aprovado. Build inicial recusou runtime explícito incompatível com cacheComponents; removido e repetido com sucesso. Ajustes posteriores foram declaração equivalente da classe de erro para compatibilidade com strip-types e apresentação de nome/data na interface; suite/lint finais passaram.
- Primeiro teste não carregou devido a parameter property TypeScript incompatível com strip-only do Node; corrigido sem mudar contrato e repetida suite completa.
- Navegador: evento local registrado, reenviado e mantido uma única vez; mensagem de duplicação confirmada. Um evento local Horizonte/R$ 1,00 preservado; registros anteriores da bancada, incluindo testes do usuário, preservados.
- Visual desktop 1280 × 900 e celular 390 × 844 na caixa de recebimento, sem transbordamento visível. Tamanho restaurado. Evidências `assets/m19-asaas-inbox.jpg` e `assets/m19-asaas-celular.jpg`.

## Arquivos
Novos: `src/lib/asaas-inbox.ts`, `asaas-handler.ts`; `src/app/api/webhooks/asaas/route.ts`; `src/app/master/integracoes/inbox-actions.ts`, `inbox-panel.tsx`; `tests/asaas.test.ts`.
Alterados: `src/app/master/integracoes/page.tsx`, `.env.example`. Documentação: este checkpoint, M19_CHECKPOINT.md, CHANGELOG.md, DECISION_LOG.md. Dados em `data/asaas-inbox`, ignorados pelo Git.

## Teste e próxima configuração
1. Como Master, abrir `/master/integracoes` e ir até Recepção de eventos Asaas.
2. Registrar evento local fictício. Reenviar e conferir mensagem de reconhecimento e a mesma quantidade de eventos.
3. Confirmar Receptor externo desativado e ausência de alterações no M17.

Para um teste posterior com o provedor: preparar conta Asaas sandbox e uma cobrança de teste de R$ 1,00, sem dados reais. O receptor não cria essa cobrança. Preencher somente no ambiente privado do servidor:

```dotenv
SST_ASAAS_SANDBOX_ENABLED=false
SST_ASAAS_WEBHOOK_TOKEN=
SST_ASAAS_SANDBOX_TENANT_ID=tenant-horizonte
SST_ASAAS_SANDBOX_PAYMENT_ID=
```

Usar token de autenticação exclusivo do webhook, de 32 a 255 caracteres, sem espaços; não usar chave de API. Não enviar segredo pelo chat ou commitar `.env.local`. Depois de configurar, reiniciar aplicação. Ativar com `true` somente para o teste sandbox autorizado. O sinalizador é uma declaração do operador; o corpo do webhook não comprova o ambiente da conta.

Não foi criado túnel, hospedagem pública, conta ou webhook no fornecedor. O teste com Asaas requer URL HTTPS externa e configuração do webhook na conta sandbox; essa exposição precisa de checkpoint próprio conforme AGENTS.md. Selecionar somente eventos suportados, conferir os logs do fornecedor e depois desativar o receptor. Não confundir credenciais/configuração sandbox com produção. Nenhuma liquidação automática deve ser habilitada antes de definir reconciliação, ordem dos eventos e vínculo com a cobrança interna.

## Fontes e limites
Documentação oficial consultada em 2026-10-11: [recepção e autenticação](https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint), [eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas). O teste local valida o contrato implementado, não comprova entrega pelo fornecedor.

Sistema de arquivos local deve suportar hard links. Não há fsync/garantia contra perda de energia, banco de dados, fila ou processamento assíncrono; respostas HTTP confirmam apenas a caixa local. Sem política de retenção nem paginação de todos os arquivos nesta fatia. Falhas EPERM do ambiente restrito seguem relevantes. Antes de exposição pública são necessários limites de tráfego na infraestrutura, armazenamento durável e controles operacionais. E-mail/OTP, OpenAI e teste externo Asaas permanecem pendentes; não declarar M19 concluído.
