# Nylon Impossible (API)

REST API and real-time sync service for the Nylon Impossible todo app. Built with Hono on Cloudflare Workers, using D1 for storage and Durable Objects for WebSocket broadcasting.

## Tech Stack

- **[Hono](https://hono.dev/)** - Lightweight web framework for Cloudflare Workers
- **[Cloudflare Workers](https://workers.cloudflare.com/)** - Serverless edge runtime
- **[Cloudflare D1](https://developers.cloudflare.com/d1/)** - SQLite-based serverless database
- **[Durable Objects](https://developers.cloudflare.com/durable-objects/)** - WebSocket state management for real-time sync
- **[Clerk](https://clerk.com/)** - JWT authentication verification
- **[Drizzle ORM](https://orm.drizzle.team/)** - Type-safe SQL query builder
- **[Zod](https://zod.dev/)** - Runtime input validation

### Development Tools

- **[Biome](https://biomejs.dev/)** - Linter and formatter
- **[Vitest](https://vitest.dev/)** + **[@cloudflare/vitest-pool-workers](https://developers.cloudflare.com/workers/testing/vitest-integration/)** - Testing in Workers runtime
- **[TypeScript](https://www.typescriptlang.org/)** - Strict type checking

## API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/` | Health check | No |
| `GET` | `/health` | Health check | No |
| `GET` | `/ws` | WebSocket upgrade (real-time sync) | Token in query |
| `GET` | `/todos` | List todos | Yes |
| `POST` | `/todos` | Create todo | Yes |
| `POST` | `/todos/sync` | Sync todos (bulk create/update/delete) | Yes |
| `PUT` | `/todos/:id` | Update todo | Yes |
| `DELETE` | `/todos/:id` | Delete todo | Yes |
| `POST` | `/gmail-addon/homepage` | Gmail add-on homepage card | Google ID token |
| `POST` | `/gmail-addon/contextual` | Gmail add-on message card | Google ID token |
| `POST` | `/gmail-addon/actions/*` | Gmail add-on card actions | Google ID token |

### Sync Protocol

The sync endpoint (`POST /todos/sync`) accepts:
- `lastSyncedAt` - ISO 8601 timestamp of last sync (null for first sync)
- `changes` - Array of local changes (creates, updates, deletes)

Returns:
- `todos` - All server-side todos updated since `lastSyncedAt`
- `syncedAt` - Server timestamp for next sync
- `conflicts` - Array of conflict resolutions (last-write-wins)

### WebSocket

Clients connect to `/ws?token=<jwt>` for real-time notifications. The Durable Object:
- Broadcasts `{"type": "sync"}` to all connections when a client sends `{"type": "changed"}`
- Excludes the sender from the broadcast
- Handles reconnection gracefully

### Gmail / Workspace add-on

The `/gmail-addon/*` routes back a Google Workspace Add-on that lives in Gmail's
side panel (quick-add, list open todos, add-from-message). They are **not**
wrapped in the Clerk `authMiddleware`; instead a Google-signed ID token is the
credential, verified by `verifyGoogleIdToken` (`src/lib/addon-auth.ts`) against
Google's JWKS with an `aud`/`iss` check — the same "signature is the auth"
pattern as the Clerk webhook route.

Card actions reuse the exact REST code paths (`createSmartTodo`,
`listOpenTodos`, `setTodoCompleted`), so AI/URL handling, positioning, and
`notifySync` stay identical to the web/iOS surfaces. A verified Google identity
is mapped to a Nylon Clerk user by `resolveNylonUser` (existing link →
email auto-link → "Connect Nylon" card). Requesting only current-message
**metadata** scope keeps message bodies out of reach.

Configure `GMAIL_ADDON_AUDIENCE` and `WEB_BASE_URL` (vars) plus the
`GMAIL_ADDON_STATE_SECRET` secret. The full Google Cloud runbook and the
deployment manifest live in [`src/gmail-addon/`](../gmail-addon/README.md).

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+

### Development

```bash
# Start dev server (from root)
pnpm api:dev

# Or from this directory
pnpm dev
```

The API runs at **http://localhost:8787**.

### Environment

Copy `.env.example` to `.env` and fill in the values. Wrangler picks up `.env` automatically for local dev.

```bash
cp .env.example .env
```

Required for the worker:

- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk auth
- `AI_GATEWAY_ID` — AI Gateway slug (already set in `.env.example`)

Required for the `probe` script (Workers AI + Tavily access from outside the worker):

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `TAVILY_API_KEY` — get one at [tavily.com](https://tavily.com); the research feature won't work without it

In production, set the same values as Workers secrets via `wrangler secret put`.

### Database

The API shares the D1 database with the web project. Migrations live in `src/api/migrations/`.

```bash
# Apply migrations locally
pnpm db:migrate

# Apply to production
pnpm db:migrate:remote
```

## Project Structure

```
src/api/
├── src/
│   ├── index.ts                  # Hono app with routes and middleware
│   ├── types.ts                  # Env bindings type definitions
│   ├── db/seeds/                 # SQL seed data for local dev
│   ├── handlers/
│   │   ├── todos.ts              # CRUD endpoint handlers
│   │   ├── sync.ts               # Sync endpoint with conflict resolution
│   │   ├── users.ts              # Current-user endpoints
│   │   ├── smart-create.ts       # Thin wrapper over createSmartTodo (background AI enrichment)
│   │   ├── reresearch.ts         # Manually re-run research for a todo
│   │   ├── cancel-research.ts    # Cancel an in-flight research job
│   │   └── gmail-addon/          # Gmail add-on card handlers (homepage, contextual, actions)
│   ├── lib/
│   │   ├── ai.ts                 # enrichTodo classifier + tool schema
│   │   ├── ai-enrich.ts          # Background enrichment orchestration (DB writes, queue dispatch)
│   │   ├── research.ts           # Tavily search + summarization for research-typed todos
│   │   ├── auth.ts               # Clerk JWT verification middleware
│   │   ├── addon-auth.ts         # Google ID-token verification + resolveNylonUser (Gmail add-on)
│   │   ├── addon-cards.ts        # Pure JSON card builders + response envelopes
│   │   ├── create-todo.ts        # Shared smart-create core (REST + add-on)
│   │   ├── todos-core.ts         # Shared listOpenTodos + setTodoCompleted
│   │   ├── db.ts                 # Drizzle schema and database client
│   │   ├── errors.ts             # Shared error types
│   │   ├── notify-sync.ts        # Poke the sync Durable Object after writes
│   │   ├── url-helpers.ts        # URL parsing / title-truncation utilities
│   │   └── url-metadata.ts       # OG metadata fetching for extracted URLs
│   └── durable-objects/
│       └── UserSync.ts           # WebSocket Durable Object
├── scripts/
│   └── probe-research.ts         # Probe enrich / fetch / research outside the worker (see "Probing AI flows")
├── migrations/                   # D1 migrations (drizzle-generated + raw SQL)
├── test/
│   ├── helpers.ts                # Test utilities (seed, auth mock)
│   ├── apply-migrations.ts       # D1 migration setup for tests
│   ├── __mocks__/                # Per-module mocks (ai, clerk-backend, url-metadata)
│   ├── unit/                     # Pure-logic tests (ai, auth, errors, url-helpers, ...)
│   └── integration/              # Tests against real D1 + Workers runtime
├── drizzle.config.ts             # Drizzle Kit config
├── vitest.config.ts              # Vitest with Workers pool config
├── tsconfig.json                 # TypeScript (strict)
└── wrangler.jsonc                # Cloudflare Workers config
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server with local D1 |
| `pnpm test` | Run Vitest tests in Workers runtime |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Run Biome linter |
| `pnpm format` | Format code with Biome |
| `pnpm check` | Run Biome lint + format check |
| `pnpm deploy` | Deploy to Cloudflare Workers |
| `pnpm cf-typegen` | Generate Cloudflare binding types |
| `pnpm probe` | Probe AI flows outside the app (see below) |

## Probing AI flows

The `probe` script (`scripts/probe-research.ts`) reproduces production's AI calls against the real Workers AI and Tavily APIs without booting the worker. Useful for tuning prompts, comparing models, and debugging extractor regressions.

It reads `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `TAVILY_API_KEY` from `src/api/.env` (or the shell env).

Three modes:

| Mode | What it does |
|------|--------------|
| `enrich` | Runs the `enrichTodo` classifier — same prompt and tool schema as production. Reports the raw Workers AI response so you can inspect tool_calls and reasoning_content. |
| `fetch` | Calls Tavily directly with the query. Sanity check that `TAVILY_API_KEY` works and returns sources. |
| `research` | Full Tavily → kimi-k2.6 summarization chain that production runs for research-typed todos. |

```bash
pnpm probe enrich "Research dogs"
pnpm probe fetch "Research dogs"
pnpm probe research "Research dogs"
```

Override the Workers AI model (applies to `enrich` and `research`):

```bash
pnpm probe --model @cf/openai/gpt-oss-120b enrich "Research dogs"
```

The probe imports the actual prompt + tool schema from [`src/lib/ai.ts`](src/lib/ai.ts) and the summarize payload builder from [`src/lib/research.ts`](src/lib/research.ts), so it can't drift from production.

## Deployment

```bash
pnpm deploy
```

Deployed to `https://api.nylonimpossible.com`. Requires `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` set as Workers secrets.

## License

MIT
