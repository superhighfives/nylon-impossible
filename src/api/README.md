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

Create `.dev.vars` for local development:

```bash
CLERK_SECRET_KEY=sk_test_your_key_here
CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

### Database

The API shares the D1 database with the web project. Migrations live in `src/web/migrations/`.

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
│   ├── index.ts              # Hono app with routes and middleware
│   ├── types.ts              # Env bindings type definitions
│   ├── handlers/
│   │   ├── todos.ts          # CRUD endpoint handlers
│   │   └── sync.ts           # Sync endpoint with conflict resolution
│   ├── lib/
│   │   ├── auth.ts           # Clerk JWT verification middleware
│   │   └── db.ts             # Drizzle schema and database client
│   └── durable-objects/
│       └── UserSync.ts       # WebSocket Durable Object
├── test/
│   ├── helpers.ts            # Test utilities (seed, auth mock)
│   ├── apply-migrations.ts   # D1 migration setup for tests
│   ├── unit/
│   │   └── auth.test.ts      # Auth middleware tests
│   └── integration/
│       ├── routing.test.ts   # Route matching, CORS, 404s
│       ├── todos-crud.test.ts # Full CRUD against real D1
│       ├── sync.test.ts      # Sync with conflict resolution
│       └── durable-object.test.ts # WebSocket broadcast tests
├── biome.json                # Biome linter/formatter config
├── vitest.config.ts          # Vitest with Workers pool config
├── tsconfig.json             # TypeScript (strict)
└── wrangler.jsonc            # Cloudflare Workers config
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

## Deployment

```bash
pnpm deploy
```

Deployed to `https://api.nylonimpossible.com`. Requires `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` set as Workers secrets.

## License

MIT
