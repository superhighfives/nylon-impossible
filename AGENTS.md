# AGENTS.md

This is the root agent guide for the **Nylon Impossible** monorepo. Read this before making changes.

## Project Overview

Nylon Impossible is a cross-platform todo application with three clients:

| Project | Path | Stack |
|---------|------|-------|
| Web | `src/web/` | TanStack Start, React 19, Cloudflare Workers, D1 |
| API | `src/api/` | Hono, Cloudflare Workers, D1, Durable Objects |
| iOS | `src/ios/` | SwiftUI, SwiftData, iOS 26+ |

The web and iOS apps are independent clients that both talk to the API Worker. Real-time sync is handled via WebSockets through a Durable Object (`UserSync`). Authentication uses Clerk across all platforms.

## Repository Structure

```
nylon-impossible/
├── src/
│   ├── web/          # TanStack Start web app (see src/web/AGENTS.md)
│   ├── api/          # Hono REST + WebSocket API
│   └── ios/          # SwiftUI iOS app
├── plans/
│   ├── ready/        # Plans ready to implement
│   ├── backlog/      # Ideas for future work
│   └── done/         # Completed plans
├── scripts/          # Shell scripts (db reset, backup)
├── package.json      # Root pnpm workspace
└── AGENTS.md         # This file
```

Each subproject has its own README. The web project also has `src/web/AGENTS.md` with component-level guidance.

## Package Manager

This repo uses **pnpm** with workspaces. Always use `pnpm`, never `npm` or `yarn`.

```bash
pnpm install          # Install all dependencies
```

Node.js 22+ is required.

## Key Commands

All commands below are run from the **repo root** unless noted.

### Development

```bash
pnpm dev              # Start web + API dev servers in parallel
pnpm web:dev          # Web only (http://localhost:3000)
pnpm api:dev          # API only (http://localhost:8787)
pnpm ios:open         # Open Xcode project
pnpm ios:simulator    # Open iOS Simulator
```

### Code Quality

**Always run these before committing and verify they pass. CI enforces them and PRs will fail if they don't.**

```bash
pnpm lint             # Biome linter (web + API)
pnpm check            # Biome lint + format check (web + API)
pnpm typecheck        # TypeScript type checking (web + API)
pnpm test             # Vitest tests (web + API)
```

Per-project:
```bash
pnpm web:check && pnpm web:typecheck && pnpm web:test
pnpm api:check && pnpm api:typecheck && pnpm api:test
```

> After making any code changes, run `pnpm check` and confirm the output is `No fixes applied` before committing. If it reports errors, fix them first.

### Database

Migrations live in `src/api/migrations/` and are shared between web and API.

```bash
pnpm db:migrate        # Apply migrations locally
pnpm db:migrate:remote # Apply migrations to production
pnpm db:generate       # Generate migration from schema changes (Drizzle Kit)
pnpm db:status         # List migration history
pnpm db:seed           # Seed local database
pnpm db:fresh          # Reset + seed local database
pnpm db:studio         # Open Drizzle Studio
```

### Deployment

```bash
pnpm deploy            # Deploy web + API to Cloudflare Workers
pnpm web:deploy        # Deploy web only
pnpm api:deploy        # Deploy API only
```

## Architecture

### Data Flow

```
Browser / iOS App
  → Clerk auth (JWT / session)
  → API Worker (Hono, REST endpoints)
  → D1 Database (SQLite, shared)
  → Durable Object (UserSync, WebSocket broadcast)
  → Other connected clients receive {"type": "sync"} and pull
```

### Database

- Single D1 database shared by web and API
- Schema managed by Drizzle ORM, migrations applied via Wrangler
- Two tables: `users` (Clerk integration) and `todos` (with position tracking for ordering)
- Fractional indexing is used for todo ordering (see `FractionalIndexing.swift` on iOS, equivalent logic in web)

### Sync Protocol

The `POST /todos/sync` endpoint handles bidirectional sync:
- Clients send `lastSyncedAt` + local `changes`
- Server returns `todos` (server-side changes since last sync), `syncedAt`, and `conflicts`
- Conflict resolution: last-write-wins
- After a mutation, clients send `{"type": "changed"}` over WebSocket; the Durable Object broadcasts `{"type": "sync"}` to all other connections

### Authentication

- **Web**: Clerk React SDK, session-based, server functions access user via Clerk session
- **API**: Clerk JWT verification middleware (`src/api/src/lib/auth.ts`), all `/todos` routes require auth
- **iOS**: Clerk iOS SDK, JWT passed as query param for WebSocket, Bearer token for REST

## Web App Conventions

The web app uses Effect for type-safe error handling. See `src/web/AGENTS.md` for full details on Effect patterns, Kumo component usage, and server function conventions.

Key files:
- `src/web/src/server/todos.ts` — All CRUD server functions
- `src/web/src/lib/errors.ts` — Tagged error types
- `src/web/src/lib/auth.ts` — Auth layer (Effect)
- `src/web/src/lib/db.ts` — Database client (Effect + Drizzle)
- `src/web/src/lib/validation.ts` — Zod schemas
- `src/web/src/hooks/useTodos.ts` — TanStack Query hooks with optimistic updates
- `src/web/src/hooks/useWebSocket.ts` — WebSocket hook for real-time sync

Routes use TanStack Router's file-based routing under `src/web/src/routes/`. The route tree is auto-generated at `src/web/src/routeTree.gen.ts` — do not edit it manually.

## API Conventions

Key files:
- `src/api/src/index.ts` — Hono app, route definitions, middleware
- `src/api/src/handlers/todos.ts` — CRUD handlers
- `src/api/src/handlers/sync.ts` — Sync endpoint with conflict resolution
- `src/api/src/lib/auth.ts` — Clerk JWT middleware
- `src/api/src/lib/db.ts` — Drizzle schema + database client
- `src/api/src/durable-objects/UserSync.ts` — WebSocket Durable Object

All protected routes use the auth middleware. Env bindings are typed via `src/api/src/types.ts`.

Testing runs in the actual Workers runtime via `@cloudflare/vitest-pool-workers`. Tests live in `src/api/test/` with integration tests against a real local D1 instance.

## iOS Conventions

The iOS app is offline-first:
1. All writes go to SwiftData immediately
2. `SyncService` pushes unsynced items to the API in the background
3. `WebSocketService` listens for sync notifications and triggers a pull
4. Unsynced items are tracked with `isSynced = false`

Project uses SwiftLint. Run from `src/ios/Nylon Impossible/`:
```bash
swiftlint
```

Deployment to TestFlight via Fastlane:
```bash
cd "src/ios/Nylon Impossible"
bundle exec fastlane release
```

## CI/CD

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `deploy.yml` | Push to `main`, PRs | Lint + typecheck + test, then deploy to Cloudflare; PRs get preview environments at `pr-{N}.nylonimpossible.com` |
| `testflight.yml` | Manual | Build and upload iOS to TestFlight |
| `copilot-setup-steps.yml` | Manual | GitHub Copilot environment setup |

Preview deployments are created per PR and cleaned up on PR close. Preview API URLs follow the pattern `api-pr-{N}.nylonimpossible.com`.

## Plans

Implementation plans live in the `plans/` directory.

The canonical documentation for:

- the **backlog → ready → done** lifecycle
- plan file naming conventions
- the plan template and required sections

is in `plans/README.md`. Refer to that file when creating, updating, or reviewing plans to avoid conflicting sources of truth.

At a high level:

- New work typically starts as a plan in `plans/`.
- Keep plans up to date as decisions are made and work progresses.
- Move plans through their lifecycle as described in `plans/README.md`.

For any details beyond this summary (status definitions, examples, and frontmatter structure), always follow `plans/README.md`.




3. Before starting significant work, check `plans/ready/` for an existing spec.
4. When implementation is complete, move the plan file to `plans/done/` and update its **Status** to `Complete`. Add an **Overview** and **Architecture** section documenting what was actually built and any deviations from the spec.

## Environment Variables

### Web (`src/web/.dev.vars` + `src/web/.env.local`)
```
CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### API (`src/api/.dev.vars`)
```
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
```

Both `.dev.vars` and `.env.local` files are git-ignored. Never commit secrets.

## Web Styling (Radix Colors)

The web app uses [`tailwindcss-radix-colors`](https://tailwindcss-radix-colors.mrcai.dev) for the color system. Colors are imported in `src/web/src/styles.css` using `-colors-only.css` (raw step classes only). Semantic utilities are defined in `src/web/src/styles/radix-utilities.css`.

### Semantic utilities

Custom utilities in `src/web/src/styles/radix-utilities.css` map directly to Radix scale steps. Hover/active states are **explicit** — compose them in the component, not bundled in the utility.

#### Backgrounds

| Utility | Step | Use case |
|---------|------|----------|
| `bg-{color}-app` | 1 | App background |
| `bg-{color}-surface` | 2 | Cards, raised surfaces |
| `bg-{color}-base` | 3 | Component background (normal) |
| `bg-{color}-hover` | 4 | Component background (hover) |
| `bg-{color}-active` | 5 | Component background (active/pressed) |
| `bg-{color}-ghost` | transparent | Ghost base |
| `bg-{color}-ghost-hover` | 3 | Ghost hover |
| `bg-{color}-ghost-active` | 4 | Ghost active |
| `bg-{color}-solid` | 9 | Solid accent |
| `bg-{color}-solid-hover` | 10 | Solid accent hover |

#### Borders / Dividers / Rings / Underlines

| Utility | Step | Use case |
|---------|------|----------|
| `{type}-{color}-subtle` | 6 | Non-interactive, separators |
| `{type}-{color}` | 7 | Default interactive |
| `{type}-{color}-strong` | 8 | Emphasis, focus rings |

Where `{type}` is: `border`, `divide`, `ring`, `underline`

#### Text

| Utility | Step | Use case |
|---------|------|----------|
| `text-{color}-placeholder` | 10 | Placeholder text |
| `text-{color}-muted` | 11 | Secondary/muted text |
| `text-{color}` | 12 | Primary text (baseline) |

Available colors: `gray`, `yellow`, `red`

Example:
```html
<div class="bg-gray-app text-gray border-b border-gray-subtle">
  <button class="bg-yellow-solid hover:bg-yellow-solid-hover text-gray-12">Primary</button>
  <button class="bg-gray-base hover:bg-gray-hover active:bg-gray-active text-gray ring-1 ring-gray-subtle">Secondary</button>
</div>
```

### Importing colors

Colors are imported as `-colors-only.css` (CSS variables + raw step utilities, no bundled semantic classes):
```css
@import "tailwindcss-radix-colors/dist/gray-colors-only.css";
@import "tailwindcss-radix-colors/dist/yellow-colors-only.css";
@import "tailwindcss-radix-colors/dist/red-colors-only.css";
```

### CSS variables

Radix colors are exposed as CSS variables following Tailwind v4 conventions. Use them in custom CSS or inline styles:

```css
/* Light mode: --color-yellow-9, dark mode: --color-yellowdark-9 */
.custom-element {
  background: var(--color-yellow-9);
}
```

Variable naming: `--color-{color}-{step}` for light, `--color-{color}dark-{step}` for dark (e.g., `--color-gray-1`, `--color-graydark-1`).

## Common Gotchas

- **Database migrations** are defined in `src/api/migrations/` but applied via the root `pnpm db:migrate` command. The API owns the schema; web reads from the same D1 binding.
- **Cloudflare types** (`worker-configuration.d.ts`) are generated — run `pnpm cf-typegen` from within `src/web/` or `src/api/` after changing `wrangler.jsonc`.
- **Route tree** (`src/web/src/routeTree.gen.ts`) is auto-generated by TanStack Router — do not edit it manually.
- **WebSocket auth**: the iOS client passes the JWT as a query param (`/ws?token=<jwt>`); the web client also uses this pattern via `useWebSocket.ts`.
- **Effect**: the web app uses Effect throughout for error handling. Do not bypass Effect's error channels with raw try/catch in server functions.
