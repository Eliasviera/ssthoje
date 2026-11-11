#!/bin/sh
# Prepara os diretórios graváveis do app e semeia os catálogos-base apenas
# quando o volume persistente (EFS/EBS) ainda está vazio.
# O app lê e grava em <cwd>/data e <cwd>/uploads; por isso o volume deve ser
# montado exatamente em /app/data e /app/uploads.
set -eu

DATA_DIR="/app/data"
UPLOADS_DIR="/app/uploads"

if ! mkdir -p "$DATA_DIR" "$UPLOADS_DIR" 2>/dev/null; then
  echo "[entrypoint] sem permissão de escrita em $DATA_DIR ou $UPLOADS_DIR." >&2
  echo "[entrypoint] verifique o ponto de acesso EFS (uid/gid 1001) e o volume montado." >&2
  exit 1
fi

for seed in /app/seed-data/*.json; do
  [ -e "$seed" ] || continue
  target="$DATA_DIR/$(basename "$seed")"
  if [ ! -e "$target" ]; then
    cp "$seed" "$target"
    echo "[entrypoint] semente copiada: $(basename "$seed")"
  fi
done

exec "$@"
