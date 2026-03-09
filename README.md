<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-inverted-no-background.svg">
    <img src="./assets/logo-no-background.svg" width="120" height="120" alt="Nylon Impossible logo">
  </picture>
</p>

# Nylon Impossible

A cross-platform todo app for web and iOS. Real-time sync via WebSockets, AI-assisted task creation, and Clerk authentication — deployed on Cloudflare Workers.

## Features

- **Real-time sync** across devices via WebSockets and Durable Objects
- **AI task creation** — plain language input parsed into structured todos with tool calling
- **iOS native** — SwiftUI app with Siri integration and Share Sheet support
- **PWA** — installable web app with offline-ready architecture
- **Cross-platform auth** — Clerk sessions on web, JWT on iOS, same user pool

## Structure

| Project | Path | Stack |
|---------|------|-------|
| [Web](src/web/) | `src/web` | TanStack Start, React 19, Cloudflare Workers, D1 |
| [API](src/api/) | `src/api` | Hono, Cloudflare Workers, D1, Durable Objects |
| [iOS](src/ios/) | `src/ios/Nylon Impossible` | SwiftUI, SwiftData, iOS 18+ |

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

- Web and iOS are independent clients sharing the same D1 database
- Both authenticate via Clerk (different SDKs, same user pool)
- Mutations broadcast via WebSocket, triggering pulls on other clients

## Getting Started

```bash
# Install dependencies
pnpm install

# Apply database migrations locally
pnpm db:migrate

# Start web + API dev servers
pnpm dev
```

Web runs at **http://localhost:3000**, API at **http://localhost:8787**.

For iOS, open the Xcode project:

```bash
pnpm ios:open
```

See each package's README for detailed setup:
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
| `pnpm db:fresh` | Reset, migrate, and seed local database |
| `pnpm db:seed` | Seed local database with test data |

### Deployment

| Script | Description |
|--------|-------------|
| `pnpm deploy` | Deploy web + API to Cloudflare Workers |

All scripts are also available per-package with `web:*`, `api:*`, and `ios:*` prefixes.

## Plans

Implementation plans live in [`plans/`](plans/):

| Folder | Purpose |
|--------|---------|
| [`plans/ready/`](plans/ready/) | Fully specced, ready to implement |
| [`plans/backlog/`](plans/backlog/) | Ideas and stubs |
| [`plans/done/`](plans/done/) | Completed work |

## CI/CD

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `lint.yml` | PRs, push to main | Biome + tsc (web, API), SwiftLint (iOS) |
| `deploy.yml` | Push to main, PRs | Deploy to Cloudflare Workers + preview environments |
| `testflight.yml` | Manual | Build and upload iOS app to TestFlight |

## License

MIT
