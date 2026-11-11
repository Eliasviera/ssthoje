# Rodar o SST Hoje na AWS

Este documento descreve **como empacotar e operar** o app (`examples/app`) na AWS.
Ele não substitui revisão de segurança, custo e LGPD antes de produção.

## 1. Decisão de arquitetura

O app é **Next.js 16.4.2** com SSR, Server Actions, `pg` e gravação em disco
(`data/` e `uploads/`). Isso elimina duas opções comuns:

| Opção | Situação |
| --- | --- |
| AWS Amplify Hosting | A documentação oficial cobre **Next.js 12 a 15**. O projeto usa 16.4.2 → **não suportado**. |
| AWS App Runner | **Fechado para novos clientes**. Só clientes existentes. |
| **ECS Fargate + RDS + EFS** | **Escolhido**: container Node, banco gerenciado e volume persistente. |
| EC2 + Docker | Alternativa mais barata e simples, com o mesmo `Dockerfile`; perde auto-recuperação gerenciada. |

```
Internet → ALB (HTTPS/ACM) → ECS Fargate (1 task) → RDS PostgreSQL
                                       └→ EFS montado em /app/data e /app/uploads
         Imagens da aplicação → ECR
         Segredos → Secrets Manager / SSM
```

### Por que uma única task

Vários stores ainda gravam **JSON em `data/`** e usam trava de arquivo local.
Duas tasks ao mesmo tempo podem corromper dados. Portanto:

- mantenha **desired count = 1**;
- o EFS garante que reinícios não percam dados;
- para escalar horizontalmente é preciso migrar esses stores para tabelas
  PostgreSQL (ou S3, no caso de arquivos) — trabalho separado, já registrado
  como pendência do projeto.

## 2. O que já está pronto no repositório

- `Dockerfile` multi-stage com build **standalone** (`next.config.ts` com `output: "standalone"`).
- Estágio `migration` para rodar migrações uma vez, fora do serviço.
- `docker-entrypoint.sh`: cria `/app/data` e `/app/uploads` e copia os catálogos-base
  **somente** quando o volume ainda está vazio (não sobrescreve dado real).
- `scripts/migrate-postgres-aws.mjs`: migrações lendo apenas variáveis de ambiente
  (o script local depende de `.env.pg.*`, impróprio para AWS).
- `.env.aws.example`: lista completa de variáveis.
- `/api/health`: usado como health check do ALB (responde 200/503, sem autenticação).

## 3. Pré-requisitos

- Conta AWS com permissão em ECR, ECS, RDS, EFS, ELB, IAM, CloudWatch e Secrets Manager.
- AWS CLI v2 configurada (`aws sts get-caller-identity`).
- Docker local.
- Um domínio (recomendado) para HTTPS — o cookie de sessão é `secure` em produção.

Defina as variáveis de trabalho:

```bash
export AWS_REGION=sa-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO=sst-hoje
```

## 4. Build e envio da imagem

```bash
cd examples/app
docker build -t $ECR_REPO:$(date +%Y%m%d-%H%M) .
aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker tag $ECR_REPO:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest
```

> Use tags imutáveis por release e ative *scan on push* no repositório.

## 5. Banco de dados (RDS PostgreSQL)

1. Crie uma instância PostgreSQL 17 (mesma versão do `compose.yaml`) em subnets privadas.
2. Crie o banco **`sst_hoje_dev`** e o usuário da aplicação.

   > O nome é herdado de `db/migrations/0001_tenant_registry.sql`, que executa
   > `GRANT CONNECT ON DATABASE sst_hoje_dev`. Migração aplicada não pode ser
   > editada (o ledger valida checksum), então renomear o banco exigiria uma
   > migração nova e um squash do histórico — pendência registrada.

3. Guarde a senha no **Secrets Manager** (não em variável de texto no task definition).
4. Libere a porta 5432 apenas para o security group do serviço ECS.
5. Exija TLS (`PGSSL=require`). Para validar o certificado use `PGSSL=verify-full`
   com o bundle da AWS montado na imagem — pendente de implementação.

Aplicar migrações (uma vez por release):

```bash
docker build --target migration -t $ECR_REPO:migrate .
docker run --rm --env-file .env.aws.local $ECR_REPO:migrate node scripts/migrate-postgres-aws.mjs
```

Na AWS, rode isso como **task avulsa** (`aws ecs run-task`) com a mesma task definition
de migração, nunca no container do serviço.

## 6. Volume persistente (EFS)

1. Crie um EFS na mesma VPC, com mount targets nas subnets privadas.
2. Crie **dois access points**, ambos com `uid=1001`, `gid=1001`, permissão `0750`:
   - `/app/data` (documentos, JSONs, auditoria)
   - `/app/uploads` (arquivos enviados)
3. No task definition, monte os volumes nesses caminhos.

Sem EFS (ou EBS em EC2), cada deploy começa vazio: o entrypoint recria só os
catálogos-base e **todo o histórico da consultoria desaparece**.

## 7. Serviço ECS

- Cluster Fargate, task 0.5 vCPU / 1 GB (ajuste após medir).
- Porta do container: 3000.
- Health check do target group: `GET /api/health`, esperado 200.
- `desired count = 1` (ver seção 1).
- Variáveis sensíveis via `secrets` (Secrets Manager/SSM), não em `environment`.
- Logs: driver `awslogs` para um grupo `/ecs/sst-hoje`.
- ALB com certificado ACM e redirect 80 → 443.

## 8. Checklist de aceitação

- [ ] `GET /api/health` responde 200 no domínio final.
- [ ] Login funciona e o cookie sai com `Secure` + `HttpOnly`.
- [ ] Dados gravados antes de um redeploy continuam presentes (prova do EFS).
- [ ] Migrações aplicadas: `sst.schema_migrations` lista todos os arquivos de `db/migrations`.
- [ ] Backup do RDS habilitado e restore testado uma vez.
- [ ] Logs sem segredo (senha, token, imagem de assinatura não vão para o CloudWatch).
- [ ] Duas consultorias de teste não enxergam dados uma da outra.

## 9. Custos aproximados (sa-east-1, ordem de grandeza)

| Item | Estimativa mensal |
| --- | --- |
| Fargate 0.5 vCPU / 1 GB contínuo | US$ 18–25 |
| RDS `db.t4g.micro` + 20 GB | US$ 20–30 |
| ALB | US$ 18–22 |
| EFS (poucos GB) | US$ 1–3 |
| CloudWatch/ECR | US$ 2–5 |

Confirme na calculadora da AWS; valores variam por região e câmbio.

## 10. Elastic Beanstalk (plataforma em uso)

Se o deploy está no Elastic Beanstalk com plataforma **Node.js**, o caminho muda
em relação ao container:

- O pacote enviado deve conter **somente `examples/app`**. Ao enviar a raiz do
  repositório, o EB encontra `abrir-sst-hoje.mjs`/atalhos `.cmd` e tenta executá-los
  no lugar do Next.js.
- `next start` **não funciona** com `output: "standalone"`; por isso o
  `next.config.ts` só ativa standalone quando `SST_STANDALONE=1` (usado no Docker).
- `Procfile` na raiz de `examples/app`: `web: npx next start -p 8080`.
- Escolha a plataforma **Node.js 22 no Amazon Linux 2023** (Next.js 16 exige Node 20.9+).
  A opção `NodeVersion` do namespace `aws:elasticbeanstalk:container:nodejs` é
  **legada (só AL1)**; em AL2023 a versão vem do ramo de plataforma e de `engines`
  no `package.json`.
- `.npmrc` com `production=false` mantém as devDependencies, necessárias se o
  ambiente rodar `next build`.

### Variáveis de ambiente (nomes que o app realmente lê)

| Chave | Valor |
| --- | --- |
| `SESSION_SECRET` | 32+ bytes aleatórios (obrigatório) |
| `DATABASE_URL` | `postgresql://usuario:senha@host:5432/sst_hoje_dev` **ou** as chaves `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` |
| `PGSSL` | `require` (RDS) |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |

> O nome do banco precisa ser `sst_hoje_dev` (ver seção 5). Sem `SESSION_SECRET`
> ou sem credencial de banco, o app cai no armazenamento em JSON local e ninguém
> consegue entrar.

### Gerar o zip

```bash
cd examples/app
node scripts/make-eb-bundle.mjs   # cria examples/sst-hoje-eb.zip
```

O script copia apenas o conteúdo de `examples/app`, mantém `.next`, `Procfile`,
`.ebextensions`, `.npmrc` e os catálogos-base de `data/`, e exclui
`node_modules`, `uploads`, artefatos de teste e arquivos `.env`.

### Limitações específicas do EB

- **Disco da instância é efêmero**: `data/` e `uploads/` somem a cada deploy ou
  troca de instância. Para uso real, monte **EFS** (suportado no EB) nos mesmos
  caminhos ou migre os stores para PostgreSQL/S3.
- **Uma instância**: com o balanceador em mais de uma, os arquivos divergem.
- **HTTPS obrigatório**: em produção o cookie de sessão sai `Secure`; sem
  certificado ACM no balanceador, o login não persiste.

## 11. Riscos conhecidos

- **Estado em arquivo**: uma task só; sem escala horizontal até migrar os stores.
- **Sem S3**: anexos e imagens de assinatura ficam no EFS; custo e backup diferentes de objeto.
- **LGPD**: imagens de assinatura e documentos pessoais exigem prazo de retenção e expurgo ainda não implementados.
- **Segredos**: contas de demonstração com senha em variável de ambiente devem ser substituídas por um fluxo real de convite/recuperação antes de abrir ao público.
- **Cache/`cacheComponents`**: validar comportamento do cache do Next atrás do ALB (sem CDN) na homologação.

## 12. Fluxo de atualização (local → AWS)

Toda alteração segue o mesmo caminho. Ele existe para evitar o erro mais caro:
enviar código que não foi compilado ou enviar a pasta errada.

### Passo 1 — alterar e testar localmente

```bash
cd examples/app
pnpm dev:db        # servidor local com PostgreSQL (porta 3107)
```

Teste a tela alterada. Se mexeu em banco, rode também `pnpm db:migrate` localmente.

### Passo 2 — gerar o pacote com um comando

```bash
cd examples/app
node scripts/release-eb.mjs
```

No Windows, dá para dar **duplo clique** em `examples/app/ATUALIZAR-AWS.cmd`.
O script faz, em ordem:

1. `next build` (falha aqui interrompe tudo — zip antigo é preservado);
2. empacota **somente** `examples/app`, mantendo `.next`, `Procfile`, `.ebextensions`,
   `.npmrc` e os catálogos-base de `data/`;
3. mostra tamanho, **SHA-256** e as instruções de envio.

Saída: `examples/sst-hoje-eb.zip` (ignorado pelo Git).

### Passo 3 — enviar ao Elastic Beanstalk

- Console → ambiente → **Carregar e implantar** → selecione `examples/sst-hoje-eb.zip`.
- Com EB CLI já inicializada (`eb init`), basta `eb deploy` (usa o `.ebignore`).

### Passo 4 — validar depois do deploy

1. Health do ambiente = **Ok**.
2. `SUA-URL/api/health` responde `{"status":"ok"}`.
3. Login funciona (cookie `Secure` exige HTTPS).
4. Um dado criado **antes** do deploy continua lá — se sumiu, falta EFS.

### Passo 5 — se der errado (rollback)

Console → **Versões da aplicação** → escolha a versão anterior → **Implantar**.
O rollback não desfaz migração de banco já aplicada: por isso migração é sempre
um passo separado e revisado.

### Mudanças em migrações têm passo extra

Se `db/migrations` mudou, além do deploy é preciso aplicar a migração no banco:

```bash
docker build --target migration -t sst-hoje:migrate .
docker run --rm --env-file .env.aws.local sst-hoje:migrate node scripts/migrate-postgres-aws.mjs
```

Ordem recomendada: migração compatível primeiro, deploy depois.
