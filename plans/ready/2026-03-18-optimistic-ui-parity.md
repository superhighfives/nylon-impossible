# Optimistic UI Parity

**Date:** 2026-03-18
**Status:** Ready

## Problem

Web and iOS use different optimistic UI strategies — snapshot-and-rollback on web vs
offline-first on iOS. Both strategies are appropriate for their platforms. The goal is not
architectural convergence but closing four specific UX gaps where one platform is meaningfully
worse than the other.

## Changes

### 1. Web: Optimistic create

`useCreateTodo` in `src/web/src/hooks/useTodos.ts` has no `onMutate` — the list doesn't update
until the server responds. This is the only mutation without optimistic behaviour, and it causes
a noticeable lag compared to iOS.

Add `onMutate`/`onError`/`onSettled` following the same pattern as `useUpdateTodo` and
`useDeleteTodo`. Replace `onSuccess` with `onSettled` (invalidation should run on both success
and error):

```ts
export function useCreateTodo() {
  const queryClient = useQueryClient();
  const { notifyChanged } = useWebSocketSync();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (input: CreateTodoInput) => createTodo({ data: input }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: TODOS_QUERY_KEY });
      const previousTodos = queryClient.getQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY);

      const optimisticTodo: TodoWithUrls = {
        id: `temp-${crypto.randomUUID()}`,
        userId: userId ?? '',
        title: input.title,
        description: input.description ?? null,
        completed: false,
        position: 'a0',          // placeholder — replaced when onSettled invalidates
        dueDate: input.dueDate?.toISOString() ?? null,
        priority: input.priority ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        urls: [],
      };

      queryClient.setQueryData<TodoWithUrls[]>(TODOS_QUERY_KEY, [
        optimisticTodo,
        ...(previousTodos ?? []),
      ]);

      return { previousTodos };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(TODOS_QUERY_KEY, context.previousTodos);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
      notifyChanged();
    },
  });
}
```

`useAuth` is already imported at the top of the file.

### 2. Web: Offline banner

When the browser goes offline, TanStack Query's default `networkMode: 'online'` already pauses
in-flight and queued mutations — they don't get lost. What's missing is any user-visible signal.

Create `src/web/src/components/OfflineBanner.tsx`:

```tsx
import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div role="status" aria-live="polite" className="...">
      You're offline — changes will sync when you reconnect.
    </div>
  );
}
```

Style it as a slim, full-width bar (similar to `DevEnvironmentIndicator`). Add it to
`src/web/src/routes/__root.tsx` directly after `<Header />` in `RootDocument`.

### 3. iOS: Per-item unsynced indicator

The global sync state is already shown in `HeaderView` via `SyncState`. What's missing is a
per-item signal when `todo.isSynced == false` — users can't tell which items are pending after
a sync error.

In `TodoItemRow.swift`, add a small dot at the trailing edge of the title row. The dot appears
whenever `isSynced == false` (briefly during normal sync, persistently on error):

```swift
// Inside the title HStack, after Text(todo.title):
Spacer()
if !todo.isSynced {
    Circle()
        .fill(Color.appSubtle)
        .frame(width: 6, height: 6)
}
```

No changes to `TodoItemRow`'s public interface are needed for this section — the dot is added purely inside the existing view body.

### 4. iOS: Persist URL metadata to SwiftData

URL metadata is currently stored in `SyncService.urlsByTodoId: [String: [APITodoUrl]]` — an
in-memory dict that's lost on app restart. URLs should live in SwiftData alongside the todo.

#### a) New model — `Models/TodoUrl.swift`

```swift
@Model
final class TodoUrl {
    var id: String
    var url: String
    var title: String?
    var itemDescription: String?
    var siteName: String?
    var favicon: String?
    var position: String
    var fetchStatus: String      // "pending" | "fetched" | "failed"
    var fetchedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    // Inverse relationship — required so a standalone TodoUrl can navigate to its parent
    // without needing a redundant todoId string. SwiftData uses this to maintain referential
    // integrity; `todo` is nil only transiently (between insert and the relationship being set).
    @Relationship(inverse: \TodoItem.urls) var todo: TodoItem?

    init(from api: APITodoUrl) {
        id = api.id
        url = api.url
        title = api.title
        itemDescription = api.description
        siteName = api.siteName
        favicon = api.favicon
        position = api.position
        fetchStatus = api.fetchStatus.rawValue
        fetchedAt = api.fetchedAt
        createdAt = api.createdAt
        updatedAt = api.updatedAt
    }
}
```

`todoId` is omitted — the parent `TodoItem` is always reachable via the inverse SwiftData
relationship (`todoUrl.todo`), so storing a redundant string copy would risk the two falling
out of sync. The `@Relationship(inverse:)` annotation on `TodoUrl.todo` paired with
`@Relationship(deleteRule: .cascade) var urls: [TodoUrl]?` on `TodoItem` (step b) gives
SwiftData full bidirectional navigation without any manual bookkeeping.

#### b) Modify `TodoItem.swift`

Add the relationship below the existing stored properties:

```swift
@Relationship(deleteRule: .cascade) var urls: [TodoUrl]?
```

#### c) Modify `SyncService.swift`

Remove `urlsByTodoId` and `urls(for:)`. In `applySync`, after the existing four steps, add a
fifth that replaces URL records for every todo received from the server:

```swift
// Step 5: Sync URLs (server is authoritative — replace all for each todo in the response)
// Build a single lookup map from the IDs already processed in the sync — avoids one
// FetchDescriptor round-trip per todo in the hot sync path.
let remoteIds = remoteTodos.compactMap { UUID(uuidString: $0.id) }
let batchDescriptor = FetchDescriptor<TodoItem>(
    predicate: #Predicate { remoteIds.contains($0.id) }
)
let todoMap = try Dictionary(
    uniqueKeysWithValues: modelContext.fetch(batchDescriptor).map { ($0.id, $0) }
)

for remote in remoteTodos {
    guard let remoteId = UUID(uuidString: remote.id),
          let todo = todoMap[remoteId] else { continue }

    // Delete stale local URLs for this todo
    for url in todo.urls ?? [] { modelContext.delete(url) }

    // Insert fresh URLs from server
    let newUrls = (remote.urls ?? []).map { TodoUrl(from: $0) }
    for url in newUrls { modelContext.insert(url) }
    todo.urls = newUrls
}
```

This runs inside the same `applySync` call before the existing `try modelContext.save()`.
The single batch fetch replaces N individual `FetchDescriptor` calls (one per todo), which
matters on a large list. If Step 1 already fetches all `TodoItem` instances into memory, pass
that collection in as a `[UUID: TodoItem]` map instead of issuing the batch fetch here.

#### d) Update `SharedModelContainer.swift`

Add `TodoUrl.self` to the schema so SwiftData includes it in the store. The container
configuration currently only lists `TodoItem.self` — add `TodoUrl.self` alongside it.

#### e) Update call sites

- **`ContentView.swift`**: in `todoRow(_:)`, change `urls: syncService.urls(for: todo.id)` to
  `urls: todo.urls?.map { APITodoUrl(from: $0, todoId: todo.id.uuidString) } ?? []`. This keeps
  `TodoItemRow`'s public interface unchanged (`[APITodoUrl]`), avoiding a cascade of downstream
  type changes. Add a convenience `init(from: TodoUrl, todoId: String)` to `APITodoUrl` that
  maps the stored fields back to the API type (fields are the same names; `itemDescription` maps
  back to `description`; `todoId` is passed explicitly because `APITodoUrl.todoId` is
  non-optional and `TodoUrl` does not store a redundant copy — the caller already has the parent
  `TodoItem` in scope):

  ```swift
  extension APITodoUrl {
      init(from stored: TodoUrl, todoId: String) {
          self.init(
              id: stored.id,
              todoId: todoId,
              url: stored.url,
              title: stored.title,
              description: stored.itemDescription,
              siteName: stored.siteName,
              favicon: stored.favicon,
              position: stored.position,
              fetchStatus: FetchStatus(rawValue: stored.fetchStatus) ?? .pending,
              fetchedAt: stored.fetchedAt,
              createdAt: stored.createdAt,
              updatedAt: stored.updatedAt
          )
      }
  }
  ```
- **`TodoItemRow.swift`**: no change to the `urls` parameter type — it stays `[APITodoUrl]`.
- **`UrlRowCompact.swift`**: no change to the `url` parameter type — it stays `APITodoUrl`.
- **`TodoEditSheet.swift`**: no change to URL param type (stays `[APITodoUrl]`); update the
  data source from `syncService.urls(for:)` to
  `todo.urls?.map { APITodoUrl(from: $0, todoId: todo.id.uuidString) } ?? []` if it currently
  displays URL rows
- **Previews**: update any `modelContainer(for: TodoItem.self, ...)` calls to include `TodoUrl.self`
- **Tests**: update `SyncServiceTests.swift` — remove assertions on `urlsByTodoId`, add
  assertions that URLs appear on the related `TodoItem` after sync

## Files to modify

| File | Change |
|------|--------|
| `src/web/src/hooks/useTodos.ts` | Add `onMutate`/`onError`/`onSettled` to `useCreateTodo` |
| `src/web/src/components/OfflineBanner.tsx` | New component |
| `src/web/src/routes/__root.tsx` | Render `<OfflineBanner />` after `<Header />` |
| `src/ios/.../Models/TodoUrl.swift` | New SwiftData model |
| `src/ios/.../Models/TodoItem.swift` | Add `@Relationship var urls` |
| `src/ios/.../Services/SyncService.swift` | Remove in-memory dict; persist URLs in `applySync` |
| `src/ios/.../Services/SharedModelContainer.swift` | Add `TodoUrl.self` to schema |
| `src/ios/.../Views/Components/TodoItemRow.swift` | Add unsynced dot; `urls` param type unchanged |
| `src/ios/.../Views/Components/UrlRowCompact.swift` | No change — param stays `APITodoUrl` |
| `src/ios/.../Views/Components/TodoEditSheet.swift` | Update data source from `syncService.urls(for:)` to `todo.urls` map; param type unchanged |
| `src/ios/.../Nylon ImpossibleTests/SyncServiceTests.swift` | Update URL assertions |

## Acceptance criteria

- [ ] Creating a todo on web appears in the list immediately, before the server responds
- [ ] If the create request fails on web, the optimistic entry is removed and the list reverts
- [ ] An offline banner is shown on web when `navigator.onLine` is false; it disappears on
      reconnect
- [ ] Mutations made while offline are not lost — they complete when connectivity returns
- [ ] Each unsynced iOS todo shows a small dot indicator; the dot disappears after successful sync
- [ ] iOS URL metadata survives an app restart without requiring a sync
- [ ] All existing iOS tests pass; no references to `urlsByTodoId` remain
- [ ] Previews compile with the updated SwiftData schema

## Key considerations

- The optimistic todo uses `position: 'a0'` as a placeholder. It'll briefly appear at an
  arbitrary position in the list before `onSettled` triggers an invalidation that refetches the
  correctly-ordered list from the server. This is acceptable — the item is only in this state
  for the duration of the network round trip.
- URL sync replaces rather than merges because the server is authoritative for URL records (users
  don't create them directly). This keeps the logic simple and avoids conflict resolution for URLs.
- SwiftData will auto-migrate to the new schema (adding the `TodoUrl` table and `urls`
  relationship column on `TodoItem`) without requiring a versioned migration, as no existing
  columns are removed or renamed.

## Out of scope

Full architectural convergence (offline-first web, per-mutation rollback on iOS) is not worth
the complexity. The implementation strategies can stay different as long as the user-visible
outcomes are equivalent.

## Dependencies

- No external dependencies
- All four changes are independent of each other and can be implemented in any order
