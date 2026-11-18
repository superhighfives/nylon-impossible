/**
 * The smoke suite's own user: one per PR (or `local`), created in the Clerk
 * development instance and seeded into the D1 the app under test reads. Every
 * preview shares one preview D1, so nothing here touches rows that aren't
 * this user's.
 */

import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildResetSql,
  buildSeedSql,
} from "@nylon-impossible/shared/seed-account";

const WEB_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const ROOT = resolve(WEB_DIR, "../..");
const WRANGLER = join(WEB_DIR, "node_modules/.bin/wrangler");

/** The zone the seed's due days use; playwright.config.ts's timezoneId too. */
export const TIME_ZONE = "UTC";

export const run = process.env.SMOKE_PR || "local";
export const email = `smoke-pr-${run}+clerk_test@nylonimpossible.com`;
/** No `_` or `%`: the seed clears old rows with a LIKE on this prefix. */
const idPrefix = `smoke-${run}-`;

export function secretKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("Set CLERK_SECRET_KEY (the Clerk dev instance's)");
  return key;
}

/**
 * Where the app under test keeps its data: the shared preview D1 for a
 * deployed preview, the local D1 for `vite dev`. SMOKE_D1 overrides.
 */
function target(): "preview" | "local" {
  const forced = process.env.SMOKE_D1;
  if (forced === "preview" || forced === "local") return forced;
  const host = new URL(process.env.BASE_URL ?? "http://localhost").hostname;
  return host === "localhost" || host === "127.0.0.1" ? "local" : "preview";
}

function wrangler(args: string[]): string {
  return execFileSync(WRANGLER, args, {
    cwd: ROOT,
    env: { ...process.env, CI: "true" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
}

/** Every D1 config the app under test reads, with its target flags. */
function d1Targets(): string[][] {
  if (target() === "preview") {
    return [["--preview", "--remote", "-c", "src/api/wrangler.jsonc"]];
  }
  // Locally the API and web workers each keep their own sqlite file.
  return ["src/api/wrangler.jsonc", "src/web/wrangler.jsonc"].map((c) => [
    "--local",
    "--persist-to",
    ".wrangler/state",
    "-c",
    c,
  ]);
}

/**
 * Run `sql` with `--command`, not `--file`: on a remote D1, `--file` goes
 * through D1's import, which holds the whole database while it runs, and
 * every open PR's preview shares this one. The seed is a few KB.
 */
function execute(sql: string): void {
  for (const flags of d1Targets()) {
    wrangler(["d1", "execute", "DB", ...flags, "--command", sql]);
  }
}

/** Replace the smoke user's rows with the demo set (seed-account.ts). */
export function seed(userId: string): void {
  execute(buildSeedSql({ userId, email, timeZone: TIME_ZONE, idPrefix }));
}

/** Delete the smoke user and every row of theirs. */
export function reset(userId: string): void {
  execute(buildResetSql(userId));
}

/** How many rows still belong to `userId`, across the tables that hold them. */
export function countRows(userId: string): number {
  const id = userId.replace(/'/g, "''");
  const query = `SELECT (SELECT count(*) FROM users WHERE id = '${id}') + (SELECT count(*) FROM lists WHERE user_id = '${id}') + (SELECT count(*) FROM todos WHERE user_id = '${id}') AS n`;
  const [flags] = d1Targets();
  const out = wrangler([
    "d1",
    "execute",
    "DB",
    ...flags,
    "--json",
    "--command",
    query,
  ]);
  const parsed = JSON.parse(out) as { results: { n: number }[] }[];
  return parsed[0]?.results[0]?.n ?? Number.NaN;
}
