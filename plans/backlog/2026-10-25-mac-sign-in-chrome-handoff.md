---
title: Mac sign-in stalls when Chrome is the default browser
status: Backlog
created: 2026-10-25
updated: 2026-10-25
---

# Mac sign-in stalls when Chrome is the default browser

## Problem

With Chrome as the default browser, signing in to a locally built, signed
Debug Mac app goes nowhere. Clicking **Continue with Google** (or GitHub)
shows the system prompt "“Nylon Impossible” Wants to Use
“accounts.google.com” to Sign In". After **Continue**, Chrome is activated
but no sign-in page appears, and `MacSignInView` keeps waiting with "Finish
signing in with Google in the browser window". GitHub behaves the same, so the
problem is the browser handoff, not the provider.

The workaround is to make Safari the default browser for one sign-in. The
session is kept in the keychain, so the browser doesn't matter after that.

Seen on the personal Mac (macOS 27) while bisecting a layout bug. The
TestFlight build signed in there before, but it isn't known which browser was
the default at the time.

## Where it happens

`MacSignInView.signIn(with:)` calls `clerk.auth.signInWithOAuth(provider:)`,
which runs an `ASWebAuthenticationSession` and returns through the app's
callback scheme (the same redirect iOS uses for this bundle ID). macOS hands
that session to the default browser. Chrome supports this, but not as
reliably as Safari.

## Things to check

- Does the TestFlight build stall with Chrome as the default browser too, or
  only a Debug build? Debug Mac builds use a separate Clerk keychain service
  (`com.superhighfives.Nylon-Impossible.debug`, #411); the redirect should be
  the same, but confirm it.
- Whether Chrome opens a window in another profile or on another desktop,
  out of sight.
- Whether ClerkKit sets `prefersEphemeralWebBrowserSession` or other
  options that Chrome handles differently.
- Whether the callback scheme is registered for the Mac target the same
  way as for iOS (Info.plist URL types).
- Possible fixes: a timeout or "Having trouble? Open in Safari" fallback
  in `MacSignInView`, or a ClerkKit option that keeps the session in the
  app.

Users with Chrome as their default browser may be unable to sign in on the
Mac at all.
