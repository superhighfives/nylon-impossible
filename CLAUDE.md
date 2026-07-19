# nylon-impossible

Baseline rules live in [superhighfives/control-room](https://github.com/superhighfives/control-room/blob/main/BASELINE.md).
This file is the repo-specific part.

## Layout

pnpm workspaces: `src/shared`, `src/web`, `src/api`, `src/admin`,
`src/marketing`. `@nylon-impossible/shared` is consumed by both `web` and `api`.

Only `web`, `api`, and `admin` have their own check scripts, so `pnpm typecheck`
and `pnpm lint` fan out to those three. Per-package variants are prefixed
(`pnpm api:test`, `pnpm web:typecheck`).

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
