# nylon-impossible

Baseline rules live in [superhighfives/control-room](https://github.com/superhighfives/control-room/blob/main/BASELINE.md).
This file is the repo-specific part.

## Layout

pnpm workspaces: `src/shared`, `src/web`, `src/api`, `src/admin`,
`src/marketing`. `@nylon-impossible/shared` is consumed by both `web` and `api`.

`web`, `api`, `admin`, and `todo-agent` have their own check scripts, so `pnpm
typecheck` and `pnpm lint` fan out to those four. Per-package variants are
prefixed (`pnpm api:test`, `pnpm web:typecheck`).

Biome config lives at the root; each workspace invokes it with
`--config-path ../..`. Don't add a per-workspace `biome.json`.

## Hono context typing

API handlers take `Context<Env>`, not `Context<{ Bindings: Env }>`.

`Env` in `src/api/src/types.ts` already contains **both** `Bindings` and
`Variables`. Wrapping it in another `Bindings` key hides `Variables`, so
`c.get("userId")` stops type-checking — and the usual reflex is to paper over
that with `as string` rather than fix the annotation.

```ts
// Good
export async function enrichTodo(c: Context<Env>) {
  const userId = c.get("userId"); // already string
}

// Bad
export async function enrichTodo(c: Context<{ Bindings: Env }>) {
  const userId = c.get("userId") as string;
}
```

## Bindings

Resource bindings reached via `c.env.*` — D1, Durable Objects, Queues, AI, and
plain `vars` — must exist in `Env["Bindings"]` **and** in the relevant
`wrangler.jsonc`. One that type-checks because someone widened the type but
isn't in the wrangler config will fail at runtime, not at build.

Secrets are the exception: `CLERK_SECRET_KEY`, `TAVILY_API_KEY`, `SENTRY_DSN`
and friends are typed in `Env["Bindings"]` but set with `wrangler secret put`,
so they deliberately don't appear in `wrangler.jsonc`.

## Errors

Handlers return errors through `apiError(c, code)` with a code from
`API_ERRORS` in `src/api/src/lib/errors.ts` — don't hand-write status codes or
message strings at the call site.

## Migrations: expand/contract

Deploy (`.github/workflows/web-deploy.yml`) **applies D1 migrations to the
shared `nylon-impossible-db` before rolling out the workers** — migrate → deploy
todo-agent → deploy API → deploy web. Both the `web` and `api` workers bind the
same database, so during that window the schema is already new while the old
worker code is still serving.

A migration that **tightens** a constraint in one step therefore causes a brief
outage for live writes until rollout finishes. Concretely: `0023` made
`todos.list_id` NOT NULL with no default, and every write that omitted the
column 500'd (`NOT NULL constraint failed: todos.list_id`) for the length of the
deploy — surfacing on the client as `Error: No error message`.

For any constraint-tightening change, use **expand/contract**:

1. Migration A adds the column **nullable** (or with a safe default).
2. Deploy the workers that populate it.
3. Migration B (a later deploy) makes it `NOT NULL` / adds the strict
   constraint.

A single add-nullable-then-rebuild-NOT-NULL migration applied before the new
code deploys is what bites. Reordering CI to deploy-before-migrate just breaks
it the other way (new code expects a column the migration hasn't added yet), so
this is a migration-authoring discipline, not a CI tweak.

Note: a red `web-deploy` run is usually the cosmetic marketing `screenshots`
job, not the deploy — check the `deploy-production` job specifically before
concluding a deploy failed.
