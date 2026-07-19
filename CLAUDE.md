# nylon-impossible

Baseline rules live in [superhighfives/control-room](https://github.com/superhighfives/control-room/blob/main/BASELINE.md).
This file is the repo-specific part.

## Layout

pnpm workspaces: `src/web`, `src/api`, `src/admin`. Root scripts fan out to all
three — `pnpm typecheck` and `pnpm lint` each run the full set, and per-package
variants are prefixed (`pnpm api:test`, `pnpm web:typecheck`).

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

Anything reached via `c.env.*` must exist in `Env["Bindings"]` **and** in the
relevant `wrangler.jsonc`. A binding that type-checks because someone widened
the type but isn't in the wrangler config will fail at runtime, not at build.

## Errors

Handlers return errors through `apiError(c, code)` with a code from
`API_ERRORS` in `src/api/src/lib/errors.ts` — don't hand-write status codes or
message strings at the call site.
