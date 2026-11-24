# Prova do armazenamento de anexos na Magalu

## Estado em 22/11/2026

Adaptador candidato implementado em `examples/app/src/lib/inventory-magalu-object-store.ts`, com SDK S3 oficial, sem rotas nem alteração do painel publicado. Dependências fixadas em `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` 3.1175.0, registradas em package.json/pnpm-lock.yaml.

O endpoint é calculado a partir de `br-se1` ou `br-ne1`; não aceita endereço arbitrário. O adaptador solicita ACL privada, exige versionamento habilitado, gera chave UUID por envio e usa VersionId nas leituras e links. Após enviar, recupera a versão e verifica tamanho, tipo e SHA-256. A leitura tem limite de bytes e timeout. Links de download duram 60 segundos por padrão, no máximo 300, e solicitam download como anexo. Nunca registrar URLs assinadas.

A autorização é uma dependência explícita por ação/recurso: deve resolver cliente e ator pela sessão e vínculo autorizado no servidor. Leitura entre clientes é recusada antes do transporte. O recibo de armazenamento deve ser obtido no banco confiável, nunca aceito diretamente do navegador. Não há operação de exclusão nem URL pública na interface.

## O que foi testado

- 11 testes passaram: seis do sandbox anterior e cinco do adaptador. O transporte HTTP do SDK foi substituído por simulação sem rede; comandos, cabeçalhos, assinatura do link e VersionId são produzidos pelo SDK real.
- PDF fictício completo criado e reaberto com pdf-lib. PNG minúsculo estático usado como bytes de transferência, sem prova de decodificação de imagem.
- Cobertura: acesso entre clientes, autorização recusada, privacidade solicitada no upload, versão fixa, preservação de dois envios, detecção de corrupção, bloqueio de versionamento desabilitado, arquivo grande e recibos inválidos.
- Comando: `node --import ./scripts/test-node-loader.mjs --experimental-strip-types --test tests/inventory-magalu-object-store.test.ts tests/inventory-attachment-sandbox.test.ts`.
- Executado também o smoke sem aceite/configuração: código 1 e mensagem genérica, como esperado; nenhuma conexão ou envio foi realizado. Não confundir com aprovação do teste real.
- Verificações finais `node node_modules/typescript/bin/tsc --noEmit --incremental false` e ESLint nos três arquivos TypeScript novos: código 0, sem erros. Não executado build completo nem teste real no provedor.
- A instalação com pnpm alinhou o Next instalado localmente de 16.4.2 para 16.4.5, versão já declarada no package.json antes desta etapa. Nenhuma mudança dessa versão foi publicada. O `git status` segue indisponível por restrição no diretório pai.

## Preparar teste real, após aprovação

1. Confirmar custo atual e política de retenção com o proprietário da conta. Esta etapa não criou bucket, credencial nem outro recurso pago.
2. Separar bucket de teste cujo nome termine em `-sandbox`. Manter privado em ACL **e em bucket policy**: pedir ACL privada no objeto não prova que uma política pública não conceda acesso. Habilitar versionamento e usar credencial de menor privilégio limitada ao bucket. Não habilitar expiração automática de versões sem revisão.
3. Copiar `examples/app/deploy/magalu/inventory-storage/.env.example` para um arquivo local privado fora do Git, preenchendo região, bucket e credenciais apenas no computador/servidor. Não enviar segredos pelo chat. O marcador `SST_OBJECT_SANDBOX_ACK=TESTE_FICTICIO_AUTORIZADO` permite executar a prova e deve ser definido somente após aprovação.
4. Dentro de `examples/app`, executar:

```powershell
node --env-file=C:/caminho/privado/inventory-storage.env --import ./scripts/test-node-loader.mjs --experimental-strip-types scripts/inventory-object-storage-smoke.ts
```

O loader existente é exclusivo de teste: resolve TypeScript e neutraliza `server-only` para execução fora do Next. Não usar esse loader para iniciar a aplicação publicada.

A prova envia apenas um PDF fictício, lê a versão exata, abre o PDF, testa link temporário e exige HTTP 403 no endereço sem assinatura. O arquivo fica preservado para revisão; não há exclusão automática. Mesmo um teste que falhe após PUT pode deixar versão no bucket: revisar consumo e reconciliar objetos, sem repetir indiscriminadamente.

## Limites antes de integrar ao painel

Ainda faltam esquema de inventários, vínculo real de empresa/recurso, autorização da sessão, reserva transacional de cota, auditoria persistente, controle de requisições e tratamento dos envios incompletos. O adaptador não valida assinatura/decodificação dos arquivos: a camada de aplicação deverá validar imagens/PDFs antes do envio, limitar dimensões e tratar metadados. O sandbox anterior e o adaptador têm testes separados; não estão unidos em um serviço persistente.

O programa de prova usa autorização fictícia fixa, apropriada apenas ao bucket dedicado. Não demonstra login real, isolamento do banco, teste completo de ACL/policy, acesso por outro usuário da conta, expiração real aguardada ou compatibilidade efetiva com a Magalu. Essas verificações continuam necessárias. Nenhuma migração ou publicação foi feita.

## Referências oficiais consultadas

- [Endpoints Magalu](https://docs.magalu.cloud/docs/storage/object-storage/additional-explanations/regions/)
- [Versionamento Magalu](https://docs.magalu.cloud/docs/storage/object-storage/access-control/versioning)
- [Exemplo de SDK JavaScript e URLs assinadas](https://docs.magalu.cloud/docs/storage/object-storage/troubleshooting/presigned-url) — o exemplo do fornecedor usa objeto público; este adaptador usa ACL privada.
- [Integridade no SDK JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-checksums.html) — checksums opcionais automáticos são configurados como WHEN_REQUIRED para compatibilidade S3; a aplicação confere SHA-256 na leitura completa. A compatibilidade dessa configuração com a Magalu ainda depende da prova real.

## Configuração do bucket existente — 22/11/2026

- Usuário autorizou explicitamente tornar `ssthojessthoje` privado e ativar versionamento. Console na região br-se1 mostrou bucket vazio e confirmou `Permissão alterada para privado com sucesso!`; menu passou a oferecer `Tornar público`.
- Nenhum arquivo enviado ou excluído; outro bucket preservado. Sem alteração do código/painel nesta etapa.
- Versionamento ainda pendente: console observado não oferece essa opção. Executado `.tools/mgc/mgc.exe object-storage buckets versioning get --bucket ssthojessthoje --region br-se1`; código 1 com `api-key not set`. Não foi possível consultar ou ativar versionamento sem credencial Object Storage configurada na ferramenta.
- Próximo passo: configurar credencial apropriada localmente, sem compartilhar segredo no chat, executar `mgc object-storage buckets versioning enable --bucket ssthojessthoje --region br-se1` e confirmar com `versioning get`. Nenhuma nova credencial foi criada nesta etapa. A mudança para privado foi confirmada no console; acesso anônimo e política do bucket ainda precisam de prova independente antes de anexos reais.

## Versionamento confirmado — 22/11/2026

- Usuário aprovou a chave `sst-hoje-versionamento-temporario`, após aviso explícito de acesso total ao Object Storage. Formulário conferido com expiração em 23/11/2026; criação confirmada pelo console.
- Identificador copiado para diretório temporário com ACL restrita e removido após uso. Secret usado via variável de ambiente apenas no processo da AWS CLI, sem gravação em arquivo ou exibição em logs. Área de transferência limpa após captura.
- Executados AWS CLI `get-bucket-versioning`, `put-bucket-versioning --versioning-configuration Status=Enabled` e nova consulta, com bucket `ssthojessthoje`, endpoint `https://br-se1.magaluobjects.com` e região br-se1. Comando terminou com código 0; consulta final retornou `Status: Enabled`.
- Bucket privado confirmado no console; versionamento confirmado pela API S3. Nenhum anexo foi enviado, excluído ou migrado e o painel publicado não foi alterado nesta etapa.
- A chave administrativa temporária continua existente até sua expiração configurada. Não é credencial permanente do app. Antes da integração real, definir identidade/permissões mínimas do serviço, verificar bucket policy e acesso anônimo, validar fluxo transacional de cota/auditoria e política de retenção.
