# Plan: Add Durable Objects + WebSocket for Real-Time Sync

## Context

Currently, real-time sync uses polling: web polls every 3s via React Query `refetchInterval`, iOS polls every 5s via `SyncService.startPolling()`. This introduces latency for cross-device updates and generates unnecessary API calls when nothing has changed. We're replacing polling entirely with WebSocket push via Cloudflare Durable Objects.

## Architecture

**Approach: "Push notification" model** — the DO is a lightweight broadcast hub, not a data layer.

```
Web client ──server functions──> D1 (direct write)
    │                                  ▲
    │ WebSocket "changed"              │ read
    ▼                                  │
  Durable Object (UserSync)      API Worker
    │                                  ▲
    │ WebSocket "sync"                 │ REST /todos/sync
    ▼                                  │
iOS client ────────────────────────────┘
```

- **One DO per user** (`idFromName(userId)`)
- DO holds WebSocket connections and broadcasts — no D1 access needed
- Uses **WebSocket Hibernation API** for cost efficiency (no charge while idle)
- Clients keep their existing mutation paths (web: server functions → D1, iOS: REST API → D1)
- After any mutation, the client sends `{"type":"changed"}` over its WebSocket
- DO broadcasts `{"type":"sync"}` to all OTHER connected WebSockets
- On receiving "sync", clients refetch their data through existing paths
- On reconnect, clients do a full data fetch to catch missed changes

### Auth on WebSocket Upgrade

- Pass Clerk JWT as query param: `wss://api.nylonimpossible.com/ws?token=<jwt>`
- Verified once at upgrade time in the API worker before forwarding to DO
- Token expiry during long connections is acceptable — connection drops naturally, reconnect gets fresh token

## File Changes

### 1. New: `src/api/src/durable-objects/UserSync.ts`

Durable Object class using Hibernation API:
- `fetch()` — accepts WebSocket upgrade
- `webSocketMessage()` — on `"changed"` message, broadcast `"sync"` to all other connections
- `webSocketClose()` — cleanup
- `webSocketError()` — cleanup

### 2. Modify: `src/api/wrangler.jsonc`

Add DO binding and migration:
```jsonc
{
  "durable_objects": {
    "bindings": [{ "name": "USER_SYNC", "class_name": "UserSync" }]
  },
  "migrations": [{ "tag": "v1", "new_classes": ["UserSync"] }]
}
```

### 3. Modify: `src/api/src/index.ts`

Add WebSocket upgrade route before auth-protected routes:
- `GET /ws?token=<jwt>` — verify JWT from query param, get DO stub for user, forward request

### 4. Modify: `src/api/src/types.ts`

Add `USER_SYNC: DurableObjectNamespace` to `Env` interface.

### 5. New: `src/web/src/hooks/useWebSocket.ts`

React hook that:
- Connects to `wss://api.nylonimpossible.com/ws?token=<token>` using Clerk `getToken()`
- On `"sync"` message → `queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY })`
- On open/reconnect → invalidate queries (catch up on missed changes)
- On close → reconnect with exponential backoff (1s → 2s → 4s → ... → 30s cap)
- Exposes `notifyChanged()` for mutations to call
- Handles token refresh on reconnect

### 6. Modify: `src/web/src/hooks/useTodos.ts`

- Remove `refetchInterval` from `useTodos()` query
- In `useCreateTodo`, `useUpdateTodo`, `useDeleteTodo` — call `notifyChanged()` in `onSuccess`/`onSettled`

### 7. Modify: `src/web/src/components/TodoList.tsx` (or parent component)

- Initialize `useWebSocket()` hook at the appropriate level (needs to be where `QueryClient` is available)

### 8. New: `src/ios/.../Services/WebSocketService.swift`

Swift service using `URLSessionWebSocketTask`:
- `connect()` — get Clerk token, open `wss://api.nylonimpossible.com/ws?token=<token>`
- Receive loop — on `"sync"` message, trigger `SyncService.sync()`
- `notifyChanged()` — send `{"type":"changed"}`
- Reconnect with exponential backoff on disconnect
- `disconnect()` — clean close

### 9. Modify: `src/ios/.../Services/SyncService.swift`

- Remove `startPolling()`, `stopPolling()`, `isPolling`, `pollingTask`
- Remove `debounceTask` and `syncAfterAction()` debounce logic
- Add reference to `WebSocketService`
- `syncAfterAction()` becomes: sync immediately, then call `webSocketService.notifyChanged()`
- Keep `sync()` method (still used on reconnect and when notified)
- Keep `reset()` — also disconnects WebSocket

### 10. Modify: `src/ios/.../ViewModels/TodoViewModel.swift` or `ContentView.swift`

- Replace `startPolling()`/`stopPolling()` lifecycle calls with `webSocketService.connect()`/`disconnect()`
- Wire up WebSocket "sync" callback to trigger `SyncService.sync()`

## Message Protocol

Simple JSON over WebSocket:

| Direction | Message | Meaning |
|-----------|---------|---------|
| Client → DO | `{"type":"changed"}` | "I just mutated data" |
| DO → Client | `{"type":"sync"}` | "Another client changed data, go fetch" |
| DO → Client | `{"type":"ping"}` | Keepalive (optional, Hibernation API handles this) |

## Reconnection Strategy

Both clients:
1. On WebSocket close → wait `delay` → reconnect with fresh auth token
2. Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
3. On successful reconnect → immediately fetch latest data
4. Reset backoff to 1s on successful connection

iOS-specific:
- Disconnect on `scenePhase == .background`
- Reconnect on `scenePhase == .active`

## Verification

1. **API Worker**: Deploy, verify `GET /ws` returns 101 with valid token, 401 without
2. **Web**: Open two browser tabs, create/edit/delete in one, verify instant update in the other
3. **iOS**: Edit on web, verify iOS updates without polling; edit on iOS, verify web updates
4. **Reconnection**: Kill network briefly, verify client reconnects and catches up
5. **Multiple devices**: Edit on iOS while web is open, verify both stay in sync
