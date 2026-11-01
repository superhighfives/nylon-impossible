---
name: marketing-screenshots
description: How nylon-impossible's marketing screenshot pipeline works and the rules that keep it from failing deploys. Use when touching src/marketing/ (generate.ts, seed.ts, manifest.json, audit.ts, simulator.ts), marketing.yml, the landing-page or App Store screenshots, the iOS/web parity sheet (--parity), the -NylonScreen debug routes, or when a marketing run flakes.
---

# Marketing screenshots

`marketing.yml` regenerates the landing-page screenshots on
superhighfives.com. It used to be a job inside `web-deploy.yml`, which meant
its flakes (Vite optimizer races, Clerk sign-in timeouts, `simctl launch` on a
wedged simulator) reported the *deploy* as failed — for a stretch, every red
`web-deploy` run was this job and `deploy-production` was green in all of them.
It now runs on `workflow_run` after a successful deploy, with its own status.

Two rules keep it that way, and both are easy to undo by accident:

- **Capture is best-effort.** `capturePhase` in `generate.ts` catches a failed
  capture and reuses the screenshot the workflow restored from cache, so the
  composite matches what's published and the publish step no-ops. Don't
  "fix" a flake by adding another retry — that's been tried four times and a
  new failure mode showed up each time. A run only fails when there's nothing
  to fall back to. `capture-status.json` records `fresh`/`cached`/`skipped`
  per asset; anything reused gets a `::warning::`.
- **Don't put it back in the deploy pipeline.** A job that calls a reusable
  workflow can't be given `continue-on-error`, so coupling them is all-or-
  nothing.

The iOS screenshots are cached against `hashFiles('src/ios/**', …)`, so a
web-only deploy skips the Xcode build and simulator entirely — that's most of
the runtime and nearly all of the flakiness. Only a fully fresh iOS set (every
`ios-*` entry in `capture-status.json`) is written back to that cache; caching
a reused one would pin stale screenshots to a revision they don't belong to.
To regenerate by hand, dispatch the workflow with `force_ios` (it also runs
`strict` by default, so a fallback fails rather than passing quietly).

## What gets captured

What gets captured is listed in `src/marketing/manifest.json`. Its one
`timeZone` pins the browser (`timezoneId`), the simulators
(`SIMCTL_CHILD_TZ` on launch) and the seeded user, so every shot shows the
same weekday and date.

- **Web** signs in with Clerk's testing helpers and shoots desktop (1440×900)
  and phone (390×844) in light and dark. `generate.ts` applies the local D1
  migrations and writes the demo data (`seed.ts`, which mirrors the iOS
  sample data) itself, inside the best-effort web phase — the seed needs the
  capture account's Clerk id, so there's no separate workflow step.
- **iOS** needs no account. It launches the DEBUG build with
  `-NylonScreen <route>` (plus `-NylonDark`, `-NylonLandscape`), which skips
  sign-in and draws in-memory sample data, on simulators the script creates
  for itself (6.9" iPhone, 13" iPad). iPhone and iPad are separate capture
  phases, so one flaking doesn't discard the other.
- `--web` writes the composites (browser + iPhone, and iPad + iPhone), a raw
  App Store set in `output/app-store/` (uploaded as a workflow artifact;
  App Store Connect upload is manual), and WebP shots for the web landing page
  in `output/landing/` (copy into `src/web/public/images/landing/`).
- `--parity` (never part of `--all`) captures `manifest.parity`'s screens on
  iOS and web at the same logical size and writes
  `output/parity/parity-{light,dark}.png`, each screen an "iOS | Web" pair.
  It uses simulators of its own ("Nylon Parity …"), is uploaded from
  `marketing.yml` as the `parity-sheet` artifact, and is never published.

## Audit

`audit.ts` runs axe and the layout checks (row movement on done, 44px
targets, focus, Escape, 200% zoom, reduced motion) against a running,
seeded dev server: `MARKETING_WEB_URL=http://127.0.0.1:<port> npx tsx
audit.ts`.
