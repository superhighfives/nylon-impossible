# Plan: Fix iOS URL Title Causing 400 Server Error

## Problem

When a user shares a URL from Safari (or another app) to Nylon Impossible via the iOS Share Extension, the app sets the task title to `"Check: <full URL>"`. For long URLs (e.g. Google Search result URLs), this title easily exceeds 500 characters.

When the iOS app syncs to the server via `POST /todos/sync`, the sync schema validates:

```typescript
title: z.string().min(1).max(500).optional()
```

A title longer than 500 characters fails this validation and the server returns a `400` error, which is displayed to the user as `"Server error (400): [...]"`.

## Root Cause

**`ShareSheetView.swift` line 25:**

```swift
_taskTitle = State(initialValue: isURL ? "Check: \(content)" : content)
```

`content` is `url.absoluteString` — the full URL. For a Google Search URL this can be 1000+ characters, making `"Check: <URL>"` far exceed the 500-character limit enforced by the server.

The server's `smart-create` endpoint handles this correctly via `createFallbackFromUrl()`, which produces `"Check google.com"` (domain only). The Share Extension does not apply equivalent logic.

## Fix

### 1. iOS — `ShareSheetView.swift` (primary fix)

Extract only the domain from the URL for the initial task title, mirroring what the server does in `createFallbackFromUrl()`:

```swift
// Before
_taskTitle = State(initialValue: isURL ? "Check: \(content)" : content)

// After
_taskTitle = State(initialValue: isURL ? Self.titleFromURL(content) : content)
```

Add a static helper to extract the domain:

```swift
private static func titleFromURL(_ urlString: String) -> String {
    if let url = URL(string: urlString),
       let host = url.host {
        let domain = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        return "Check \(domain)"
    }
    // Fallback: use raw string if URL parsing fails
    return urlString
}
```

This produces titles like `"Check google.com"` regardless of how long the full URL is, matching the server's `createFallbackFromUrl` behaviour. The full URL is still captured separately and passed to `createTaskWithURL`, so URL metadata fetching is unaffected.

### 2. Server — `sync.ts` (defence-in-depth)

Rather than rejecting a title that exceeds 500 characters, silently truncate it in the sync handler. This prevents the user-facing 400 error for any future case where a long title reaches the server.

Change the schema to remove the `max(500)` hard limit:

```typescript
// Before
title: z.string().min(1).max(500).optional(),

// After
title: z.string().min(1).optional(),
```

Then truncate the title when writing to the database (both for creates and updates), using the same `truncateTitle` helper already used in `smart-create.ts`:

```typescript
import { truncateTitle } from "../lib/url-helpers";

// On insert:
title: truncateTitle(change.title),

// On update:
title: change.title ? truncateTitle(change.title) : existing.title,
```

## Files to Change

| File | Change |
|------|--------|
| `src/ios/Nylon Impossible/Nylon Share/ShareSheetView.swift` | Replace full-URL title with domain-only title via `titleFromURL()` helper |
| `src/api/src/handlers/sync.ts` | Remove `.max(500)` from title schema; truncate title on insert/update |

## Testing

1. **Share Extension — long URL**: Share a Google Search URL from Safari. Confirm the pre-populated title is `"Check google.com"` (not the full URL). Save the task and confirm it syncs without a 400 error.
2. **Share Extension — short URL**: Share `https://example.com`. Confirm the title is `"Check example.com"` and syncs correctly.
3. **Share Extension — invalid URL**: Share plain text (not a URL). Confirm the title is the plain text and syncs correctly.
4. **Server truncation**: Craft a sync request with a title >500 chars. Confirm the server stores a truncated title rather than returning 400.
