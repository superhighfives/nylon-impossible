---
title: Refresh the Today widget from the server
status: Backlog
created: 2026-10-25
updated: 2026-10-27
---

# Refresh the Today widget from the server

## Problem

The Today widget only reads the on-device SwiftData store. Nothing writes to
that store while the app is closed, so an edit made on web doesn't reach the
widget until the app is opened again, which could be days later.
`TodayProvider.getTimeline` (`Nylon Widget/TodayWidget.swift`) asks for one
reload at local midnight and otherwise waits for the app to call
`WidgetRefresh.reload()`.

## Prior attempt

#371 was a spike written without Xcode. It was never compiled, and it was
closed after the redesign (#386, #398–#408) left it conflicting with main.
Its findings carry over:

- **Getting a token inside the widget was the hard part. On iOS, #462
  solved it.** The widget now links ClerkKit and shares the app's session
  through `SharedClerk` (the app's keychain service plus the shared access
  group), and `SharedClerk.freshToken()` mints a token in whatever process
  it runs in. `BackgroundSyncService` already uses it for the widget's
  checkbox, so a server fetch can call the same thing. The spike's other
  idea, reading ClerkKit's keychain items directly, isn't needed.
- **Fetch with a deadline, and fall back to the local store on failure.** The
  spike gave `/todos` + `/lists` 8 seconds. Any failure meant the widget
  showed what it shows today.
- **Put pending local changes on top of the server rows.** Otherwise a
  completion tapped on the widget but not yet uploaded comes back on the next
  refresh.
- **Use the same rule as the local digest.** Main's `TodayDigest.select`
  takes `[TodoItem]` (it was added for the Mac menu bar). It needs to accept
  plain values too, or the server rows need converting into something it
  takes.
- **Timeline:** reload every 30 minutes, or at midnight if that's sooner.

## Open questions

- **A lighter endpoint.** `GET /todos` returns every todo with its links,
  which is a lot for a widget. Something like `GET /today` could return just
  the digest.
- **Server-only rows can't be completed from the widget.**
  `CompleteTodoIntent` only looks in the local store, so tapping a row that
  only exists on the server does nothing.
- **App Attest.** If device attestation is turned on for the Clerk instance,
  token requests may need an assertion that the widget can't produce.
- **Widget reload budget.** WidgetKit throttles reloads. Every 30 minutes is
  within the budget, but measure how often it actually happens on a device.
- **The Mac widget.** #462 left the Mac out: its session stays in the legacy
  login keychain, not a shared access group, so the Mac widget can't mint a
  token. It only has the saved token, which now carries its real expiry
  (about 60 seconds). A server refresh on the Mac means either moving its
  session into an access group (a move between keychains; see #411 and #414
  for why that's delicate) or leaving the Mac widget on the local store,
  which the running Mac app keeps current anyway.

## Related

- #460 (closed by #462): the stored token assumed a 50-minute lifetime.
  #462's `SharedClerk` is the token approach this plan builds on.
