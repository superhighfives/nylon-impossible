---
title: Mac sign-in stalls when Chrome is the default browser
status: In Progress
created: 2026-10-25
updated: 2026-10-27
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

Users with Chrome as their default browser may be unable to sign in on the
Mac at all.

## Findings

### What ClerkKit does (clerk-ios 1.6.1, `173d938`, as in `Package.resolved`)

`Auth.signInWithOAuth(provider:)` creates a sign-in with strategy
`oauth_<provider>` and `redirect_url` = `redirectConfig.redirectUrl`, then
`SignIn.authenticateWithOAuth` runs `WebAuthentication`
(`Sources/ClerkKit/Utils/WebAuthentication.swift`):

- **Initializer:** the legacy
  `ASWebAuthenticationSession(url:callbackURLScheme:completionHandler:)`, not
  the macOS 14.4 `ASWebAuthenticationSession.Callback` API. The factory that
  builds it is internal, so the app can't swap it.
- **Callback:** custom scheme = `Bundle.main.bundleIdentifier`
  (`com.superhighfives.Nylon-Impossible`), redirect
  `com.superhighfives.Nylon-Impossible://callback`. The app doesn't override
  `redirectConfig`.
- **`prefersEphemeralWebBrowserSession`:** `false` (the default; the app
  doesn't pass it).
- **Presentation anchor:** `NSApp.keyWindow ?? mainWindow ?? windows.first`
  — the sign-in sheet's window.
- **No `additionalHeaderFields`.**
- **One session at a time:** a static `activeSession`; a second `start()`
  while one is live throws "A web authentication session is already in
  progress." Cancelling the Swift task calls `session.cancel()` and resumes
  with `CancellationError`, so cancelling is safe and frees the slot.
- `WebAuthentication.finishWithDeeplinkUrl` exists but nothing calls it, and
  `Clerk.handle(_:)` only routes magic links. `SignIn.handleRedirectCallbackUrl`
  and `reload(rotatingTokenNonce:)` are internal. So there's **no public way
  to complete an OAuth sign-in that ran outside the session** (e.g. opening
  the URL in Safari ourselves and catching the redirect), short of forking
  ClerkKit or hand-rolling Clerk's Frontend API calls.

Nothing here is unusual or Chrome-hostile: non-ephemeral, a plain custom
scheme, a real anchor window.

### The app's side

- The Mac target shares `Nylon-Impossible-Info.plist` with iOS. Its
  `CFBundleURLTypes` register `nylon` and the Clerk domains, **not** the
  bundle-ID callback scheme. That's fine for `ASWebAuthenticationSession`: the
  session (Safari) or the browser (Chrome's navigation throttle, below)
  intercepts the redirect itself and never routes it through Launch Services.
  Registering it wouldn't help, since Clerk ignores the URL if it arrives
  through `onOpenURL`.
- `Nylon Impossible-macOS.entitlements`: App Sandbox +
  `network.client`. `ASWebAuthenticationSession` needs nothing more, and
  Safari works with the same build, so it isn't a sandbox problem.

### How macOS hands the session to Chrome

- macOS gives an `ASWebAuthenticationSession` to the default `https` handler
  when its Info.plist declares `ASWebAuthenticationSessionWebBrowserSupportCapabilities`
  ([Apple docs](https://developer.apple.com/documentation/bundleresources/information-property-list/aswebauthenticationsessionwebbrowsersupportcapabilities)).
  Chrome declares `IsSupported`, `EphemeralBrowserSessionIsSupported` and
  `CallbackURLMatchingIsSupported`
  ([`chrome/app/app-Info.plist`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/app/app-Info.plist)).
  Otherwise (Firefox, for one) the system falls back to Safari
  ([Mozilla bug 1921535](https://bugzilla.mozilla.org/show_bug.cgi?id=1921535)).
- Chrome registers as `ASWebAuthenticationSessionWebBrowserSessionManager.sharedManager.sessionHandler`
  in `applicationDidFinishLaunching`. `beginHandlingWebAuthenticationSessionRequest:`
  queues the request, loads the last-used profile (`RunInLastProfileSafely`),
  and `AuthSessionRequest::StartNewAuthSession` opens a popup window, loads
  the URL, and completes when a navigation matches the callback
  (`request.callback matchesURL:` on 14.4+). If there's no usable profile or
  it can't make a window, it **fails the request** with
  `presentationContextInvalid` (and may show the profile picker) — it doesn't
  hang
  ([`app_controller_mac.mm`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/app_controller_mac.mm),
  [`auth_session_request.mm`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/mac/auth_session_request.mm)).

### Reports of the same symptom

- macOS Tahoe: "The browser application is launched (we could see in the
  dock) — but the authentication window with the URL does not appear — no
  error is returned to the app"
  ([Apple forums 814054](https://developer.apple.com/forums/thread/814054),
  Jan 2026, no reply).
- A macOS app with Chrome 152 as default: "a flash of browser focus and no
  sign-in page"; the unified log showed the request handed off via
  SafariLaunchAgent to Chrome, which "presented nothing; the request stayed
  queued until our cancel". Their fix bypasses the session for Chrome and
  opens the URL in the browser directly
  ([deathemperor/infinitus#1180](https://github.com/deathemperor/infinitus/pull/1180)).
- Every default browser except Safari: a second session after cancelling the
  first never shows, and "restarting the default browser … shows the queue of
  previously called (but not shown) authentication windows"; Apple asked for
  a Feedback report
  ([Apple forums 724366](https://developer.apple.com/forums/thread/724366)).
  Auth0.swift had to cancel stale sessions before opening a new one for the
  same reason ([auth0/Auth0.swift#735](https://github.com/auth0/Auth0.swift/pull/735)).
- Long-standing Chrome-as-default trouble: Chrome not opening the page at
  all, or crashing afterwards
  ([Apple forums 689046](https://developer.apple.com/forums/thread/689046));
  sandboxed apps where `start()` returns `true` and nothing ever appears
  ([Apple forums 808304](https://developer.apple.com/forums/thread/808304)).
- Other apps have given up on the session on macOS and use the default
  browser plus a deep link
  ([tgorka/keeper#427](https://github.com/tgorka/keeper/pull/427)).

### Root cause (best-supported hypothesis, not confirmed)

The request is lost between the system and Chrome: macOS (SafariLaunchAgent)
accepts the session and activates Chrome, but Chrome's handler either never
receives it or receives it and never opens its window. Either way the
session neither completes nor fails, and ClerkKit's `start()` waits on it
forever. Confidence: **medium** that it's this OS ↔ Chrome handoff and not
anything in our code or ClerkKit's options. Chrome's own code fails loudly
when it can't make a window, so a silent stall points at delivery. The
reports above span Sonoma through Tahoe; nothing says it's new in macOS 27.
**Low** confidence in which side drops it. Open questions:

- whether it's only when Chrome is already running, or has several profiles
  (Chrome uses the *last-used* profile; a popup on another Space or behind
  a full-screen window would look the same);
- whether a stuck request blocks later ones until Chrome restarts, as forum
  724366 describes.

The "To verify" steps below should settle these.

### Options considered

- **Session options.** Ephemeral doesn't help (infinitus#1180 stalled with
  it), the `Callback` API can't be chosen through ClerkKit, and the options
  aren't the problem anyway.
- **Open the OAuth URL in Safari (or the default browser) ourselves and
  catch the callback.** This is the robust fix other apps use, but finishing
  the sign-in needs ClerkKit's internal `reload(rotatingTokenNonce:)` /
  transfer flow. Not worth a ClerkKit fork for now. Worth asking Clerk for a
  public "complete OAuth from callback URL" API, or a hook into
  `WebAuthentication`, as a follow-up.
- **Detect the stall and give the person a way out** — done, below.

## What changed

- `Mac/MacSignInHandoff.swift` (new, macOS-only): reads the default `https`
  handler (`NSWorkspace.urlForApplication(toOpen:)`) and classifies it as
  Safari, another browser (by name), or unknown. It tracks one sign-in and
  decides when to show help: after `helpDelay` (15 s), or — for a
  non-Safari default — as soon as the person comes back to the app after it
  lost focus to the browser. (Safari's own sheet and the consent prompt can
  move focus too, so for Safari only the delay counts.)
- `MacSignInView`: while a sign-in runs, the sheet shows that help once it
  applies, with **Start Over** (cancels ClerkKit's session in place: the sheet
  stays and the provider buttons come back) and, when the default isn't
  Safari, **Default Browser Settings…** (System Settings ▸ Desktop & Dock).
  The text names the browser and suggests quitting it (⌘Q) before retrying,
  since a stuck request can block the next one until the browser restarts.
  Before this, the only way out was **Cancel**, which closed the sheet
  without saying why.
- A browser that *refuses* the session (`presentationContextInvalid` /
  `NotProvided`) now gets a message naming it, rather than "Check your
  connection".
- Tests: `MacSignInHandoffTests` in `MacFeatureTests.swift` (classification,
  delay, return-to-app, messages, settings URL).
- README Mac ▸ Sign-in: it still called the Mac flow an email-code flow.

This doesn't make Chrome sign-in succeed if the handoff is lost. It makes the
failure visible and recoverable without the person having to know the
workaround.

## To verify (needs the owner, signed build)

- [ ] Chrome default, Chrome **running**, one profile: Google, then GitHub.
      Does the page open? If it stalls, does help appear (on returning to
      the app, or after 15 s)? Does **Start Over** bring the buttons back,
      and does a second attempt work?
- [ ] Same with Chrome **not running** (⌘Q first).
- [ ] Chrome with **several profiles** and the profile picker on: does a
      popup appear in the last-used profile, or on another Space?
- [ ] On a stall, capture
      `log stream --info --predicate 'process == "SafariLaunchAgent" OR subsystem == "com.apple.AuthenticationServices" OR process == "Google Chrome"'`
      to see which side drops the request.
- [ ] **Default Browser Settings…** opens Desktop & Dock; switching to
      Safari and signing in works; switching back to Chrome keeps the
      session after relaunch.
- [ ] TestFlight/Release-signed build as well as Debug (Debug uses its own
      Clerk keychain service; the redirect is the same).
- [ ] Safari default: sign-in still completes, and the help only shows if
      it takes longer than 15 s.
- [ ] Chrome default, working sign-in: does the help flash up when focus
      returns after the consent prompt? (Harmless if so, but worth knowing.)
- [ ] If it's confirmed as an OS bug, file Feedback with the sysdiagnose and
      link it here.
