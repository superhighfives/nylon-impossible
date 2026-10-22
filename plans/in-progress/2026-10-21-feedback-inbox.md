# Feedback inbox

## Problem

After the cohesive redesign and the Mac app, the next round of work is
feedback from actually using each app — on a phone, an iPad, a Mac and the
web. Writing it up later loses the moment and the screenshot. Each app needs
a quick way to flag something *where it happens*: a screenshot, a sentence,
done — and an issue appears somewhere it can be triaged.

## Decisions

- **Private inbox repo.** `superhighfives/nylon-impossible` is public, and a
  screenshot of a real board shows real todos. Feedback goes to the private
  [`superhighfives/nylon-feedback`](https://github.com/superhighfives/nylon-feedback)
  repo instead; anything worth doing publicly gets moved over by hand.
- **Images live in that repo.** The GitHub API has no upload endpoint for
  issue attachments, so the worker commits each image to
  `screenshots/YYYY/MM/<uuid>.<ext>` with the Contents API and embeds it as
  `https://github.com/<repo>/blob/main/<path>?raw=true`. That renders inline
  for anyone who can see the private repo and for no one else — no R2 bucket,
  no public URLs.
- **Admin only.** `POST /feedback` sits behind `authMiddleware` +
  `requireAdmin`. `GET /users/me` gains `isAdmin` so every client decides
  whether to show the button from one place.
- **All four platforms in one change**: API, web, iOS/iPadOS, Mac.

## API

`POST /feedback` (auth + admin role)

```jsonc
{
  "description": "The tick on done rows jumps ~2px",   // 1–5000 chars
  "images": [                                           // 0–4
    { "contentType": "image/png", "data": "<base64>" }  // png | jpeg, ≤ 5 MB decoded
  ],
  "context": {
    "platform": "ios",        // "ios" | "ipados" | "mac" | "web" (required)
    "appVersion": "1.4.0",    // everything below optional, ≤ 200 chars each
    "build": "212",
    "commit": "499394c",
    "os": "iOS 26.1",
    "device": "iPhone17,1",
    "screen": "today",        // route / screen name
    "colorScheme": "dark",    // "light" | "dark"
    "viewport": "390×844",
    "locale": "en-AU",
    "timezone": "Australia/Melbourne"
  }
}
```

→ `201 { "issueNumber": 12, "issueUrl": "https://github.com/…/issues/12" }`

- Title: `[iOS] ` + the description's first line, cut to 80 characters.
- Labels: `feedback` + `platform:<platform>` (created in the repo already).
- Body: the description, the screenshots, then a context table and the
  reporter's user id.
- Errors (`API_ERRORS`): `feedback_unavailable` (503) when
  `GITHUB_FEEDBACK_TOKEN` isn't set, `feedback_failed` (502) when GitHub
  rejects a call; validation goes through `apiValidationError`.

Config:

- `FEEDBACK_REPO` — plain var in `wrangler.jsonc` (top level and `previews`):
  `superhighfives/nylon-feedback`.
- `GITHUB_FEEDBACK_TOKEN` — secret (`wrangler secret put`). A **fine-grained
  PAT scoped to `nylon-feedback` only**, with Contents: read/write, Issues:
  read/write, Metadata: read. That's the "Nylon can read the private repo"
  permission — and nothing else. Previews don't get it, so feedback from a
  preview answers `feedback_unavailable`.

## Clients

Every client reads `isAdmin` from `/users/me` and shows nothing otherwise.
Each one sends the context it knows automatically, so the only typing is the
description.

### Web

- "Send feedback" in the account sheet (phone) and the sidebar account area
  (wide), plus `f` on the wide board (listed in the `?` overlay for admins).
- A dialog with a textarea, an image tray, and three ways in: **paste**
  (⌘V anywhere in the dialog), **drag and drop**, and a file picker.
- Context: platform `web`, route, colour scheme, viewport, user agent (in
  `os`), `VITE_COMMIT_SHA` — which `vite.config.ts` fills from `GITHUB_SHA`
  in CI.

### iOS / iPadOS

- **Take a normal screenshot.** The app listens for
  `UIApplication.userDidTakeScreenshotNotification`, snapshots its own key
  window (the system screenshot itself isn't readable without Photos access)
  and shows a "Send as feedback" pill for a few seconds. Tapping it opens the
  feedback sheet with that image attached.
- "Send feedback" in the account sheet too, with a Photos picker and paste
  for screenshots taken earlier (e.g. after Markup).
- iPad with a hardware keyboard also gets Help → Send Feedback… (⇧⌘F).
- Context: `ios` or `ipados`, version/build, OS, device model, screen route,
  colour scheme. No commit — the bundle doesn't carry one.

### Mac

- Help → **Send Feedback…** (⇧⌘F — ⌘⌥F is Find and Replace). Also in the
  sidebar's account menu. Snapshots the main window's content view
  (no Screen Recording permission needed) and opens the same sheet; ⌘V and
  drag-and-drop add more images.
- Context: `mac`, version/build, macOS version, model, screen route.

## Not in this change

- A "Nylon Feedback" share-extension target. It would need its own bundle ID
  and provisioning profiles on both platforms; the in-app screenshot pill and
  the Photos picker cover the same ground.
- Routines that triage the inbox.

## Acceptance

- Non-admins get 403 from `/feedback` and never see the button.
- An admin filing from each platform gets an issue in `nylon-feedback` with
  the right labels, inline screenshots and a filled context table.
- `bun run typecheck`, `bun run lint`, `bun run api:test`, web tests and the
  iOS + macOS builds pass.
