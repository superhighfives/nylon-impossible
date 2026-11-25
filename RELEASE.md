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
off), with 25 people waiting. Social sign-in is GitHub and Google. Legacy
bot sign-up protection (Turnstile) is on. Disposable-email blocking is off.

- [ ] Sign in with Apple. iOS offers Google and GitHub through Clerk's
      `AuthView`, so App Store guideline 4.8 requires an equivalent option.
      Decision (2026-11-24): add Apple as Clerk's third social connection,
      which the free plan allows. Test it on iOS and on the Mac sign-in.
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
- [ ] App privacy labels. Collected and linked to the user: email address
      (Clerk), user content (todos, lists, notes, links). Not linked:
      crash data and diagnostics (Sentry). No tracking. Check the Clerk and
      Sentry SDK manifests for anything else.
- [ ] Name, subtitle, promotional text, description, keywords, category.
- [ ] Screenshots for each required iPhone and Mac size. The app is
      iPhone only (`TARGETED_DEVICE_FAMILY = 1`), so no iPad shots. The
      `marketing-screenshots` pipeline can produce them; #611 (iOS
      captures on the self-hosted Mac) is blocked.
- [ ] Support URL: the GitHub issues page, or a page on
      nylonimpossible.com that links to it.
- [ ] Privacy policy URL: https://nylonimpossible.com/privacy.
- [ ] Age rating questionnaire.
- [ ] Review notes and a demo account that App Review can sign in with.
      Seed it with lists and todos so every screen has content.
- [ ] Export compliance (HTTPS only: standard exemption).
- [ ] Pricing: free, all territories.

### Mac

- [ ] Certificates and profiles from the Mac section of
      `src/ios/README.md`.
- [ ] Set the repository variable `ENABLE_MAC_RELEASE` to `"true"` so the
      `deploy-mac` jobs run.
- [ ] One Mac TestFlight build installed and tried from the menu bar.

### Operations

- [ ] Scheduled export of production D1 (board item).
- [ ] Rate limits on the signed-in API and web routes (board item).
- [ ] Sentry alert rules for new issues, and an uptime check on
      `api.nylonimpossible.com/health` and `nylonimpossible.com`.

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
4. In Clerk production, set the access mode to Open.
5. Invite the waitlist from Clerk's Waitlist page. Clerk sends each person
   an invitation email, so the owner does this step.
6. Watch Sentry and the Cloudflare dashboards for the first day.

## Later

- [ ] Gmail add-on: Google Workspace Marketplace listing and OAuth
      verification (`src/gmail-addon/README.md`).
