# Rodar o SST Hoje na Magalu Cloud

Roteiro para colocar o app (`examples/app`) em uma VM da Magalu Cloud, com
PostgreSQL e HTTPS. Acompanha o kit `examples/app/deploy/magalu/`.

**O que foi verificado de verdade (10/11/2026):** build da imagem Docker,
aplicação das migrações em PostgreSQL 17, app respondendo `200` em
`/api/health` e `/login` com a imagem de produção. **Nada foi criado na Magalu
Cloud** — não há conta, VM, IP ou domínio configurados. O roteiro abaixo é
manual e precisa da sua conta.

## 1. Arquitetura escolhida

```
Internet → Caddy (80/443, TLS Let's Encrypt) → app Next.js (3000, interno)
                                             → PostgreSQL 17 (5432, interno)
Volumes persistentes: /opt/sst-hoje/{data,uploads} e volume Docker pgdata
```

| Opção | Situação |
| --- | --- |
| **VM única + Docker Compose** | **Escolhida.** Mesma imagem já usada na AWS, estado em disco preservado, custo baixo. |
| DBaaS PostgreSQL + VM | Possível depois: o DBaaS é **só IP privado**, exige VM na mesma VPC e criação manual do banco. Não remove a necessidade de uma VM para o app. |
| Kubernetes | Overkill: o app grava JSON em `data/` e usa trava de arquivo local. Exige **uma instância só**, então orquestração não traz ganho hoje. |

### Por que uma instância só

Vários stores ainda gravam JSON em `data/` com trava local. Duas instâncias
simultâneas podem corromper dados. Portanto: **um container `app`**, escala
horizontal só depois de migrar esses stores para PostgreSQL/S3.

## 2. Custos de referência (Magalu Cloud, br-se1)

| Item | Valor |
| --- | --- |
| VM `BV2-4-40` (2 vCPU, 4 GB, 40 GB NVMe) | ~R$ 103/mês (confirme no console; `BV2-2-40` custa R$ 79,99) |
| IPv4 público | Sem custo no momento (pode mudar) |
| Tráfego de saída | Sem custo no momento (pode mudar) |
| Container Registry | R$ 0,29/GiB/mês |
| DBaaS (se adotar depois) | a partir de ~R$ 94/mês |

Preços em reais, com impostos, cobrança por segundo. Confira
`https://magalu.cloud/precos/virtual-machines` antes de contratar.

> 4 GB é o mínimo confortável para rodar app + Postgres. **Não compile o Next
> dentro da VM pequena** — a build consome mais memória. Compile no seu PC e
> envie a imagem pronta (seção 5).

## 3. Criar a VM

1. Acesse `https://console.magalu.cloud` e escolha a região **Sudeste (br-se1)**.
2. **Chave SSH**: gere no seu PC e cadastre a chave pública.
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/sst-hoje-magalu -C "sst-hoje"
   ```
3. **Grupo de segurança** (o padrão bloqueia tudo; sem regra explícita nada
   entra). Crie um grupo `sst-hoje-web` com:

   | Direção | Protocolo | Porta | Origem |
   | --- | --- | --- | --- |
   | Ingress | TCP | 22 | **seu IP** (`/32`), não `0.0.0.0/0` |
   | Ingress | TCP | 80 | `0.0.0.0/0` (Caddy/ACME) |
   | Ingress | TCP | 443 | `0.0.0.0/0` |
   | Egress | Todos | — | `0.0.0.0/0` |

   Grupo sem egress para a internet **impede o boot** da instância.
4. **Criar instância**: imagem **Ubuntu 24.04 LTS**, tipo `BV2-4-40`, marque
   **IPv4 público**, associe a chave e o grupo de segurança.
5. Anote o IPv4 e o **usuário padrão de SSH** (aparece nos detalhes da VM;
   normalmente `ubuntu`).
6. **DNS**: crie um registro `A` de `ssthoje.com.br` (ou subdomínio) para o
   IPv4. O Caddy só emite certificado depois que o domínio apontar para a VM.

Teste: `ssh -i ~/.ssh/sst-hoje-magalu ubuntu@IP`.

## 4. Instalar Docker na VM

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"   # saia e entre de novo no SSH
docker compose version
```

## 5. Gerar e enviar a imagem

No seu PC, dentro de `examples/app`:

```bash
docker build -t sst-hoje:2026-11-10 .
docker build --target migration -t sst-hoje:migrate-2026-11-10 .
```

### Opção A — Container Registry da Magalu (recomendada para atualizações)

```bash
mgc auth login
mgc container-registry registries create --name sst-hoje
mgc cr users create
mgc cr credentials list        # guarde usuário e senha gerados
docker login https://container-registry.br-se1.magalu.cloud
docker tag sst-hoje:2026-11-10 container-registry.br-se1.magalu.cloud/sst-hoje/sst-hoje:2026-11-10
docker push container-registry.br-se1.magalu.cloud/sst-hoje/sst-hoje:2026-11-10
```

Na VM: `docker login https://container-registry.br-se1.magalu.cloud` e use
esse caminho completo em `SST_IMAGE`.

### Opção B — Sem registry (primeiro deploy mais rápido)

```bash
docker save sst-hoje:2026-11-10 | gzip > sst-hoje.tar.gz
docker save sst-hoje:migrate-2026-11-10 | gzip > sst-migrate.tar.gz
scp -i ~/.ssh/sst-hoje-magalu sst-hoje.tar.gz sst-migrate.tar.gz ubuntu@IP:/tmp/
ssh -i ~/.ssh/sst-hoje-magalu ubuntu@IP \
  'gunzip -c /tmp/sst-hoje.tar.gz | docker load && gunzip -c /tmp/sst-migrate.tar.gz | docker load'
```

## 6. Preparar `/opt/sst-hoje` na VM

```bash
sudo mkdir -p /opt/sst-hoje && sudo chown "$USER":"$USER" /opt/sst-hoje
cd /opt/sst-hoje
mkdir -p data uploads
```

Copie do seu PC os três arquivos do kit:

```bash
scp -i ~/.ssh/sst-hoje-magalu examples/app/deploy/magalu/{docker-compose.yml,Caddyfile,.env.magalu.example} ubuntu@IP:/opt/sst-hoje/
```

Na VM:

```bash
cd /opt/sst-hoje
cp .env.magalu.example .env
chmod 600 .env
openssl rand -base64 48        # cole em SESSION_SECRET
nano .env                       # SST_DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD,
                                # SESSION_SECRET e as contas SST_DEMO_*
```

Sem ao menos uma conta `SST_DEMO_*` preenchida **ninguém consegue entrar**: o
login do app autentica por essas variáveis (`src/lib/demo-accounts.ts`).

Valide a configuração: `docker compose config -q`.

## 7. Aplicar migrações (uma vez por release)

O nome do banco **precisa ser `sst_hoje_dev`** (a migração `0001` faz
`GRANT CONNECT ON DATABASE sst_hoje_dev`).

```bash
cd /opt/sst-hoje
set -a; . ./.env; set +a
docker run --rm --network sst-hoje_interna \
  -e PGHOST=db -e PGDATABASE=sst_hoje_dev -e PGUSER=sst_hoje_dev -e PGPASSWORD="$POSTGRES_PASSWORD" \
  -e PGSSL=disable \
  sst-hoje:migrate-2026-11-10 node scripts/migrate-postgres-aws.mjs
```

> **`PGSSL=disable` é obrigatório** com o Postgres em container (sem TLS). O
> script assume SSL quando a variável não é definida e falha com
> `The server does not support SSL connections`. Em DBaaS gerenciado use
> `PGSSL=require`.

Se o comando falhar porque a rede ainda não existe, rode `docker compose up -d db`
antes e confira `docker network ls`.

## 8. Subir a stack

```bash
cd /opt/sst-hoje
docker compose up -d
docker compose ps
docker compose exec app wget -qO- http://127.0.0.1:3000/api/health
```

Para publicar uma versão específica, ajuste `SST_IMAGE` no `.env` e rode
`docker compose up -d`.

## 9. Aceite

- [ ] `https://SEU-DOMINIO/api/health` responde `{"status":"ok"}`.
- [ ] Login funciona e o cookie sai `Secure` + `HttpOnly` (só com HTTPS válido).
- [ ] Dado criado antes de um `docker compose up -d` continua presente.
- [ ] `sst.schema_migrations` lista todos os arquivos de `db/migrations`.
- [ ] Backup manual (`./backup.sh`) gera os dois arquivos.
- [ ] Duas consultorias de teste não enxergam dados uma da outra.

## 10. Atualizar versão

```bash
# no PC: build + push/save com tag nova
# na VM:
cd /opt/sst-hoje
sed -i 's/^SST_IMAGE=.*/SST_IMAGE=<nova-tag>/' .env
docker compose pull            # se estiver no registry
docker compose up -d
```

Ordem recomendada: **migração compatível primeiro, app depois**. Rollback =
voltar `SST_IMAGE` para a tag anterior e `docker compose up -d`. Rollback não
desfaz migração aplicada.

## 11. Backup e restauração

```bash
cd /opt/sst-hoje
./backup.sh
# agendar: crontab -e
# 0 3 * * * cd /opt/sst-hoje && ./backup.sh >> /var/log/sst-backup.log 2>&1
```

Restaurar banco:

```bash
gunzip -c /var/backups/sst-hoje/db-AAAAMMDD-HHMM.sql.gz \
  | docker compose exec -T db psql -U sst_hoje_dev -d sst_hoje_dev
```

Restaurar arquivos:

```bash
tar -xzf /var/backups/sst-hoje/arquivos-AAAAMMDD-HHMM.tar.gz -C /opt/sst-hoje
docker compose restart app
```

**O backup fica na mesma VM.** Copie para fora (Object Storage S3 ou outro
host) — perdê-la perde banco e arquivos juntos.

## 12. Limitações e riscos

- **Uma instância só**: sem escala horizontal enquanto houver JSON em `data/`.
- **Backup local**: sem cópia externa, um problema na VM leva tudo.
- **Contas demo**: senha em variável de ambiente não é identidade verificada;
  substituir por convite/recuperação antes de uso real.
- **LGPD**: imagem de assinatura e documentos pessoais exigem prazo de retenção
  e expurgo ainda não implementados.
- **TLS depende do DNS**: sem registro `A` correto o Caddy não emite
  certificado e o login não persiste (cookie `Secure`).
- **DBaaS no futuro**: IP privado, exige app na mesma VPC e criação manual do
  banco `sst_hoje_dev`; aí `PGSSL=require`.

## 13. Diário do que foi testado

| Verificação | Resultado |
| --- | --- |
| `docker build -t sst-hoje:magalu-check .` | sucesso |
| `docker build --target migration` | sucesso |
| Migrações com `PGSSL=disable` em PostgreSQL 17 | aplicadas |
| `/api/health` na imagem de produção | `200 {"status":"ok"}` |
| `/login` na imagem de produção | `200` |
| `docker compose config -q` do kit | válido |
| VM na Magalu Cloud, DNS, TLS | **não testados** (exigem sua conta) |

## 14. Estado real do ambiente criado em 10/11/2026

O deploy foi executado pelo CLI oficial (`mgc`), não pelo console.

| Item | Valor |
| --- | --- |
| Conta / tenant | Elias Alves Vieira · região `br-se1` |
| Instância | `sst-hoje-prod` · id `15effe49-2ace-438e-aa3f-1a36a5479e31` |
| Tipo | `BV1-2-40` — 1 vCPU, 2 GB RAM, 40 GB, R$ 69,99/mês |
| Estado | `running` |
| IPv4 público | `177.93.129.60` |
| IPv6 | `2801:80:3ea3:ce10::15b` |
| Chave SSH | `sst-hoje` (privada em `~/.ssh/sst-hoje-magalu`) |
| Security group | padrão `8c733671-1788-4032-8547-6c1ee4166858` |
| Pasta do app | `/home/ubuntu/sst-hoje` |
| Imagem enviada | `sst-hoje-magalu.tar.gz` (75 MB) |
| Domínio previsto | `magalu.ssthoje.com.br` (**registro A ainda não criado**) |

Regras de entrada no grupo padrão, depois da limpeza de 10/11/2026:

| Direção | Protocolo | Porta | Origem |
| --- | --- | --- | --- |
| Ingress | TCP | 22 | `206.0.11.3/32` (IP do administrador) |
| Ingress | TCP | 80 | `0.0.0.0/0` |
| Ingress | TCP | 443 | `0.0.0.0/0` |
| Egress | todos | — | `0.0.0.0/0` e `::/0` (padrão) |

Foram **removidas** as regras que expunham ao mundo TCP 22 (`0.0.0.0/0` e
`::/0`) e TCP 3389 (`0.0.0.0/0`) que vinham no grupo padrão. Se o IP do
administrador mudar, ajuste a regra de SSH pelo console antes de tentar entrar.

### Segunda VM criada por engano

Existe uma instância extra `ssthoje` (id `22d4c7f4-1cb3-4cd7-b699-1025b17fce72`,
tipo `BV1-1-10`, 1 GB/10 GB, IPv4 `177.93.128.167`, R$ 34,99/mês) sem uso.
Ela não roda o SST Hoje (memória insuficiente) e deve ser removida para evitar
cobrança dupla:

```bash
mgc virtual-machine instances delete --id 22d4c7f4-1cb3-4cd7-b699-1025b17fce72
```

### DNS divergente

`ssthoje.com.br` resolve hoje para `177.93.129.54`, que **não** é o IP desta VM
(`177.93.129.60`). O registro A precisa ser corrigido para o Caddy emitir o
certificado de `magalu.ssthoje.com.br` (ou do domínio escolhido).

### Passo pendente: instalar Docker (exige root)

```bash
ssh -i ~/.ssh/sst-hoje-magalu ubuntu@177.93.129.60 'sudo bash ~/sst-hoje/install-docker.sh'
```

Depois disso, sem `sudo`:

```bash
cd ~/sst-hoje
gzip -dc sst-hoje-magalu.tar.gz | docker load
docker run --rm --network sst-hoje_interna -e PGHOST=db -e PGDATABASE=sst_hoje_dev \
  -e PGUSER=sst_hoje_dev -e PGPASSWORD="$POSTGRES_PASSWORD" -e PGSSL=disable \
  --entrypoint node sst-hoje:magalu scripts/migrate-postgres-aws.mjs
docker compose up -d
docker compose exec app wget -qO- http://127.0.0.1:3000/api/health
```

Credenciais iniciais geradas ficam em `examples/app/tmp/magalu-credenciais.txt`
(ignorado pelo Git) e no `.env` da VM.

## Atualização verificada em 10/11/2026 — serviços iniciados

- Docker 29.9.3 e Docker Compose v5.7.0 instalados na VM existente.
- Imagem `sst-hoje:magalu` carregada do arquivo já enviado.
- PostgreSQL iniciado em volume novo; 22 migrações aplicadas com sucesso.
- App e banco com estado `healthy`; Caddy em execução nas portas 80/443.
- Verificações reais: `/api/health` interno retornou `{"status":"ok"}`; `/login` interno retornou HTTP 200 com campo de senha; HTTP público com Host do domínio retornou 308 para HTTPS.
- DNS autoritativo confirmado: `a.auto.dns.br` e `b.auto.dns.br` (Registro.br).
- Consulta A de `magalu.ssthoje.com.br` ao DNS autoritativo sem resposta: registro ainda pendente.
- Próximo checkpoint: criar registro A `magalu` → `177.93.129.60` no Registro.br; depois verificar certificado HTTPS, login e saúde pública. Autenticação completa e dados do ambiente anterior ainda não foram validados/importados.
- Permissões do `.env` remoto restritas a 600; nenhum segredo registrado neste documento.
- A VM extra não foi alterada. Backup automático ainda não configurado nesta etapa.

## Checkpoint de backup — 10/11/2026 (America/Sao_Paulo)

- Cópia manual privada criada em `/home/ubuntu/sst-hoje-backups/` na VM principal; caminho da cópia concluída em `latest-verified-path`.
- Inclui banco PostgreSQL em formato custom, arquivos `data/` e `uploads/` e configuração privada. Diretório com acesso restrito; segredos não exibidos nem copiados ao repositório.
- Verificações executadas: gzip/tar legíveis, catálogo pg_restore legível e SHA-256 dos três arquivos aprovado.
- Restauração real executada com sucesso em PostgreSQL 17 temporário, sem rede e sem volumes persistentes: 22 migrações presentes. Container temporário encerrado após o teste; banco ativo preservado.
- Saúde do painel após o teste: `/api/health` retornou `{"status":"ok"}`.
- DNS autoritativo consultado sem registro A para o subdomínio; HTTPS público e login completo seguem pendentes.
- Limites: cópia manual no mesmo servidor (não protege contra perda/exclusão da VM); sem cópia externa nem rotina automática nesta etapa. Capturas do banco e dos arquivos são sequenciais, sem garantia de um único instante transacional entre armazenamentos.
- Nenhuma VM foi desligada/excluída; nenhuma configuração DNS foi alterada. Faturamento não revalidado nesta etapa.

## DNS e HTTPS confirmados — 10/11/2026 (America/Sao_Paulo)

- Registro A de `magalu.ssthoje.com.br` confirmado em ambos os DNS autoritativos atuais (`b.sec.dns.br` e `c.sec.dns.br`) e no resolvedor público 1.1.1.1: `177.93.129.60`.
- Reiniciado apenas Caddy para antecipar nova tentativa de emissão após erros anteriores de DNS; app e banco preservados.
- HTTPS validado por curl sem ignorar certificado: `/login` acessível e `/api/health` público retornou `{"status":"ok"}` a partir da VM.
- Login autenticado e permissões de usuário ainda não foram testados nesta etapa.

## Atualização dos preços — 22/11/2026 (America/Sao_Paulo)

- Solicitada pelo usuário e publicada na VM existente. Imagem anterior: `sst-hoje:magalu-20261121-about`; nova: `sst-hoje:magalu-20261122-prices`.
- Essencial: R$ 199/mês e R$ 1.990/ano. Profissional: R$ 299/mês e R$ 2.990/ano. Mantida a proporção anual existente de dez mensalidades.
- Para preservar os ajustes específicos já publicados, a imagem foi derivada da versão ativa, com substituição restrita dos dois pares mensal/anual nos seis catálogos JavaScript compilados. Todos os seis arquivos passaram em `node --check`; o build da imagem passou, sem rede.
- Artefatos reproduzíveis: `assets/magalu-update-plan-prices-20261122.cjs` e `assets/magalu-plan-prices-20261122.Dockerfile`; cópia remota em `/home/ubuntu/sst-hoje-prices-20261122/`.
- Apenas o serviço app foi recriado (`docker compose up -d --no-deps app`). Sem migrações, sem alteração dos volumes de dados ou do banco. A configuração privada anterior foi preservada no servidor em `.env.before-prices-20261122`, com acesso restrito.
- Verificação real por HTTPS: `/site` HTTP 200 com ambos os preços mensais e anuais corretos; `/api/health` HTTP 200 com status ok; `/login` HTTP 200. Não foi realizado login autenticado.
- A página atual formata reais sem centavos. As duas primeiras asserções de conferência falharam por pressupostos do verificador sobre formatação/HTML; o verificador ajustado ao texto renderizado passou.
- Reversão: em `/home/ubuntu/sst-hoje`, restaurar somente `SST_IMAGE=sst-hoje:magalu-20261121-about` no `.env` e executar `docker compose up -d --no-deps app`.
- Limite: atualização pontual de artefatos compilados, sem novo build completo do código-fonte. Os preços também estão corrigidos no catálogo-fonte local; manter essa correção no próximo build completo. O JavaScript estático conserva o nome anterior: sessões antigas podem exigir atualização forçada da página.
