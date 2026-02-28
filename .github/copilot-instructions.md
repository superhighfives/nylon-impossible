# Copilot Instructions

## Project Overview

Nylon Impossible is a cross-platform todo app with web, API, and iOS clients. It features real-time sync across devices via WebSockets, authentication via Clerk, and deployment on Cloudflare Workers.

## Repository Structure

This is a monorepo managed with pnpm workspaces:

| Project | Path | Stack |
|---------|------|-------|
| Web | `src/web` | TanStack Start, React 19, Cloudflare Workers, D1 |
| API | `src/api` | Hono, Cloudflare Workers, D1, Durable Objects |
| iOS | `src/ios` | SwiftUI, SwiftData, iOS 26+ |

## Tech Stack

### Web (`src/web`)
- **TanStack Start** – Full-stack React framework with file-based routing
- **TanStack Router** – Type-safe client-side routing
- **TanStack Query** – Data fetching with optimistic updates
- **React 19** with TypeScript (strict)
- **Tailwind CSS v4** + **@cloudflare/kumo** design system components
- **Cloudflare Workers** + **D1** (SQLite) for backend/storage
- **Drizzle ORM** – Schema in `src/web/src/lib/schema.ts`; migrations in `src/web/migrations/`
- **Clerk** – Authentication (session-based in the web app)

### API (`src/api`)
- **Hono** – Lightweight web framework
- **Cloudflare Workers** + **D1** + **Durable Objects** (WebSocket sync)
- **Drizzle ORM** – Schema in `src/api/src/lib/db.ts`
- **Clerk** – JWT verification middleware
- **Zod** – Runtime input validation

### iOS (`src/ios`)
- **SwiftUI** + **SwiftData**, requires iOS 26+
- **Clerk** – JWT-based authentication

## Key Conventions

### Code Style
- **Biome 2.2.4** for linting and formatting across web and API (`biome.json` in each project)
- **TypeScript strict mode** with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- Double quotes for JavaScript/TypeScript strings (configured in Biome)
- 2-space indentation

### Biome Overrides in Tests
- API tests (`test/**/*`): `noExplicitAny` and `noNonNullAssertion` rules are disabled
- Web tests (`__tests__/**/*`): same rules disabled

### Kumo Design System (web only)
- Use only Kumo semantic tokens – never raw Tailwind colors like `bg-gray-500` or `text-blue-600`
- Common tokens: `bg-surface`, `bg-secondary`, `text-surface`, `text-muted`, `ring-border`, `ring-active`
- Import components from `@cloudflare/kumo`; prefer granular imports for tree-shaking:
  ```ts
  import { Button } from "@cloudflare/kumo/components/button";
  ```
- All semantic tokens automatically adapt to dark mode; no manual `dark:` prefixes needed

### API Patterns
- Authentication middleware in `src/api/src/lib/auth.ts` using Clerk JWT
- Handlers in `src/api/src/handlers/` – after insert, immediately re-select by ID to return the created record
- Todo ordering uses fractional indexing via a `position` text column (default `"a0"`); fetch last position with `orderBy(desc(todos.position))`
- WebSocket sync: Durable Object broadcasts `{"type":"sync"}` to all connections when a client sends `{"type":"changed"}`

### Web App URL
- Development API: `http://localhost:8787`
- Production API: `https://api.nylonimpossible.com`
- These are hardcoded in `src/web/src/hooks/useTodos.ts` (no environment variable pattern)

### Database
- The API and web share a single D1 database; migrations live in `src/web/migrations/`
- Schema for the web: `src/web/src/lib/schema.ts`
- Schema for the API: `src/api/src/lib/db.ts`

## Development Commands

```bash
# Install dependencies
pnpm install

# Apply D1 migrations locally
pnpm db:migrate

# Start web + API dev servers in parallel
pnpm dev           # web at :3001, API at :8787

# Per-project dev
pnpm web:dev
pnpm api:dev
```

## Code Quality

```bash
pnpm lint         # Biome linter (web + API)
pnpm check        # Biome lint + format check (web + API)
pnpm typecheck    # TypeScript type checking (web + API)
pnpm test         # Vitest tests (web + API)
```

## Testing

- **API**: unit tests in `src/api/test/unit/` (pure functions); integration tests in `src/api/test/integration/` using `cloudflare:test` SELF against a real D1 instance
- **Web**: unit tests in `src/web/src/test/` using Vitest
- Run with: `pnpm api:test` / `pnpm web:test`

## Deployment

```bash
pnpm deploy       # Deploy web + API to Cloudflare Workers
```

Deployed URLs:
- Web: `https://nylonimpossible.com`
- API: `https://api.nylonimpossible.com`

## CI/CD Workflows (`.github/workflows/`)

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `lint.yml` | PRs, push to main | Biome + tsc (web, API), SwiftLint (iOS) |
| `test.yml` | PRs, push to main | Vitest tests (web, API) |
| `deploy.yml` | Push to main, PRs | Deploy to Cloudflare Workers + preview environments |
| `testflight.yml` | Manual | Build and upload iOS app to TestFlight |
