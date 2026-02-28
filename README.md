<p align="center">
  <img src="./assets/logo.svg" width="120" height="120" alt="Nylon Impossible logo">
</p>

# Nylon Impossible

A cross-platform todo application with web, API, and iOS clients. Real-time sync across devices via WebSockets, authentication via Clerk, and deployment on Cloudflare Workers.

## Structure

This is a monorepo managed with pnpm workspaces:

| Project | Path | Stack |
|---------|------|-------|
| [Web](src/web/) | `src/web` | TanStack Start, React 19, Cloudflare Workers, D1 |
| [API](src/api/) | `src/api` | Hono, Cloudflare Workers, D1, Durable Objects |
| [iOS](src/ios/) | `src/ios/Nylon Impossible` | SwiftUI, SwiftData, iOS 26+ |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare                               │
│  ┌─────────────────────┐         ┌─────────────────────────┐    │
│  │   Web App Worker    │         │     API Worker          │    │
│  │  (TanStack Start)   │         │  api.nylonimpossible.com│    │
│  │                     │         │                         │    │
│  │  - Web UI           │         │  - Hono REST API        │    │
│  │  - Server functions │         │  - WebSocket sync       │    │
│  └──────────┬──────────┘         └────────────┬────────────┘    │
│             │                                  │                │
│             └──────────────┬───────────────────┘                │
│                            ▼                                    │
│             ┌───────────────┐  ┌──────────────────┐             │
│             │   D1 Database │  │  Durable Object  │             │
│             │   (shared)    │  │  (UserSync WS)   │             │
│             └───────────────┘  └──────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                            ▲
            ┌───────────────┴───────────────┐
            │                               │
     ┌──────┴──────┐                 ┌──────┴──────┐
     │   Web App   │                 │   iOS App   │
     │  (Browser)  │                 │  (SwiftUI)  │
     │             │                 │             │
     │ Clerk Auth  │                 │ Clerk Auth  │
     │ (sessions)  │                 │ (JWT)       │
     └─────────────┘                 └─────────────┘
```

- Web and iOS are independent clients
- Both authenticate via Clerk (different SDKs, same user pool)
- Both read/write to the same D1 database
- API Worker handles REST endpoints + WebSocket sync via Durable Objects
- Real-time sync: mutations broadcast via WebSocket, triggering pulls on other clients

## Getting Started

```bash
# Install dependencies
pnpm install

# Apply database migrations locally
pnpm db:migrate

# Start web + API dev servers
pnpm dev
```

The web app runs at **http://localhost:3001** and the API at **http://localhost:8787**.

For iOS, open the Xcode project:

```bash
pnpm ios:open
```

See each project's README for detailed setup:
- [`src/web/README.md`](src/web/README.md)
- [`src/api/README.md`](src/api/README.md)
- [`src/ios/README.md`](src/ios/README.md)

## Scripts

### Development

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start web + API dev servers in parallel |
| `pnpm ios:open` | Open iOS project in Xcode |
| `pnpm ios:simulator` | Open iOS Simulator |

### Code Quality

| Script | Description |
|--------|-------------|
| `pnpm lint` | Run Biome linter on web + API |
| `pnpm check` | Run Biome lint + format check on web + API |
| `pnpm typecheck` | Run TypeScript type checking on web + API |
| `pnpm test` | Run Vitest tests on web + API |

### Database

| Script | Description |
|--------|-------------|
| `pnpm db:migrate` | Apply D1 migrations locally (web + API) |
| `pnpm db:migrate:remote` | Apply D1 migrations to production |

### Deployment

| Script | Description |
|--------|-------------|
| `pnpm deploy` | Deploy web + API to Cloudflare Workers |

### Per-Project

All project-specific scripts are available with prefixes (`web:*`, `api:*`, `ios:*`):

```bash
pnpm web:dev        # Start web dev server only
pnpm api:dev        # Start API dev server only
pnpm web:test       # Run web tests
pnpm api:test       # Run API tests
pnpm web:typecheck  # Type check web only
pnpm api:lint       # Lint API only
```

## CI/CD

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `lint.yml` | PRs, push to main | Biome + tsc (web, API), SwiftLint (iOS) |
| `deploy.yml` | Push to main, PRs | Deploy to Cloudflare Workers + preview environments |
| `testflight.yml` | Manual | Build and upload iOS app to TestFlight |

## License

MIT
