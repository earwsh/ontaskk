#!/usr/bin/env bash
set -e

BACKUP_DIR="${BACKUP_DIR:-/home/earwsh/app/ontask/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATABASE_URL="${DATABASE_URL:-postgresql://earwsh@localhost:5433/ontask}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

pg_dump "$DATABASE_URL" --clean --if-exists --no-owner | gzip > "$BACKUP_DIR/ontask_$TIMESTAMP.sql.gz"

find "$BACKUP_DIR" -name "ontask_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup saved: $BACKUP_DIR/ontask_$TIMESTAMP.sql.gz ($(du -h "$BACKUP_DIR/ontask_$TIMESTAMP.sql.gz" | cut -f1))"
