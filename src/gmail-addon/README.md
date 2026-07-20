# Nylon Gmail / Workspace Add-on

A Google Workspace Add-on that puts Nylon in Gmail's right-hand side panel:
quick-add, a list of open top-level todos you can tick, and an "Add to Nylon"
card that turns the open message into a todo through the existing AI
smart-create path.

It's built on the **HTTP-endpoint ("alternate runtime") model** — Google POSTs a
JSON event to endpoints on the API Worker and we return JSON card definitions.
There is no Apps Script project. All the code lives in `src/api`:

| Surface | Endpoint |
| --- | --- |
| Homepage card (panel open, no message) | `POST /gmail-addon/homepage` |
| Contextual card (message open) | `POST /gmail-addon/contextual` |
| Quick-add submit | `POST /gmail-addon/actions/quick-add` |
| Add-from-message submit | `POST /gmail-addon/actions/add-from-message` |
| Tick-to-complete | `POST /gmail-addon/actions/toggle` |

Each request carries a Google-signed ID token in `Authorization: Bearer` and is
verified by the `verifyGoogleIdToken` middleware (`src/api/src/lib/addon-auth.ts`)
before any handler runs. The connect flow lives in the web app at
`/connect/gmail-addon`.

## Scopes (kept light on purpose)

`deployment.json` requests only:

- `gmail.addons.execute` — run the add-on.
- `gmail.addons.current.message.metadata` — read the **current message's
  metadata** (subject/sender/permalink) from the event object.

It deliberately does **not** request the restricted `gmail.readonly` scope, so we
stay in "sensitive" scope territory (a materially lighter Google review) and
never read message bodies or call the Gmail API. No message content is persisted.

## One-time Google Cloud setup

1. **Create / pick a Google Cloud project** and note its project number.
2. **Enable the Google Workspace Add-ons API** and the Gmail API for the project
   (`console.cloud.google.com/apis/library`).
3. **Configure the OAuth consent screen** (Internal is fine for developer
   install). Add the two scopes above.
4. **Set the API config** (`config.js`/env) so the API Worker knows the audience
   and connect secret — see "Worker configuration" below.

## Deploying the add-on

The manifest is `deployment.json`. Create or update the deployment with the
Workspace Add-ons API (via `gcloud` or a REST call):

```sh
# Create (first time)
gcloud workspace-add-ons deployments create nylon \
  --deployment-file=deployment.json --project="$PROJECT"

# Update (after editing the manifest / card endpoints)
gcloud workspace-add-ons deployments replace nylon \
  --deployment-file=deployment.json --project="$PROJECT"

# Developer-install into your own Gmail (skips Marketplace review)
gcloud workspace-add-ons deployments install nylon --project="$PROJECT"
```

Open Gmail, reload, and the Nylon icon appears in the side-panel rail. Iterate on
the card JSON by editing the builders in `src/api/src/lib/addon-cards.ts` and
redeploying the Worker — no add-on redeploy is needed unless the trigger
endpoints or scopes change.

Ship **unlisted / developer-installed** first; a public Workspace Marketplace
listing (with its heavier review) can come later.

## Worker configuration

Set on the API Worker (`src/api/wrangler.jsonc` for public vars,
`wrangler secret put` for secrets):

| Name | Kind | Purpose |
| --- | --- | --- |
| `GMAIL_ADDON_AUDIENCE` | var | Allowed `aud` value(s) on the Google ID token. Comma-separate to allow several (e.g. per-endpoint audiences). Fails closed if unset. |
| `WEB_BASE_URL` | var | Base URL used to build the connect link (defaults to production). |
| `GMAIL_ADDON_STATE_SECRET` | **secret** | HMAC secret signing the connect-flow state. Must match the web Worker's secret. |

The **web Worker** also needs `GMAIL_ADDON_STATE_SECRET` (same value) to verify
the state when recording the link:

```sh
wrangler secret put GMAIL_ADDON_STATE_SECRET   # in src/api
wrangler secret put GMAIL_ADDON_STATE_SECRET   # in src/web (same value)
```

## Identity spike (resolve against a live deployment)

Two things can only be pinned down against a real dev deployment; both are
isolated so the rest of the code is unaffected:

1. **Which token/claim carries the end-user's Google email/sub.** The middleware
   verifies the ID token and reads `sub`/`email` from it; if a deployment carries
   the end-user identity elsewhere (e.g. the event object's user fields under a
   system token), only `resolveNylonUser`'s inputs change.
2. **The ID-token audience.** If Google sends the *endpoint URL* as the audience
   rather than one configured value, list every endpoint URL in
   `GMAIL_ADDON_AUDIENCE` (comma-separated) — no code change needed.

The card-response envelope in `addon-cards.ts` (`renderCard` / `updateCard`) is
the other live-verifiable surface; adjust it there in one place if the panel
rejects a response.
