# Optimistic UI Parity

The web and iOS use fundamentally different optimistic UI strategies. iOS is offline-first
(mutate local SwiftData model immediately, batch sync in background, retry on failure), while the
web is snapshot-and-rollback (cancel query, apply optimistic cache update, roll back on error).
Both approaches are appropriate for their platforms — the goal is not to converge them but to
close the specific UX gaps each has.

## Gaps to close

**Web**

- `useCreateTodo` is not optimistic. The todo list doesn't update until the server responds, which
  is a noticeable lag on slow connections compared to the iOS experience. Fix: generate a client-side
  temp ID, apply an optimistic cache entry, replace it with the server record on success (same
  snapshot-and-rollback pattern already used by `useUpdateTodo` and `useDeleteTodo`).

- No offline support. A failed mutation rolls back immediately and the user's change is lost.
  TanStack Query's `networkMode: 'offlineFirst'` pauses mutations when offline and drains the queue
  on reconnect — this is nearly free to enable and requires no architectural change.

**iOS**

- No error UI for failed syncs. If connectivity is lost, nothing tells the user their changes
  haven't reached the server. Items should show a small unsynced indicator while `isSynced == false`,
  and a persistent sync failure (after N retries) should surface a banner or status message.

- URL metadata is ephemeral. It's stored in-memory from the sync response and lost on app restart.
  URLs should be persisted to SwiftData alongside the todo so they survive restarts.

## Out of scope

Full architectural convergence (offline-first web, per-mutation rollback on iOS) is not worth
the complexity. The implementation strategies can stay different as long as the user-visible
outcomes are equivalent.
