# Refresh the Today widget from the server

**Date**: 2026-10-25
**Status**: Backlog

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

- **Getting a token inside the widget is the hard part.** ClerkKit stores its
  login under the app's bundle id in the `.shared` keychain access group, and
  the widget already has that entitlement. That leaves two ways to get a
  fresh token:
  - **Link ClerkKit into the widget target** and call
    `Clerk.configure(..., keychainConfig: .init(service: "com.superhighfives.Nylon-Impossible"))`,
    then `auth.getToken()`. ClerkKit 1.0.1 calls `UIApplication.shared`
    without a guard in three places, so it may not build in an app extension.
    Check that before anything else.
  - **Read ClerkKit's keychain items directly** (`clerkDeviceToken`,
    `cachedClient`) and
    `POST {frontend API}/v1/client/sessions/{id}/tokens?_is_native=true`.
    This adds no dependency, but those items are ClerkKit internals, so any
    ClerkKit upgrade can break it.
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
- **The Mac widget.** The same approach should work under
  `Nylon Widget-macOS.entitlements`, but ClerkKit uses the legacy keychain on
  macOS, so check that path separately.

## Related

- The stored token that the extensions and background sync use assumes a
  50-minute lifetime. See #460. Whatever token
  approach this plan settles on may also fix that.
