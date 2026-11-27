# Smoke suite

Playwright specs that sign in and use the running web app: add, done, move,
edit, lists, drag, the keyboard and the server render, on two projects,
**wide** (1440×900) and **phone** (iPhone 15, touch). CI runs them as the `smoke` job in
`web-deploy.yml`, against each PR's preview, after `deploy-preview`.

## The account

Each run signs in as its own Clerk development-instance user,
`smoke-pr-<n>+clerk_test@nylonimpossible.com` (`<n>` is `SMOKE_PR`, or
`local`). `global-setup.ts` finds or creates it. Before every test,
`fixtures.ts` rewrites the user's rows with the demo set from
`@nylon-impossible/shared/seed-account`, the same set the marketing captures
use. `global-teardown.ts` deletes the rows and the Clerk user. Every preview
shares one preview D1, so nothing here touches another user's rows.

## Running it

Against a local `vite dev`, with the Clerk dev keys that `marketing-test.yml`
uses:

```sh
bun run --cwd src/web dev
BASE_URL=http://localhost:3000 \
  CLERK_PUBLISHABLE_KEY=pk_test_… CLERK_SECRET_KEY=sk_test_… \
  bun run --cwd src/web e2e
```

Against a preview, take the Web URL from the PR's "Preview Deployment"
comment. Seeding the preview D1 needs `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` as well:

```sh
BASE_URL=https://….workers.dev bun run --cwd src/web e2e
```

| Variable | What it does |
| --- | --- |
| `BASE_URL` | The web app under test. Required. |
| `API_URL` | The API's origin, so its 5xx responses fail a test too. |
| `SMOKE_PR` | Names the run's user. Defaults to `local`. |
| `SMOKE_D1` | `preview` or `local`. Defaults to `local` for localhost and `preview` otherwise. |

## Writing a spec

- Import `test` and `expect` from `./fixtures`, not `@playwright/test`. The
  fixture fails a test on an uncaught page error or a 5xx from the app.
- Ask for `board` to get a page that's signed in and seeded.
- Find things by role and label (`getByRole`, `getByLabel`). Fall back to the
  app's `data-*` hooks (`data-column`, `data-row-container`,
  `data-drop-gap`) only where no role pins the element.
- Put `tag` in any title you create, so an assertion never matches a leftover.
- To check that a write survived a reload, call `watchWrite(page, text)` before
  the action and pass its promise to `reload`. A write is a non-GET request to
  the app's server functions (`/_serverFn/…`) or the API's `/todos…` and
  `/lists…` routes; `/ws/ticket`, `/users/me`, `/feedback`, Clerk and Sentry
  don't count. Pass text the write carries (a title, a note) where you have
  some, so it waits for that write. A write that comes back 4xx or 5xx fails
  the test with its status.
