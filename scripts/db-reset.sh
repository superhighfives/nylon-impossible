#!/bin/bash
set -e

DB_STATE=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"

echo "Removing local D1 database..."
rm -f "$DB_STATE"/*.sqlite*

echo "Re-applying migrations..."
pnpm db:migrate
