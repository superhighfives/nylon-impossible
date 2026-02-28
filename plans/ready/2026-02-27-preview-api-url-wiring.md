# Plan: Wire Preview Deployments to Use Preview API

## Context

PR preview deployments create separate workers for web (`pr-N.nylonimpossible.com`) and API (`api-pr-N.nylonimpossible.com`), but the web app always talks to the production API. Two client-side connections are hardcoded to `api.nylonimpossible.com`:

1. **Smart create** — `useTodos.ts` fetches `https://api.nylonimpossible.com/todos/smart`
2. **WebSocket** — `useWebSocket.ts` connects to `wss://api.nylonimpossible.com/ws`

Standard CRUD operations (getTodos, createTodo, updateTodo, deleteTodo) are TanStack server functions that run on the web worker itself via D1 bindings — these already work correctly in previews since they don't go through the API worker.

iOS stays on production for now (hardcoded in `Config.swift`).

## Approach

Introduce a `VITE_API_BASE_URL` env var. At build time, Vite bakes it into the client bundle. The deploy workflow conditionally sets it to the preview API URL when the API is also being deployed in that PR.

```
                          API changed?
                         /           \
                       yes            no
                       /               \
VITE_API_BASE_URL = api-pr-N    VITE_API_BASE_URL = api (production)
```

## File Changes

### 1. New: `src/web/src/lib/config.ts`

Centralise the API URL logic into one place instead of duplicating across hooks:

```ts
const apiBaseUrl =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:8787"
    : (import.meta.env.VITE_API_BASE_URL ?? "https://api.nylonimpossible.com");

export const API_URL = apiBaseUrl;
export const WS_URL = apiBaseUrl.replace(/^http/, "ws") + "/ws";
```

### 2. Update: `src/web/src/hooks/useTodos.ts`

Replace the inline `API_URL` constant with the import:

```ts
import { API_URL } from "@/lib/config";
```

Remove the existing `API_URL` declaration (lines 9-12).

### 3. Update: `src/web/src/hooks/useWebSocket.ts`

Replace the inline `WS_URL` constant with the import:

```ts
import { WS_URL } from "@/lib/config";
```

Remove the existing `WS_URL` declaration (lines 13-16).

### 4. Update: `.github/workflows/deploy.yml`

In both the `deploy-preview` build step ("Build preview Web") and the `deploy-production` build step ("Build Web"), pass the API URL:

**Production** (no change needed — falls back to default in config.ts):
```yaml
- name: Build Web
  if: steps.changes.outputs.web == 'true'
  run: pnpm --filter @nylon-impossible/web run build
  env:
    VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
```

**Preview** — conditionally set the API URL based on whether the API is also being deployed:
```yaml
- name: Build preview Web
  if: steps.changes.outputs.web == 'true'
  run: pnpm --filter @nylon-impossible/web run build
  env:
    VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
    VITE_API_BASE_URL: ${{ steps.changes.outputs.api == 'true' && format('https://api-pr-{0}.nylonimpossible.com', github.event.pull_request.number) || 'https://api.nylonimpossible.com' }}
```

### 5. Optional: `src/web/src/vite-env.d.ts`

Add type declaration for the new env var so TypeScript knows about it:

```ts
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}
```

## What This Doesn't Cover

- **iOS** — stays hardcoded to production for now. It _could_ be wired up by injecting the API URL as an Xcode build setting or `Info.plist` value during the Fastlane beta step in `testflight.yml`. However, TestFlight builds only trigger on pushes to `main` or PRs labeled `testflight`, so it's a different flow from the web/API preview deploys. Worth doing separately if needed.
- **Database isolation** — both preview and production workers bind to the same D1 database. Preview deploys test code changes, not data isolation.
- **CORS** — the preview API worker gets a custom domain (`api-pr-N.nylonimpossible.com`), and the web preview gets its own (`pr-N.nylonimpossible.com`). If the API has CORS origin checks, they may need updating to allow preview origins.

## Testing

1. Push a PR that changes both `src/web/` and `src/api/` — verify the preview web app connects to `api-pr-N`
2. Push a PR that changes only `src/web/` — verify it still connects to production `api.nylonimpossible.com`
3. Verify local dev (`localhost`) still works as before
