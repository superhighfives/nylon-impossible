#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR/src/web"

echo "Ensuring local dev D1 (web) is migrated..."
CI=true npx wrangler d1 migrations apply nylon-impossible-db --local --persist-to ../../.wrangler/state -c wrangler.jsonc

USER_COUNT=$(npx wrangler d1 execute nylon-impossible-db --local --persist-to ../../.wrangler/state -c wrangler.jsonc --command "SELECT COUNT(*) as count FROM users" --json 2>/dev/null \
  | node -e '
      let data = "";
      process.stdin.on("data", (d) => { data += d; });
      process.stdin.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          console.log(parsed[0]?.results?.[0]?.count ?? 0);
        } catch {
          console.log(0);
        }
      });
    ')

if [ "$USER_COUNT" = "0" ]; then
  echo "Local dev database is empty — seeding..."
  npx wrangler d1 execute nylon-impossible-db --local --persist-to ../../.wrangler/state -c wrangler.jsonc --file=../api/src/db/seeds/seed.sql
fi
