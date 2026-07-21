---
title: Gmail / Workspace Side-Panel Add-on
status: Ready
created: 2026-07-17
updated: 2026-07-17
---

# Gmail / Workspace Side-Panel Add-on

**Date**: 2026-07-17
**Status**: Ready

## Problem

A lot of todos are born inside email — "reply to this", "book the thing they
mentioned", "sort DMV visit". Today the only way to get one into Nylon from Gmail
is to copy text out and paste it into the web or iOS app. The reference for this
work is the Google Tasks panel that lives in Gmail's right-hand rail: open a
message, hit a button, and it becomes a task without leaving the inbox.

We want Nylon to live in that same rail — view a few open todos, quick-add, and
turn the open message into a Nylon todo (through the existing AI smart-create
path, not a dumb title copy).

## Solution

Ship a **Google Workspace Add-on** for Gmail, built on the **HTTP-endpoint
("alternate runtime") model** rather than Apps Script. Google POSTs a JSON event
object to our endpoints and we return JSON card definitions; the card UI is
declarative, so this is server work on the existing API Worker (Hono on
Cloudflare) with no second language and no React.

The add-on is deployed via a manifest registered in a Google Cloud project that
points its triggers at HTTPS endpoints on `api.nylonimpossible.com`.

Two surfaces in v1, both Gmail-only:

- **Homepage card** (panel open, no message): a short list of the user's open
  top-level todos, each tickable, plus a quick-add box.
- **Contextual card** (message open): an "Add to Nylon" card pre-filled from the
  open message's subject, with the thread's permalink attached as the todo URL.

### Why this fits Nylon specifically

- **Our own stack backs it.** The HTTP-endpoint runtime lets us answer Google's
  POSTs from a new Hono route group on `src/api`. Cards are JSON, built by a
  small helper module — no Apps Script project to maintain.
- **The Google auth relationship already exists.** `import-google-tasks.ts`
  already exchanges a Clerk-held Google OAuth connection for a token via
  `clerkClient(env).users.getUserOauthAccessToken(userId, "google")`. Most users
  signed in through Google via Clerk, so we can map the add-on's Google identity
  to a Nylon account off that connection instead of inventing a new login.
- **Prior art in-repo.** The Google Tasks importer is a working example of
  talking to Google with a user token; this add-on is roughly its inverse (push
  from Gmail into Nylon).

## Architecture

### Request flow

```
Gmail panel ──POST event JSON──▶ api.nylonimpossible.com/gmail-addon/*
                                        │
                     verifyGoogleIdToken (Google-signed ID token)
                                        │
                     resolveNylonUser (Google identity → Clerk userId)
                             │                        │
                       linked?                    not linked?
                             │                        │
                 reuse smart-create /        return "Connect Nylon"
                 list / update core          auth card (link to web)
                             │
                 return updated card JSON
                             │
                 notifySync → web/iOS clients update live
```

### Authenticating the request (that it's really Google)

Requests from Google carry a Google-signed **ID token** in the
`Authorization: Bearer` header. A new middleware `verifyGoogleIdToken` verifies:

- signature against Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`),
- `iss` is `https://accounts.google.com` (or `accounts.google.com`),
- `aud` equals our configured **target audience** (the add-on endpoint URL),
  stored in the `GMAIL_ADDON_AUDIENCE` var — this is what stops a token minted
  for another service being replayed at ours.

This is a separate middleware from `authMiddleware` — the same pattern the Clerk
webhook route already uses (`app.post("/webhooks/clerk", clerkWebhook)` is
deliberately *not* wrapped in `authMiddleware`; its Svix signature is the auth).
The `/gmail-addon/*` group is mounted with `verifyGoogleIdToken` instead.

Cloudflare Workers expose Web Crypto, so RS256 verification can be done with
`crypto.subtle` + a cached JWKS fetch, or with `jose` for ergonomics. `jose` is
**not** currently a direct dependency of `src/api` — adding it is the simplest
path; note that `@clerk/backend` already pulls it in transitively.

### Mapping the Gmail user to a Nylon account (the crux)

The panel runs as a Google identity; Nylon's identity is Clerk. We need a durable
mapping. New table **`gmail_addon_links`**: `{ googleSub (pk), clerkUserId, email,
createdAt }`.

`resolveNylonUser(googleClaims)` resolves in this order:

1. **Existing link** — look up `gmail_addon_links` by `googleSub`. Hit → done.
2. **Email fast-path auto-link** — if no link, take the verified email from the
   Google identity and ask Clerk for a user whose Google OAuth connection matches
   that email (`clerkClient(env).users.getUserList({ emailAddress: [email] })`,
   then confirm a `google` external account). Match → insert the link row and
   proceed. This makes the common "signed up with the same Google account" case
   zero-friction.
3. **No match → connect card.** Return an authorization card with a button to
   `https://www.nylonimpossible.com/connect/gmail-addon?state=<signed>`. The user
   lands there already (or gets) authenticated via Clerk, we record
   `{ googleSub, clerkUserId }`, and they reload the card in Gmail.

> **Implementation spike (resolve first):** the exact place the *end-user's*
> Google identity (email/sub) is carried — a user ID token vs. a system ID token
> plus the event object's user fields — depends on the deployment's token
> configuration and requested scopes. Google's guidance is to "guard the
> destination with Google Sign-in and read the user ID from the identity token."
> Nail down which token/claim carries the end-user email against a real dev
> deployment before building `resolveNylonUser` on top of it. Everything
> downstream of "we have a verified Google email/sub" is unaffected by how the
> spike resolves.

### Reusing existing API logic (don't duplicate)

The card actions must go through the *same* code paths as the REST API so AI
enrichment, URL extraction, positioning, and WebSocket sync stay identical:

- **Quick-add / add-from-message** → extract the core of `smart-create.ts` into a
  reusable `createSmartTodo(db, env, userId, text, { aiEnabled, plan })` in a new
  `src/api/src/lib/create-todo.ts`. `smartCreate` (the Hono handler) becomes a
  thin wrapper that reads auth from context and calls it; the add-on action calls
  the same function with the resolved `userId`. This keeps `notifySync`, URL
  handling, and Pro/AI gating in one place.
- **List open todos** → extract the open-top-level-todos query used by
  `handlers/todos.ts` `listTodos` into a shared `listOpenTodos(db, userId)` so the
  homepage card and the REST list can't drift.
- **Tick to complete** → reuse the update path in `handlers/todos.ts` `updateTodo`
  (same extract-core-then-wrap approach) so completion, `completedAt`, and sync
  behave exactly as on web/iOS.

### Sync model (call out the difference)

Web and iOS sync live over Durable Object WebSockets. The panel is
request/response card JSON with no persistent socket. So: card actions **write**
through the shared helpers above (which call `notifySync`, so open web/iOS
clients update live), and the panel itself refreshes by returning a fresh card on
each action rather than receiving pushes. Good enough for v1 — just a different
model, not a blocker.

## Scopes & review cost (keep the MVP light)

Reading arbitrary message content pulls in **restricted** Gmail scopes
(`gmail.readonly`), which triggers Google's heavyweight OAuth verification plus a
CASA security assessment. v1 deliberately avoids that:

- Request only the **current-message metadata** add-on scope
  (`https://www.googleapis.com/auth/gmail.addons.current.message.metadata`) plus
  the add-on execution scope. Subject + sender + thread permalink come from the
  contextual event object — we do **not** call the Gmail API and do **not** read
  bodies.
- Do not persist any message content; use it transiently to pre-fill the card.

This keeps us in "sensitive" (not "restricted") scope territory, a materially
lighter review. Ship **unlisted / developer-installed** first to skip public
Marketplace review entirely while validating; pursue a Marketplace listing later.

## Implementation

### Files to create

- `src/api/src/handlers/gmail-addon/homepage.ts` — build the homepage card (open
  todos list + quick-add box).
- `src/api/src/handlers/gmail-addon/contextual.ts` — build the "Add to Nylon" card
  from the open-message event object.
- `src/api/src/handlers/gmail-addon/actions.ts` — action callbacks: submit
  quick-add, add-from-message, toggle-complete; each returns a refreshed card.
- `src/api/src/lib/addon-auth.ts` — `verifyGoogleIdToken` middleware +
  `resolveNylonUser(googleClaims)` (link lookup → email auto-link → connect card).
- `src/api/src/lib/addon-cards.ts` — pure JSON card builders (homepage,
  contextual, auth-required/connect), no I/O.
- `src/api/src/lib/create-todo.ts` — extracted `createSmartTodo(...)` core (see
  reuse section).
- `src/api/migrations/0019_add_gmail_addon_links.sql` — generated via
  `pnpm db:generate` after the schema change below.
- `src/gmail-addon/deployment.json` — the add-on deployment manifest (triggers →
  endpoint URLs, OAuth scopes, connect/auth config).
- `src/gmail-addon/README.md` — Google Cloud setup runbook (project, enable
  Workspace Add-ons API, OAuth consent screen, create/update the deployment,
  developer install).
- `src/web/src/routes/connect/gmail-addon.tsx` — authenticated TanStack route that
  records the `{ googleSub, clerkUserId }` link and shows "connected, return to
  Gmail".

### Files to modify

- `src/shared/src/schema.ts` — add the `gmailAddonLinks` `sqliteTable`
  (`googleSub` pk, `clerkUserId`, `email`, `createdAt`). This is the canonical
  Drizzle schema; `src/web/src/lib/schema.ts` re-exports it.
- `src/api/src/index.ts` — mount `app.use("/gmail-addon/*", verifyGoogleIdToken)`
  and register the homepage/contextual/action routes. (Browser CORS is
  irrelevant here — Google's calls are server-to-server — so no change to the
  `ALLOWED_ORIGINS` block is needed.)
- `src/api/src/handlers/smart-create.ts` — reduce to a thin wrapper over
  `createSmartTodo`.
- `src/api/src/handlers/todos.ts` — extract `listOpenTodos` and the update-core so
  the add-on and REST share them.
- `src/api/wrangler.jsonc` — add the `GMAIL_ADDON_AUDIENCE` var (public, not a
  secret). If any Google client secret is needed for the connect flow, add it via
  `wrangler secret`, not the committed config.
- `src/api/package.json` — add `jose` (unless we go pure Web Crypto).

### Rough order of work

1. **Identity spike** — stand up a throwaway dev deployment; confirm exactly which
   token/claim carries the end-user Google email/sub. Blocks `resolveNylonUser`.
2. **Schema + migration** — `gmailAddonLinks` table, generate `0019_*`.
3. **Auth middleware** — `verifyGoogleIdToken` (JWKS + `aud`/`iss` checks) with
   unit tests (valid, wrong-audience, expired, bad-signature).
4. **Reuse refactors** — extract `createSmartTodo`, `listOpenTodos`, update-core;
   keep existing REST handlers green (existing tests must still pass).
5. **Card builders + handlers** — homepage, contextual, actions, connect card.
6. **Connect web route** — record the link, land the user back in Gmail.
7. **Manifest + Google Cloud runbook** — deploy, developer-install, iterate on the
   card JSON against the live panel.
8. **Docs** — short section in the API README on the add-on endpoints and the
   Google Cloud deployment.

## Acceptance criteria

- [ ] A Google Cloud add-on deployment installs into a test Gmail account and
      shows a Nylon icon in the side-panel rail.
- [ ] `verifyGoogleIdToken` accepts genuine Google-signed requests and rejects
      wrong-audience, expired, and bad-signature tokens (unit-tested).
- [ ] A Gmail user whose Google account matches their Clerk Google connection is
      auto-linked on first use with no extra sign-in step.
- [ ] A Gmail user with no matching Nylon account sees a "Connect Nylon" card,
      completes the web connect flow, returns to Gmail, and is then linked.
- [ ] The homepage card lists the user's open top-level todos and a quick-add box;
      quick-add creates a todo through the same path as `POST /todos/smart`
      (AI/Pro gating and URL handling identical), and it appears live in an open
      web/iOS client.
- [ ] With a message open, "Add to Nylon" creates a todo pre-filled from the
      subject with the thread permalink attached as its URL.
- [ ] Ticking a todo in the panel completes it and reflects on web/iOS.
- [ ] The add-on requests only current-message-metadata (not restricted
      `gmail.readonly`) scopes, and no message content is persisted.

## Dependencies

- **External / time-gated:** a Google Cloud project with the Workspace Add-ons API
  enabled, an OAuth consent screen, and (for anything beyond developer install)
  Google OAuth verification. Start unlisted / developer-installed to defer this.
- **New package:** `jose` in `src/api` (or a Web Crypto implementation).
- **Builds on:** the existing Clerk↔Google connection used by
  `src/api/src/handlers/import-google-tasks.ts`, and the `smart-create` path being
  extracted into a shared core.
- **Related:** `2026-03-21-repeating-todos.md` (a future panel version could set a
  repeat schedule, but that's out of scope here).

## Out of scope (v1 deferred)

- Gmail API deep reads (full body/attachment parsing) and the restricted scopes
  they require.
- Other hosts (Calendar, Drive, Docs) — the add-on can extend to them later.
- Public Workspace Marketplace listing (ship unlisted/dev-installed first).
- Real-time push into the panel (it stays request/response).
- In-panel priority, recurrence, subtasks, or list pickers — keep the card minimal.

## References

- [Build a Google Workspace add-on using HTTP endpoints (alternate runtimes)](https://developers.google.com/workspace/add-ons/guides/alternate-runtimes)
- [Card-based interfaces](https://developers.google.com/workspace/add-ons/concepts/card-interfaces)
- [Manifests for Google Workspace add-ons](https://developers.google.com/workspace/add-ons/concepts/workspace-manifests)
- [Connect to a third-party service (OAuth)](https://developers.google.com/workspace/add-ons/guides/connect-third-party-service)
- [projects.deployments REST resource](https://developers.google.com/workspace/add-ons/reference/rest/v1/projects.deployments)
- In-repo prior art: `src/api/src/handlers/import-google-tasks.ts`,
  `src/api/src/handlers/smart-create.ts`, `src/api/src/lib/auth.ts`.
