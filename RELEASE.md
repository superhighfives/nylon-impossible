# Release

The checklist for Nylon's first public release. Tick items as they land. Work
that needs code goes on the [Nylon board](https://github.com/users/superhighfives/projects/1)
too; this file tracks the parts that live outside the repo (App Store Connect,
Clerk, Google) and the launch-day steps.

## Decisions

- 2026-11-24: Launch on web, iOS and Mac. Gmail follows later, as an unlisted
  add-on first, then the Workspace Marketplace if review allows.
- 2026-11-24: Nylon is free. The `plan` field stays and gates nothing.
- 2026-11-24: Sign-up is open to everyone from launch day. Until then,
  Clerk stays in Waitlist mode, and the owner invites the waitlist at launch.
- 2026-11-24: Support is GitHub issues. The foreman acts only on what the
  owner labels (see "Support").

## Before submission

### Accounts and auth

Clerk production, checked 2026-11-24: access mode is Waitlist (sign-ups
off), with 25 people waiting. Social sign-in is GitHub and Google (Apple
added the same day, below). Legacy
bot sign-up protection (Turnstile) is on. Disposable-email blocking is off.

- [ ] Sign in with Apple. iOS offers Google and GitHub through Clerk's
      `AuthView`, so App Store guideline 4.8 requires an equivalent option.
      Decision (2026-11-24): add Apple as Clerk's third social connection,
      which the free plan allows. The apps use Clerk's native flow, which
      needs no Services ID or key. The web needs both: Clerk's sign-in
      modal shows every enabled connection, and someone who signs up on
      iPhone with Apple has no other way into the web app.
      - [x] Clerk production: register the app (App ID prefix and bundle
            ID) under Native applications (2026-11-24).
      - [x] Apple: add the Sign in with Apple capability to the App ID, then
            regenerate the iOS and Mac App Store profiles and update their
            secrets (2026-11-24). CI signs with those profiles. The next
            `ios-deploy` run proves it.
      - [x] Apple, for the web: Services ID
            `com.superhighfives.Nylon-Impossible.web` (return URL
            `https://clerk.nylonimpossible.com/v1/oauth_callback`), key
            `5L5V9TNK55`, and Clerk's bounce address registered with the
            private email relay (2026-11-24). Apple shows the key file
            once; the owner keeps it.
      - [x] Clerk production: enable the Apple connection with those
            credentials (2026-11-24).
      - [ ] Code: the entitlement on iOS and macOS, and an Apple button in
            `MacSignInView` (iOS gets it from `AuthView`). Test on both.
      - [ ] Sign in with Apple once on the web and once in each app.
- [ ] Update bot protection to "Challenge suspicious sign-ups" (Clerk
      recommends it in place of the legacy protection), and consider
      blocking disposable email addresses.
- [ ] Clerk production limits and cost at the expected number of users.

### App Store Connect (iOS and Mac, one Universal Purchase record)

Bundle ID `com.superhighfives.Nylon-Impossible`, version 1.0. Fastlane
uploads the binary only (`skip_metadata`, `skip_screenshots`,
`submit_for_review: false`), so everything here is entered in App Store
Connect by hand unless we add `deliver` metadata later.

- [ ] Privacy manifest. The app has no `PrivacyInfo.xcprivacy`, and about 25
      files use `UserDefaults`, a required-reason API. Add a manifest to the
      app, the widget and the share extension. App Store Connect rejects a
      submission without the declaration (ITMS-91053).
- [x] App privacy labels, published 2026-11-24. Collected, linked to the
      user, for app functionality, no tracking: name and email address
      (Clerk), user ID, other user content (todos, lists, notes, links),
      crash data and performance data (Sentry). Sentry's data counts as
      linked because the app sets the Sentry user
      (`SessionLifecycle.swift`). Update the labels if that changes.
- [x] Name, subtitle, promotional text, description, keywords, category,
      on the iOS and Mac versions (2026-11-24).
- [x] Release: manual on both versions, so approval doesn't publish them.
- [ ] Screenshots for each required iPhone and Mac size. The app is
      iPhone only (`TARGETED_DEVICE_FAMILY = 1`), so no iPad shots. The
      `marketing-screenshots` pipeline can produce them; #611 (iOS
      captures on the self-hosted Mac) is blocked.
- [x] Support URL: the GitHub issues page. Marketing URL:
      https://nylonimpossible.com.
- [x] Privacy policy URL: https://nylonimpossible.com/privacy.
- [x] Age rating: 4+ (every answer "None" or "No"; links open in the
      system browser, and todos aren't shared with other people).
- [ ] Review contact and copyright line (the owner's details).
- [ ] Review notes and a demo account that App Review can sign in with.
      Seed it with lists and todos so every screen has content.
- [ ] Export compliance (HTTPS only: standard exemption).
- [x] Pricing: free, all 175 countries or regions, and future ones.

### App Store listing (draft)

Built from the landing page's copy (`src/web/src/components/LandingPage.tsx`),
so it says what the site says. Edit freely; the owner's version is the one
that ships. Limits are App Store Connect's.

- **Name (30):** Nylon, in English (Australia), the primary language.
  English (U.S.) still says Nylon Impossible: the store refused "Nylon"
  there (2026-11-24). The home screen says "Nylon"
  (`CFBundleDisplayName`).
- **Subtitle (30):** A todo list shaped by time
- **Promotional text (170):** Today, this week, someday. Things you don't
  get to move along on their own, and done means gone. The same on the
  web, iPhone and Mac.
- **Keywords (100):** todo,to-do,list,today,this week,someday,planner,
  reminders,checklist,menu bar,widget. No "tasks": it's a "Not" word in
  PRINCIPLES.md's Vocabulary (owner, 2026-11-24).
- **Category:** Productivity (matches `LSApplicationCategoryType`).
- **Description (4000):**

  > Nylon is a todo list shaped by time.
  >
  > Today is what you're doing now. Anything still here tomorrow moves on
  > to this week by itself. This week is what's coming up; after seven
  > days it settles into someday, without you sorting it. Someday is
  > everything else, kept out of the way until you want it.
  >
  > Done means gone. Tick a todo and it leaves straight away, with Undo if
  > you need it.
  >
  > Add in one motion. Type "Call Sam tomorrow" and it's due tomorrow.
  > Paste a link and it titles itself.
  >
  > Lists that stay put. Groceries, a project, a trip. Your own lists never
  > age.
  >
  > Everywhere, synced as you type and fine offline:
  > - iPhone: swipe to mark done, and a today widget on your Home Screen.
  > - Mac: quick add and today's todos, from the menu bar.
  > - Web: the full board in any desktop browser.
  >
  > Free.

### Mac

The Mac release is already on: `ENABLE_MAC_RELEASE` has been `true` since
2026-10-21, its five secrets exist, and `deploy-mac` passed on the last five
`ios-deploy.yml` runs (checked 2026-11-24).

- [ ] Install one Mac TestFlight build and try it from the menu bar.

### Operations

- [ ] Scheduled export of production D1 (board item).
- [ ] Rate limits on the signed-in API and web routes (board item).
- [ ] Sentry alert rules for new issues, and an uptime check on
      `api.nylonimpossible.com/health` and `nylonimpossible.com`.

### Website

- [ ] The landing page still says "Coming soon" and "You're on the list.
      We'll email you when it's ready." (`LANDING_COPY` in
      `src/web/src/components/LandingPage.tsx`). Prepare a PR that swaps the
      waitlist for sign-up and App Store links, and merge it on launch day.

### Support

- [ ] An issue template for bug reports and requests.
- [ ] A link to it in the apps (settings) and on the App Store listing.
- [ ] The foreman acts on an outside user's issue only after the owner
      labels it, and only on the text the owner read (board item).

## Launch day

1. Merge the launch-day rules PR, #841 (it changes `CLAUDE.md` from
   "unreleased" to "released").
2. Submit the iOS and Mac builds for review from App Store Connect.
3. When they're approved, release them by hand.
4. In Clerk production, set the access mode to Open, and merge the
   landing page PR.
5. Invite the waitlist from Clerk's Waitlist page. Clerk sends each person
   an invitation email, so the owner does this step.
6. Watch Sentry and the Cloudflare dashboards for the first day.

## Later

- [ ] Gmail add-on: Google Workspace Marketplace listing and OAuth
      verification (`src/gmail-addon/README.md`).
