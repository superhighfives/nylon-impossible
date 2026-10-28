---
title: URL Fetching Optimistic UI
status: Complete
created: 2026-03-13
updated: 2026-10-27
---

## Overview

URL metadata (`2026-03-08-url-fetching.md`) was only visible after opening a
todo. This change put compact link cards in the main list on web and iOS.
They show the hostname while the page title and favicon are still being
fetched, and fall back gracefully if the fetch never finishes. Shipped in #31
(`0ed38ad`, `21cbd41`, 2026-03-13).

The cards themselves are gone. The web `UrlCardCompact` was replaced in #227
(URL-only todos show the page title with the URL as a subtitle), and the iOS
`UrlRowCompact` was dropped in the cohesive redesign's iOS rebuild (#398).
Sync still includes each todo's URLs, `url-metadata.ts` still times out
fetches, and `FlowLayout.swift` is still in use.

## Architecture

### API
- Sync endpoint now includes URLs for each todo
- Added fetch timeout to `url-metadata.ts`
- URL validation with `cleanUrl()` helper to strip trailing punctuation and validate

### Web
- New `UrlCardCompact` component with stale pending detection
- URL cards integrated into `TodoList.tsx`

### iOS
- New `UrlRowCompact` and `FlowLayout` components
- `SyncService` stores URLs in memory from sync response
- `TodoItemRow` displays URL cards
- `TodoEditSheet` UrlRow also has stale pending detection

### Files changed

| Area | Files |
|------|-------|
| API | `sync.ts`, `smart-create.ts`, `url-metadata.ts`, `db.ts` |
| Web | `UrlCardCompact.tsx`, `TodoList.tsx`, `ui/index.tsx` |
| iOS | `UrlRowCompact.swift`, `FlowLayout.swift`, `TodoItemRow.swift`, `TodoEditSheet.swift`, `SyncService.swift`, `APIService.swift` |
| Tests | `SyncServiceTests.swift`, `Header.test.tsx`, `LandingPage.test.tsx` |

### Notes

- "Stale pending" is a client-side check: a URL still `pending` 30 seconds
  after it was created (`STALE_PENDING_THRESHOLD_MS`) is drawn as failed.
  The server doesn't change its status.
- The 10-second limit is `AbortSignal.timeout(FETCH_TIMEOUT_MS)` on the
  metadata fetch.
- The `cleanUrl()` helper was added to `smart-create.ts` during review
  (`21cbd41`). Three days later
  `2026-03-16-smart-create-url-handling-and-tests.md` added a similar
  `cleanUrlString` in `src/api/src/lib/url-helpers.ts`, and that one is
  still there. The handler's own copy was removed when smart create was
  refactored for post-creation AI processing (#94).
- On iOS, keeping URLs in memory in `SyncService` was a stopgap. They moved
  into a SwiftData `TodoUrl` model with the optimistic UI parity work (#93).

Show compact URL cards in the main todo list view with loading states while metadata is being fetched.

## Result

- URL cards appear in both main list (compact) and expanded view (detailed)
- Compact cards show favicon + title (or hostname while loading)
- Pending URLs older than 30 seconds treated as failed to avoid eternal "Fetching..." state
- 10-second timeout on URL metadata fetch prevents hanging on slow servers

## PR

https://github.com/superhighfives/nylon-impossible/pull/31
