<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-inverted-no-background.svg">
    <img src="./assets/logo-no-background.svg" width="120" height="120" alt="Nylon Impossible logo">
  </picture>
</p>

# Nylon Impossible

A cross-platform todo app for web and iOS. Real-time sync via WebSockets, AI-assisted task creation, and Clerk authentication — deployed on Cloudflare Workers.

> **Note:** This is an exploratory project, not a production template. It was built to experiment with Cloudflare's developer platform — specifically Workers AI (for natural language todo parsing), Durable Objects (for WebSocket-based real-time sync), D1 (SQLite at the edge), and the Workers runtime in general. Expect rough edges, opinionated choices, and things that exist because they were interesting to build.

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

## Repository Setup

This section covers everything needed to get CI/CD working on a fresh fork or new repo. All secrets are configured under **GitHub → Settings → Secrets and variables → Actions**.

### Secret Overview

| Secret | Used by | Description |
|--------|---------|-------------|
| `CLOUDFLARE_API_TOKEN` | `web-deploy.yml` | Cloudflare API token for deploying Workers |
| `CLOUDFLARE_ACCOUNT_ID` | `web-deploy.yml` | Cloudflare account ID |
| `CLERK_SECRET_KEY` | `web-deploy.yml` | Clerk secret key (API worker) |
| `CLERK_PUBLISHABLE_KEY` | `web-deploy.yml` | Clerk publishable key (API worker) |
| `VITE_CLERK_PUBLISHABLE_KEY` | `web-deploy.yml` | Clerk publishable key (Vite web build) |
| `DEVELOPMENT_CERTIFICATE_BASE64` | `ios-deploy.yml` | Apple development cert (.p12), base64 |
| `DISTRIBUTION_CERTIFICATE_BASE64` | `ios-deploy.yml` | Apple distribution cert (.p12), base64 |
| `DISTRIBUTION_CERTIFICATE_PASSWORD` | `ios-deploy.yml` | Password protecting both .p12 files |
| `PROVISIONING_PROFILE_BASE64` | `ios-deploy.yml` | Main app provisioning profile, base64 |
| `SHARE_EXTENSION_PROFILE_BASE64` | `ios-deploy.yml` | Share extension provisioning profile, base64 |
| `KEYCHAIN_PASSWORD` | `ios-deploy.yml` | Any strong random string for the CI keychain |
| `ASC_KEY_ID` | `ios-deploy.yml` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | `ios-deploy.yml` | App Store Connect API issuer ID |
| `ASC_KEY_CONTENT` | `ios-deploy.yml` | App Store Connect API key content (.p8) |
| `APPLE_ID` | `ios-deploy.yml` | Your Apple ID email address |
| `TEAM_ID` | `ios-deploy.yml` | Apple Developer Team ID |

---

### Cloudflare

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. **Account ID**: Found on the right sidebar of your Workers & Pages overview page.
3. **API Token**: Go to **My Profile → API Tokens → Create Token**. Use the "Edit Cloudflare Workers" template, scope it to your account, and copy the token.

Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as repository secrets.

---

### Clerk

1. Create an application at [clerk.com](https://clerk.com/).
2. From the dashboard, grab:
   - **Publishable key** (`pk_test_…` or `pk_live_…`)
   - **Secret key** (`sk_test_…` or `sk_live_…`)
3. Set three secrets:
   - `CLERK_SECRET_KEY` — the secret key
   - `CLERK_PUBLISHABLE_KEY` — the publishable key (used by the API Worker)
   - `VITE_CLERK_PUBLISHABLE_KEY` — same publishable key (injected into the Vite web build)

---

### App Store Connect

The iOS deploy workflow uses three separate App Store Connect concepts: an **API key** (for authentication), **signing certificates** (for code signing), and **provisioning profiles** (to sign and authorise the app for App Store Connect/TestFlight distribution).

#### 1. App Store Connect API Key

The API key lets CI authenticate with App Store Connect without a human Apple ID and 2FA prompt. It's used by both Fastlane (to upload to TestFlight) and `xcodebuild` (to resolve provisioning during archiving).

1. Go to [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api).
2. Click **+** to generate a new key. Give it **Developer** access (sufficient for TestFlight uploads).
3. Download the `.p8` file — **you can only download it once**.
4. Note the **Key ID** (e.g. `ABC123DEFG`) shown next to the key.
5. Note the **Issuer ID** shown at the top of the page (a UUID).
6. Set the following secrets:
   - `ASC_KEY_ID` — the Key ID
   - `ASC_ISSUER_ID` — the Issuer ID
   - `ASC_KEY_CONTENT` — the raw text content of the `.p8` file (open it in a text editor and paste the whole thing, including the `-----BEGIN PRIVATE KEY-----` header and footer)

#### 2. Signing Certificates

You need two certificates: an **Apple Development** certificate (required for `xcodebuild archive` with `-allowProvisioningUpdates`) and an **Apple Distribution** certificate (used for the App Store export).

Both must be exported as `.p12` files from Keychain Access on a Mac where they were created or installed.

**Creating certificates (if you don't have them):**

1. Open **Xcode → Settings → Accounts**, select your Apple ID, and click **Manage Certificates**.
2. Click **+** and create **Apple Development** and **Apple Distribution** certificates. Xcode installs them into your keychain automatically.

**Exporting to .p12:**

1. Open **Keychain Access** on your Mac.
2. Find the certificate (e.g. "Apple Distribution: Your Name (TEAMID)") under **My Certificates** — this entry includes the private key.
3. Right-click → **Export** → choose `.p12` format.
4. Set a password (use the same password for both certs to keep things simple — this becomes `DISTRIBUTION_CERTIFICATE_PASSWORD`).
5. Repeat for the development certificate.

**Base64-encode and add as secrets:**

```bash
base64 -i distribution.p12 | pbcopy   # copies to clipboard
```

- `DEVELOPMENT_CERTIFICATE_BASE64` — base64-encoded development `.p12`
- `DISTRIBUTION_CERTIFICATE_BASE64` — base64-encoded distribution `.p12`
- `DISTRIBUTION_CERTIFICATE_PASSWORD` — the password you set when exporting

#### 3. Provisioning Profiles

This project has two targets — the main app (`com.superhighfives.Nylon-Impossible`) and the Share extension (`com.superhighfives.Nylon-Impossible.Nylon-Share`) — so you need two **App Store** provisioning profiles.

**Creating profiles:**

1. Go to [Apple Developer → Certificates, IDs & Profiles → Profiles](https://developer.apple.com/account/resources/profiles/list).
2. Click **+**, choose **App Store Connect** distribution.
3. Select the App ID for the main target (`com.superhighfives.Nylon-Impossible`), select your Distribution certificate, name it **"Nylon Impossible AppStore"**, and download it.
4. Repeat for the Share extension target (`com.superhighfives.Nylon-Impossible.Nylon-Share`), name it **"Nylon Share AppStore"**.

> The profile names matter — they must match the names referenced in `fastlane/Fastfile`.

**Base64-encode and add as secrets:**

```bash
base64 -i "Nylon_Impossible_AppStore.mobileprovision" | pbcopy
```

- `PROVISIONING_PROFILE_BASE64` — base64-encoded main app profile
- `SHARE_EXTENSION_PROFILE_BASE64` — base64-encoded Share extension profile

#### 4. Remaining iOS Secrets

- `APPLE_ID` — your Apple ID email (e.g. `you@example.com`), used by Fastlane
- `TEAM_ID` — your 10-character Apple Developer Team ID (found at [developer.apple.com/account](https://developer.apple.com/account) under Membership, or in any provisioning profile filename)
- `KEYCHAIN_PASSWORD` — any strong random string; CI uses it to create a temporary keychain just for the build (e.g. `openssl rand -base64 32`)

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
