---
title: Refresh the Today widget from the server
status: Complete
created: 2026-10-25
updated: 2026-10-27
---

# Refresh the Today widget from the server

Completed 2026-10-27. **iOS only**; the Mac widget stays on the local store.

## Overview

The Today widget used to read only the on-device SwiftData store, and nothing
wrote to that store while the app was closed. An edit made on the web didn't
reach the Home Screen until the app was next opened.

Now each iOS timeline reload first pulls `GET /todos` and `GET /lists` with a
token from `SharedClerk.freshToken()` (#462), folds the rows into the shared
store, and then renders from the store through `TodayDigest.fetch` as before.
It asks to be reloaded every 30 minutes, or at local midnight if that's
sooner. Any failure (offline, no session, a non-2xx, the 8-second deadline)
leaves the store alone, so the widget shows exactly what it showed before
this change.

The Mac widget is left as it was. Its session lives in the legacy login
keychain rather than a shared access group, so it can't mint a token (see
#462 and `SharedClerk`), and the running Mac app already keeps the store
current and reloads the widget on each save. It still reloads only at
midnight.

Verified: unit tests for the merge, the timeline schedule, the deadline, the
JWT `sub` check and the API date decoder, in the full iOS suite on an
iPhone 17 Pro simulator; the Mac build compiles. **Not verified:** the widget
refreshing on a real device with the app closed. That needs a signed build, a
real Clerk session, and WidgetKit's own reload schedule, none of which a
simulator or CI gives us. The PR (#495) has the device test steps.

## Architecture

### How a reload works

1. `TodayProvider.getTimeline` (iOS) reads the signed-in user id from the
   App Group defaults and calls `WidgetServerRefresh.refresh`.
2. `refresh` runs the download under an 8-second deadline:
   `SharedClerk.freshToken()`, a check that the token's `sub` matches that
   user id, then `GET /todos` and `GET /lists` concurrently.
3. If both arrive, `merge` writes them into a fresh `ModelContext` on the
   shared container and saves.
4. The entry comes from `TodayDigest.fetch` on the store, unchanged. The
   policy is `.after(WidgetServerRefresh.nextReload(after:))`: now + 30
   minutes, or `TodayDigest.startOfTomorrow`, whichever is first.

### Merge rules

| Local row | Server row | Result |
| --- | --- | --- |
| none | present | inserted, `isSynced = true` |
| synced, older | newer | overwritten with `TodoItem.apply(remote:)` |
| synced, same or newer | present | left alone |
| pending (`!isSynced`), including a pending delete | anything | left alone: the local change wins |
| synced, this user | absent | soft-deleted (`isSoftDeleted = true`, still `isSynced`) |
| another user's, or local-only | absent | left alone |

Lists are inserted or updated, never removed. The field copy in
`TodoItem.apply(remote:)` and `TodoItem(remote:id:userId:)` was pulled out of
`SyncService.applySync`, which now calls the same two functions, so the widget
and the app can't disagree about what a newer server row overwrites.

### Key decisions

- **Write to the store, rather than merge in memory for display.** The
  owner left this choice open. Writing is what makes `CompleteTodoIntent`
  work on a row that arrived this way: it looks the todo up in the store,
  so a display-only row couldn't be ticked. That was the plan's "server-only
  rows can't be completed" question. It also avoids a quieter bug. The
  sync endpoint is whole-row last-write-wins on `updatedAt`, and the
  completion uploads every field. If the widget showed a web rename from
  memory while the store still held the old row, ticking it would upload
  the old title (and the old list) with a newer timestamp and overwrite the
  web edit. Writing the row first means the completion builds on the
  server's current copy. Both options needed the same fetch, deadline and
  pending-wins rule, and writing reuses `TodayDigest.fetch` as it is, so
  it's the smaller change as well as the correct one.
- **Why writing from the widget is safe.** The widget already writes the
  store (`CompleteTodoIntent`), so a second writer isn't new. What's new is
  rows being updated, inserted and soft-deleted. The rules keep it safe:
  - A pending change is never touched, so nothing the user did locally
    can be lost. Pending means not yet uploaded, so the server copy is the
    older one.
  - An overwrite needs a strictly newer server `updatedAt`, so a row the app
    has just uploaded (and stamped newer) isn't rolled back by a fetch that
    started before the upload landed.
  - **Soft-delete, never delete.** On iOS the app can be suspended holding
    `TodoItem`s in its main context. A hard delete from another process
    would leave it faulting on objects whose rows are gone. A soft-deleted
    row drops out of the digest and the app's views. The app's next sync
    removes it for real (`applySync` step 4), or brings it back if the
    server does still have it.
  - The rows the widget writes are marked synced, carrying the server's
    `updatedAt`, so the app's next sync sees them as up to date and has
    nothing to upload. Links (`TodoUrl`) aren't written; that sync fills
    them in.
  - The token's `sub` must match the user id in the shared defaults. A token
    for a different account (mid-switch) would otherwise make every local row
    look deleted.
- **`StoreChangeSignal` isn't posted.** It exists so a running Mac app
  re-syncs after another process writes. Nothing listens on iOS, and the
  Mac widget never runs this code.
- **`CompleteTodoIntent` now no-ops on a soft-deleted todo**, alongside
  the existing already-completed case. A stale entry could otherwise
  complete a todo deleted on the web, and the upload would recreate it.
- **The deadline returns on time even if the work ignores cancellation.**
  `withDeadline` races the work against a timer with a continuation that
  resumes once. A task group would wait for a `refreshClient()` that doesn't
  check for cancellation.

### No new endpoint, but a faster decoder

The plan asked whether `GET /todos`, which returns every todo with its links,
was too heavy for a widget, and the owner asked for a lighter endpoint only
if measuring showed a real problem. To measure, a synthetic `GET /todos`
body was decoded with the app's own `APITodo` and decoder, on an M-series Mac
(optimised build). The bodies mixed completed and open todos, with notes on
a quarter of them and a fetched link on a third:

| Todos | Body | Decode, before | Decode, after | Resident memory added |
| --- | --- | --- | --- | --- |
| 500 | 352 KB | 437 ms | 18 ms | ~1 MB |
| 2,000 | 1.4 MB | 1,771 ms | 79 ms | ~4 MB |
| 5,000 | 3.5 MB | 5,139 ms | 161 ms | ~8 MB |

Memory was never the problem: a few MB against the extension's ~30 MB limit.
Time was. The shared decoder built a new `ISO8601DateFormatter` for every
date, four or five per todo. That ate most of the 8-second budget at a few
thousand todos, and a phone is slower than the Mac this ran on. The fix was
the decoder, not a new endpoint. It now parses with two static
`Date.ISO8601FormatStyle`s, about 20 times faster, and the app's own syncs
get the speed-up too. A `GET /today` is worth revisiting only for accounts
well past 5,000 todos. No API changes shipped.

### Files

| File | What changed |
| --- | --- |
| `Services/WidgetServerRefresh.swift` | New: fetch, deadline, merge, reload schedule |
| `Models/APITodo.swift` | `APITodo`, `APITodoUrl`, `FetchStatus` and `JSONDecoder.api`, moved out of `APIService.swift` so the widget can compile them; faster date parsing |
| `Models/TodoItem+Remote.swift` | New: the server-row field copy shared with `SyncService.applySync` |
| `Nylon Widget/TodayWidget.swift` | iOS: refresh before building the entry, 30-minute policy. Mac: unchanged |
| `Services/BackgroundSyncService.swift` | `subject(ofJWT:)`, sharing the claim parsing with `expiry(ofJWT:)` |
| `Intents/CompleteTodoIntent.swift` | No-op on a soft-deleted todo |
| `project.pbxproj` | The three new or moved files added to the widget target |
| `Nylon ImpossibleTests/WidgetServerRefreshTests.swift` | Merge rules, digest after merge, reload schedule, deadline |

## Open questions carried forward

- **App Attest.** Not checked. If device attestation is on for the Clerk
  instance, `freshToken()` in the widget may fail. The widget would then
  fall back to the local store quietly, since every failure does, so a
  device test that never shows a web edit should check this first.
- **Reload budget.** WidgetKit throttles reloads. Every 30 minutes should be
  within its budget, but how often a reload actually happens on a device is
  unmeasured. Each failed refresh is logged (subsystem
  `com.superhighfives.Nylon-Impossible`, category `WidgetServerRefresh`), so
  it can be watched in Console.
- **Mac.** A server refresh on the Mac would mean moving its session into a
  shared access group (see #411 and #414). It isn't needed while the running
  app keeps the store current.

## Related

- #462: `SharedClerk`, the token approach this builds on.
- #371: the earlier, uncompiled spike, closed.
