# Anexos de inventários — checkpoint de 22/11/2026

Continuação: adaptador Magalu candidato, dependências, prova manual protegida e testes de transporte preparados. Ver `docs/INVENTARIO_STORAGE_MAGALU_TESTE.md` para resultados atuais (11 testes aprovados), configuração sem segredos e limites. Ainda não conectado ao painel nem testado na conta real.

## Objetivo e escopo

Preparar armazenamento privado de croquis e imagens para os futuros inventários de espaços confinados e trabalho em altura. Esta primeira etapa é um sandbox: simulação isolada em memória, sem credenciais, rede, disco, criação de recursos pagos ou ligação ao painel publicado.

Implementação: `examples/app/src/lib/inventory-attachment-sandbox.ts`. Testes: `examples/app/tests/inventory-attachment-sandbox.test.ts`.

## Comportamento provado no piloto

- Contrato de autorização por ação/recurso, resolvido pelo servidor. A entrada do envio não define tenant nem usuário. O simulador de autorização dos testes usa somente identidades fictícias.
- Leitura e referência à versão anterior exigem o mesmo cliente e recurso. Sem leitura pública, exclusão ou substituição silenciosa. Cada envio gera novo identificador e preserva os bytes anteriores.
- JPEG, PNG e PDF com assinatura inicial compatível; rejeição de SVG/outros tipos. Limite por arquivo e cota por cliente configuráveis pelo servidor; nenhum valor comercial definido nesta etapa.
- Todas as versões consomem cota. Envios concorrentes respeitam a cota dentro da mesma instância em memória.
- Resumo SHA-256 para integridade e cópias independentes dos bytes. Eventos de envio/leitura autorizados em memória. Diagnóstico `inspectForTests` exclusivo dos testes, nunca expor em rotas.

## Validação executada

`node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test tests/inventory-attachment-sandbox.test.ts`: 6 testes passaram, zero falhas após corrigir sintaxe incompatível com a execução TypeScript direta do Node. A primeira tentativa falhou antes de executar os testes por uso de propriedade no parâmetro do construtor; foi substituída por propriedade explícita.

## Limites e condições antes de produção

Este piloto não é um adaptador Magalu/S3 e perde o conteúdo ao encerrar o processo. Não oferece garantias entre processos nem auditoria durável. A autorização real deve integrar sessão, permissões e vínculo do inventário/empresa no servidor; a função injetada só representa esse contrato nos testes.

A conferência de assinatura não decodifica imagens nem valida estruturalmente PDFs. Os fixtures são bytes sintéticos para testar as regras, não documentos/imagens decodificáveis. Antes de aceitar arquivos reais: decodificação segura, limites de dimensões/pixels, política de metadados pessoais, tratamento de PDFs, análise de conteúdo e política de retenção. Não executar instruções contidas em PDFs.

Não há compressão ou miniaturas implementadas. Croquis não devem perder medidas/legendas por redução silenciosa; preservar original e distinguir derivados. Definir limites de tamanho, quantidade, resolução e cota com o responsável do produto antes da ativação.

## Próxima etapa e aceite

Aceite deste marco: revisar formatos (JPEG/PNG/PDF), histórico e limites de armazenamento desejados. Próxima implementação: adaptador para ambiente de testes do provedor, bucket privado, autorização real por recurso, auditoria persistente, reserva transacional de cota e URLs temporárias; testes de envio/leitura com arquivos fictícios válidos. Rotas futuras precisam de proteção CSRF quando aplicável, limite de requisições e negação de acesso entre clientes.

Antes de ativar em produção: apresentar estimativa de custo com fonte atual do provedor e consumo previsto, aprovar retenção/versionamento e validar o piloto integrado. Só então criar/configurar recursos pagos e migrar arquivos com manifesto, verificação de integridade, histórico e reversão. Nenhum arquivo existente será removido como parte do piloto.

Verificações finais adicionais: `node node_modules/typescript/bin/tsc --noEmit --incremental false` e `node node_modules/eslint/bin/eslint.js src/lib/inventory-attachment-sandbox.ts tests/inventory-attachment-sandbox.test.ts` concluíram com código 0, sem erros. A consulta `git status --short` foi bloqueada pelo acesso ao diretório pai nesta sessão; não foi possível obter o diff global do repositório. Nenhum comando de publicação foi executado nesta etapa.
