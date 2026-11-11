#!/bin/sh
# Backup do SST Hoje na VM: banco (pg_dump) + data/ + uploads/.
# Uso: ./backup.sh            (grava em /var/backups/sst-hoje)
#      SST_BACKUP_DIR=/mnt/bkp ./backup.sh
# Agende no cron: 0 3 * * * cd /opt/sst-hoje && ./backup.sh >> /var/log/sst-backup.log 2>&1
set -eu

cd "$(dirname "$0")"

STAMP=$(date +%Y%m%d-%H%M)
OUT=${SST_BACKUP_DIR:-/var/backups/sst-hoje}
KEEP_DAYS=${SST_BACKUP_KEEP_DAYS:-14}

mkdir -p "$OUT"

docker compose exec -T db pg_dump -U sst_hoje_dev -d sst_hoje_dev \
  | gzip > "$OUT/db-$STAMP.sql.gz"

tar -czf "$OUT/arquivos-$STAMP.tar.gz" data uploads

find "$OUT" -type f -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$OUT" -type f -name 'arquivos-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "[$(date -Iseconds)] backup em $OUT: db-$STAMP.sql.gz, arquivos-$STAMP.tar.gz"
