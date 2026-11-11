# Deploy no Lightsail — roteiro completo

**Data:** 2026-11-04
**Situação:** sistema funcionando localmente, servidor no ar, deploy pendente.
**Tudo aqui foi verificado** nesta data; o que não foi testado está marcado.

---

## 1. Estado atual (confirmado)

### No seu computador
- App rodando em `http://localhost:3107`
- PostgreSQL local em Docker (`app-db-1`, porta 54329) com **21 migrations** aplicadas
- Empresa-modelo **METALÚRGICA HORIZONTE** completa: PGR aprovado (153 riscos), 22 trabalhadores, PCMSO, 6 ASOs, EPI, CIPA completa, 1 APR em revisão
- Build de produção funcionando (`npm run build`, ~10s)
- TypeScript limpo, ESLint com 0 erros

### No servidor AWS Lightsail
- IP: **3.14.36.254** (Ohio, us-east-2)
- **Conecta** com a chave `C:\Users\elias\.ssh\sst-hoje-teste` (ed25519, criada em 02/11)
- Serviço `sst-hoje` **ativo** (`systemctl is-active` → active)
- Diretório: `/home/ubuntu/repo/examples/app`
- Executa: `pnpm exec next start -H 127.0.0.1 -p 3000`, atrás de nginx
- Node v24.22.2 · pnpm 11.25.0 · swap de 2 GB ativo
- Build atual é de **02/11** — **não tem** `/cipa`, `/apr` nem `/analise-risco`
- `data/` no servidor tem **apenas `audit-log.jsonl`** — banco vazio

### DNS (verificado)
| Endereço | Situação |
|---|---|
| `teste.ssthoje.com.br` | ✅ Responde HTTP 200, HTTPS válido → 3.14.36.254 |
| `www.ssthoje.com.br` | ✅ Aponta para 3.14.36.254, mas nginx não atende ainda |
| `ssthoje.com.br` (raiz) | ❌ **Sem registro A** — só IPv6, não abre |

---

## 2. Chaves SSH — o que importa e o que apagar

**Use esta:** `C:\Users\elias\.ssh\sst-hoje-teste`

Conectar:
```bash
ssh -i "C:/Users/elias/.ssh/sst-hoje-teste" ubuntu@3.14.36.254
```

**Apague estas quatro cópias** (não abrem mais nada — foram removidas do servidor em 02/11):
- `C:/Users/elias/Downloads/LightsailDefaultKey-us-east-2.pem`
- `C:/Users/elias/Downloads/LightsailDefaultKey-us-east-2 (1).pem`
- `C:/Users/elias/Downloads/LightsailDefaultKey-us-east-2 (2).pem`
- `C:/Users/elias/OneDrive/Desktop/chave 02 11 LightsailDefaultKey-us-east-2 (2).pem.txt`

Motivo: chave privada em pasta sincronizada com OneDrive permite que qualquer pessoa com acesso à conta entre no servidor.

---

## 3. O que decidir antes de subir

### 3.1 Qual domínio abre o quê (sugestão)

| Domínio | Conteúdo |
|---|---|
| `ssthoje.com.br` + `www` | Landing page (`/site`) — cartão de visita |
| `teste.ssthoje.com.br` | O sistema, com login e dados fictícios |

Motivo: quem chega no domínio principal sem convite entende o produto em vez de encontrar uma tela de senha. E o sistema pode ser resetado sem manchar o domínio.

### 3.2 DNS a corrigir
No painel do registro.br (ou onde gerencia), criar registro **A** para `ssthoje.com.br` → `3.14.36.254`.
O `www` já está correto.

---

## 4. Passo a passo do deploy

### Passo 1 — Empacotar o código (na sua máquina)
```bash
cd "C:/Users/elias/OneDrive/Desktop/SST HOJE/examples/app"
tar -czf "$TMPDIR/sst-src.tgz" \
  --exclude=node_modules --exclude=.next --exclude='.next-verify-*' \
  --exclude=data --exclude=tmp --exclude=uploads \
  src db scripts public package.json pnpm-lock.yaml pnpm-workspace.yaml \
  next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs compose.yaml
```
Resultado esperado: ~1,1 MB.

### Passo 2 — Enviar ao servidor
```bash
scp -i "C:/Users/elias/.ssh/sst-hoje-teste" "$TMPDIR/sst-src.tgz" ubuntu@3.14.36.254:/home/ubuntu/
```

### Passo 3 — Extrair e instalar (no servidor)
```bash
ssh -i "C:/Users/elias/.ssh/sst-hoje-teste" ubuntu@3.14.36.254
cd /home/ubuntu/repo/examples/app
cp -r src /home/ubuntu/backup-src-$(date +%Y%m%d)   # cópia de segurança antes
tar -xzf /home/ubuntu/sst-src.tgz
pnpm install --frozen-lockfile
```

### Passo 4 — Build
```bash
pnpm exec next build
```
Atenção: a instância tem 2 GB e **precisa do swap de 2 GB** (já ativo). Sem swap o build morre.

### Passo 5 — Banco de dados no servidor
O servidor **não tem PostgreSQL instalado**. Duas opções:

**A) Instalar PostgreSQL no servidor** (recomendado para teste)
```bash
sudo apt update && sudo apt install -y postgresql
sudo systemctl enable --now postgresql
sudo -u postgres createuser sst_hoje_dev --pwprompt
sudo -u postgres createdb sst_hoje_dev -O sst_hoje_dev
```
Depois rodar as migrations:
```bash
cd /home/ubuntu/repo/examples/app
# criar .env.pg.local em examples/ (nível acima de app/) com POSTGRES_PASSWORD
node scripts/migrate-postgres.mjs
```

**B) Exportar o banco local e importar**
```bash
# na sua máquina
docker exec app-db-1 pg_dump -U sst_hoje_dev sst_hoje_dev > "$TMPDIR/sst.sql"
scp -i "C:/Users/elias/.ssh/sst-hoje-teste" "$TMPDIR/sst.sql" ubuntu@3.14.36.254:/home/ubuntu/
# no servidor
psql -U sst_hoje_dev -d sst_hoje_dev -f /home/ubuntu/sst.sql
```
Isso traz tudo: migrations, PGR, CIPA, APR, Metalúrgica Horizonte.

### Passo 6 — Dados de demonstração
Os arquivos JSON (trabalhadores, PCMSO, ASO, EPI) precisam ser enviados:
```bash
# na sua máquina
cd "C:/Users/elias/OneDrive/Desktop/SST HOJE/examples/app"
tar -czf "$TMPDIR/sst-data.tgz" data/clients.json data/workers.json data/pcmso.json \
    data/aso.json data/epi.json data/epi-stock.json data/documents.json data/safety-operations.json
scp -i "C:/Users/elias/.ssh/sst-hoje-teste" "$TMPDIR/sst-data.tgz" ubuntu@3.14.36.254:/home/ubuntu/
# no servidor
cd /home/ubuntu/repo/examples/app && tar -xzf /home/ubuntu/sst-data.tgz
```

### Passo 7 — Variáveis de ambiente
O servidor precisa do `.env.local` com:
```
SESSION_SECRET=<valor próprio>
SST_DEMO_EMAIL=...
SST_DEMO_PASSWORD=...
SST_DEMO_MASTER_EMAIL=...
SST_DEMO_MASTER_PASSWORD=...
PGPASSWORD=<senha do banco>
POSTGRES_PASSWORD=<senha do banco>
```
E os arquivos de senha do banco:
- `SST HOJE/.env.pg.local` (nível acima de `examples/`) com `POSTGRES_PASSWORD=`
- `examples/app/.env.pg.app.local` (gerado automaticamente pelo `postgres-env.mjs`)

### Passo 8 — Reiniciar e conferir
```bash
sudo systemctl restart sst-hoje
sudo systemctl status sst-hoje
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login
curl -s -o /dev/null -w "%{http_code}\n" https://teste.ssthoje.com.br/cipa
curl -s -o /dev/null -w "%{http_code}\n" https://teste.ssthoje.com.br/apr
```

### Passo 9 — nginx para os domínios novos
Editar o bloco do nginx (provavelmente em `/etc/nginx/sites-available/sst-hoje`) e incluir:
```
server_name teste.ssthoje.com.br www.ssthoje.com.br ssthoje.com.br;
```
Depois:
```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ssthoje.com.br -d www.ssthoje.com.br
```

---

## 5. O que ainda NÃO está feito no código

| Item | Impacto |
|---|---|
| **15 testes falhando** | 14 de EPI (data da conferência CAEPI expirada nos fixtures) + 1 de checklist |
| AR e APR não têm link no menu global | Resolvido parcialmente: atalhos no topo de `/empresas` |
| Mensagem de erro genérica na APR | Não diz qual campo está errado |
| `additionalPgrControls: []` quebra validação | Omitir o campo funciona |
| Primeiro carregamento lento | 10 a 60 segundos por tela |
| **Git não instalado** | Nada versionado — maior risco do projeto |

---

## 6. Antes de qualquer coisa nova

1. **Instalar Git** e commitar o estado atual
2. **Apagar as quatro cópias da chave AWS**
3. **Corrigir o DNS** de `ssthoje.com.br`
4. **Fazer o deploy** seguindo este roteiro
5. Os 15 testes falhando
