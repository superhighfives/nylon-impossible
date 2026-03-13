# URL Fetching Optimistic UI

**Date:** 2026-03-13
**Status:** Ready

## Overview

Add optimistic UI for URL fetching - show compact URL cards in the main todo list view with loading states while metadata is being fetched.

## Problem

When a URL is added to a todo:
1. No visual feedback while metadata is being fetched
2. URLs only appear in the expanded view, not the main list

## Design Decisions

- URL cards appear in **both** main list (compact) and expanded view (detailed)
- Compact cards show **favicon + title only**
- Loading state shows **hostname + spinner**
- Failed state shows **hostname only** (no error indicator)
- Multiple URLs **stack vertically**

## Architecture

No backend changes needed. The existing flow works correctly:
1. Create todo with URL → AI extracts URLs
2. Insert `todoUrls` records with `fetchStatus: "pending"`
3. Return response immediately (optimistic)
4. Fetch metadata in background via `waitUntil`
5. WebSocket broadcasts sync notification
6. Client refetches todos → URLs update with metadata

The `getTodos` response already includes URLs via the join query.

## Implementation

### Task 1: Create UrlCardCompact component

**File:** `src/web/src/components/ui/UrlCardCompact.tsx`

```tsx
import { Loader } from "./loader";
import type { SerializedTodoUrl } from "@/types/database";

interface UrlCardCompactProps {
  url: SerializedTodoUrl;
}

export function UrlCardCompact({ url }: UrlCardCompactProps) {
  const isPending = url.fetchStatus === "pending";
  const isFailed = url.fetchStatus === "failed";

  // Extract hostname for pending/failed states
  let hostname: string;
  try {
    hostname = new URL(url.url).hostname;
  } catch {
    hostname = url.url;
  }

  // Use fetched title, or fall back to hostname
  const displayTitle = isPending || isFailed
    ? hostname
    : (url.title ?? url.siteName ?? hostname);

  // Favicon: use fetched or Google's favicon service
  const favicon = url.favicon
    ?? `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-2 py-1 rounded bg-gray-ui hover:bg-gray-ui-hover transition-colors group max-w-full"
    >
      {isPending ? (
        <Loader size="sm" className="w-4 h-4 shrink-0" />
      ) : (
        <img
          src={favicon}
          alt=""
          className="w-4 h-4 shrink-0"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <span className="text-sm text-gray-normal truncate group-hover:underline">
        {displayTitle}
      </span>
      {isPending && (
        <span className="text-xs text-gray-dim shrink-0">Fetching...</span>
      )}
    </a>
  );
}
```

**Verify:** `pnpm web:typecheck`

---

### Task 2: Export from UI barrel

**File:** `src/web/src/components/ui/index.tsx`

Add export:
```tsx
export { UrlCardCompact } from "./UrlCardCompact";
```

---

### Task 3: Integrate into TodoList

**File:** `src/web/src/components/TodoList.tsx`

Import at top:
```tsx
import { UrlCardCompact } from "./ui";
```

In `TodoItemContent`, add URL cards below the title paragraph and before `<TodoIndicators>`:

```tsx
<div className="flex-1 min-w-0">
  <p
    className={`text-sm leading-snug ${
      todo.completed ? "line-through text-gray-dim" : "text-gray-normal"
    }`}
  >
    {todo.title}
  </p>
  {/* Compact URL cards */}
  {todo.urls && todo.urls.length > 0 && (
    <div className="flex flex-col gap-1 mt-1.5">
      {todo.urls.map((url) => (
        <UrlCardCompact key={url.id} url={url} />
      ))}
    </div>
  )}
  <TodoIndicators todo={todo} />
</div>
```

**Verify:** `pnpm web:typecheck && pnpm web:check`

---

### Task 4: Manual testing

1. Start dev server: `pnpm dev`
2. Create todo with URL: "Read https://news.ycombinator.com"
3. Verify compact card appears immediately with spinner + hostname
4. Wait for fetch → card updates with "Hacker News" title
5. Expand todo → verify detailed card still shows
6. Create todo with multiple URLs: "Check https://google.com and https://github.com"
7. Verify both cards stack vertically
8. Test invalid URL to verify failed state shows hostname only

---

## Files Changed

| File | Change |
|------|--------|
| `src/web/src/components/ui/UrlCardCompact.tsx` | New - compact URL card component |
| `src/web/src/components/ui/index.tsx` | Export new component |
| `src/web/src/components/TodoList.tsx` | Add URL cards to main list view |

## Out of Scope

- Removing URL from todo title (separate feature)
- URL card in drag overlay (minor polish)
- iOS changes (iOS has its own URL display)
