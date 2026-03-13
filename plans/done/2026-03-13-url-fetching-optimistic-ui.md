# URL Fetching Optimistic UI

Show compact URL cards in the main todo list view with loading states while metadata is being fetched.

## Result

- URL cards appear in both main list (compact) and expanded view (detailed)
- Compact cards show favicon + title (or hostname while loading)
- Pending URLs older than 30 seconds treated as failed to avoid eternal "Fetching..." state
- 10-second timeout on URL metadata fetch prevents hanging on slow servers

## Implementation

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

## Files Changed

| Area | Files |
|------|-------|
| API | `sync.ts`, `smart-create.ts`, `url-metadata.ts`, `db.ts` |
| Web | `UrlCardCompact.tsx`, `TodoList.tsx`, `ui/index.tsx` |
| iOS | `UrlRowCompact.swift`, `FlowLayout.swift`, `TodoItemRow.swift`, `TodoEditSheet.swift`, `SyncService.swift`, `APIService.swift` |
| Tests | `SyncServiceTests.swift`, `Header.test.tsx`, `LandingPage.test.tsx` |

## PR

https://github.com/superhighfives/nylon-impossible/pull/31
