#!/bin/bash
set -e

DB_STATE=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"
BACKUP_DIR=".wrangler/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/db-$TIMESTAMP.sqlite"

mkdir -p "$BACKUP_DIR"
cp "$DB_STATE"/*.sqlite "$BACKUP_FILE"

echo "Backup created: $BACKUP_FILE"
