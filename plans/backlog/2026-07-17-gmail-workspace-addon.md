# Gmail / Workspace Side-Panel Add-on

Nylon lives on web and iOS today. A lot of todos are born inside email — "reply
to this", "book the thing they mentioned", "sort DMV visit". The screenshot that
kicked this off is Google Tasks sitting in the Gmail right-hand rail, turning an
open message into a task without leaving the inbox. The question: can Nylon sit
there too?

Short answer: **yes, and it's a good fit.** This stub captures the research so a
future `ready/` spec can pick it up.

## What it would be

A **Google Workspace Add-on**. That's the official, supported mechanism behind
the Gmail/Calendar/Drive side-panel rail (the icon strip in the screenshot —
Tasks, Keep, Calendar all live there). One add-on can surface in multiple hosts,
but Gmail is the interesting one for a todo app: it's also the only host that
renders add-ons on mobile.

Two surfaces we'd care about:

- **Contextual (message open):** an "Add to Nylon" card that reads the open
  message's subject/sender/link and pre-fills a todo — feeding the existing AI
  smart-create path rather than a dumb title copy.
- **Homepage (no message):** a mini todo list in the side panel, mirroring the
  "My Tasks" panel in the screenshot — view, tick off, quick-add.

## Why it fits Nylon specifically

- **We can back it with our own stack, not Apps Script.** Workspace add-ons
  support an HTTP-endpoint runtime: Google POSTs to your URL, you return card
  JSON. That's a Hono route on the existing API Worker (`src/api`) — no second
  language, no Apps Script project to babysit. The card UI is declarative JSON,
  so no React either.
- **The Google auth relationship already exists.** `import-google-tasks.ts`
  already exchanges a **Clerk-held Google OAuth connection** for a Google access
  token via `clerkClient.users.getUserOauthAccessToken(userId, "google")`. Most
  Nylon users signed in through Google via Clerk, so we may be able to link the
  add-on user to a Nylon account off the Google identity instead of inventing a
  new login flow inside the panel.
- **There's prior art in-repo for pulling from Google.** The Google Tasks
  importer is a working example of talking to Google APIs with a user's token;
  the add-on is roughly the inverse (push from Gmail into Nylon).

## Open questions for the ready spec

- **Account linking inside the panel.** The add-on runs as a Google identity;
  Nylon's identity is Clerk. Best path is probably: match the add-on's Google
  email to the Clerk user's Google connection, fall back to a one-time
  "connect your Nylon account" OAuth handshake (third-party auth in the panel is
  a documented flow — a button to our authorization URL + refresh-token storage).
- **Verification / review cost.** Reading message content pulls in Gmail
  scopes, which triggers Google's OAuth verification (and possibly a CASA
  security assessment) before public listing. A minimal add-on that only reads
  the current message's metadata via add-on event objects — *not* the Gmail API
  — needs far lighter scopes. Worth scoping the MVP to avoid restricted scopes.
- **Real-time sync.** Web/iOS sync over Durable Object WebSockets. The panel is
  request/response card JSON with no persistent socket, so it'd read/write
  through the REST API and refresh on interaction rather than live-update. Fine
  for v1; just noting it's a different sync model.
- **Marketplace vs. unlisted.** Could ship unlisted (link-installed) first to
  skip the public review gauntlet, then pursue Workspace Marketplace listing.

## Rough MVP shape (not a commitment)

1. New HTTP-runtime add-on: a deployment manifest in Google Cloud pointing at a
   Hono route on `api.nylonimpossible.com`.
2. Homepage card: list a few open todos + a quick-add box that hits smart-create.
3. Contextual card: "Add to Nylon" on an open message, pre-filled from the
   message's subject and a deep link back to the thread.
4. Account linking off the existing Clerk↔Google connection, with a fallback
   connect flow.

## References

- [Google Workspace add-ons — overview](https://developers.google.com/workspace/add-ons/overview)
- [Card-based interfaces](https://developers.google.com/workspace/add-ons/concepts/card-interfaces)
- [Connect to a third-party service (OAuth)](https://developers.google.com/workspace/add-ons/guides/connect-third-party-service)
- [Building Workspace add-ons](https://developers.google.com/workspace/add-ons/how-tos/building-workspace-addons)
- In-repo prior art: `src/api/src/handlers/import-google-tasks.ts` (Clerk-held Google OAuth token exchange + Google API calls)
