# Imagem de produção do SST Hoje.
# Build:  docker build -t sst-hoje:local .
# Run:    docker run --env-file .env.aws.local -p 3000:3000 sst-hoje:local
# As variáveis de banco (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) e
# SESSION_SECRET vêm do ambiente — nada sensível é copiado para a imagem.

FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production \
    SST_STANDALONE=1
RUN pnpm build

# Stage usado só para migrações pontuais (tarefa avulsa no ECS, nunca no serviço).
FROM build AS migration
ENV NODE_ENV=production
CMD ["node", "scripts/migrate-postgres.mjs"]

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S sst -g 1001 && adduser -S sst -u 1001 -G sst

COPY --from=build /app/public ./public
COPY --from=build --chown=sst:sst /app/.next/standalone ./
COPY --from=build --chown=sst:sst /app/.next/static ./.next/static

# Migrações rodam nesta mesma imagem (o módulo pg já vem no standalone),
# evitando publicar um estágio de build de 1,2 GB só para migrar.
COPY --from=build --chown=sst:sst /app/db ./db
COPY --from=build --chown=sst:sst /app/scripts/migrate-postgres-aws.mjs ./scripts/migrate-postgres-aws.mjs

# Sementes copiadas para um diretório separado: o entrypoint só as usa quando o
# volume persistente (EFS/EBS) ainda está vazio, sem sobrescrever dados reais.
COPY --from=build --chown=sst:sst /app/data/field-vocabulary.json /app/data/apr-catalog.json /app/data/equipment-checklists.json /app/data/dds-topics.json /app/data/safety-operations.json ./seed-data/

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# sed remove CRLF (build no Windows) e o chown permite ao usuário 1001 escrever
# nos diretórios que serão cobertos pelos volumes persistentes.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/data /app/uploads \
 && chown -R sst:sst /app/data /app/uploads /app/seed-data

USER sst
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
