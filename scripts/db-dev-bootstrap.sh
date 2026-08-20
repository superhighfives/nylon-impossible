#!/bin/bash
set -e

# CI workflows (marketing.yml, marketing-test.yml, ...) already migrate and
# seed their own local D1 explicitly, with workflow-specific seed data, before
# spawning `pnpm --filter web dev` directly. That spawn bypasses this predev
# hook's intended target (a developer's local `pnpm web:dev`) but still
# triggers it, so left unguarded this hook races — and used to crash —
# generate.ts's own syncLocalD1Storage() retry, which already handles the
# same underlying per-worker local-D1-file divergence more safely (it copies
# the already-seeded file across instead of independently reseeding).
if [ -n "${CI:-}" ]; then
  echo "CI detected — skipping local D1 auto-migrate/seed (the workflow manages its own D1 state)."
  exit 0
fi

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
        } catch (err) {
          // Fail loud rather than reporting "0 users": a false 0 here
          // triggers a reseed, and seed.sql opens with DELETE FROM on every
          // table, so silently swallowing a parse failure would wipe the
          // local dev DB instead of surfacing the real error.
          console.error("Failed to parse wrangler d1 execute output:", err.message);
          process.exit(1);
        }
      });
    ')

if [ "$USER_COUNT" = "0" ]; then
  echo "Local dev database is empty — seeding..."
  npx wrangler d1 execute nylon-impossible-db --local --persist-to ../../.wrangler/state -c wrangler.jsonc --file=../api/src/db/seeds/seed.sql
fi
