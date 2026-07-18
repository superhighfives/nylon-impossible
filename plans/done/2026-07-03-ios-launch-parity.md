# iOS launch parity: Google Tasks import, account deletion, legal links

**Date**: 2026-07-03
**Status**: Complete
**Updated**: 2026-07-17

## Problem

We want to release the app publicly focused on the todo experience (AI and paid
features held back). The web app recently gained several capabilities the iOS
client is missing, and two of those gaps are effectively iOS App Store launch
blockers:

1. **Google Tasks import** — shipped on web in #193, absent on iOS. This is the
   headline ask: let people bring their existing tasks across so they actually
   start using the app.
2. **In-app account deletion** — shipped on web in #191 (`DELETE /users/me`),
   absent on iOS. Apple App Store Review Guideline 5.1.1(v) requires apps that
   support account creation to also offer in-app account deletion. Without it,
   the build is likely to be rejected.
3. **Privacy / Terms links** — web now has `/privacy` and `/terms` (#193). The
   App Store requires a reachable privacy policy; the iOS app should link to the
   existing web pages.

Everything else on the todo side (CRUD, reorder, recurring todos, URL cards,
smart create, sync, settings) is already at parity between web and iOS.

## Solution

The backend already supports all three; this is iOS client work only. No API,
schema, or migration changes.

### 1. Google Tasks import

Architecture mirrors web: the client never handles Google tokens. The API
(`POST /todos/import/google-tasks`) pulls the user's Google OAuth token from
Clerk server-side, fetches tasks, inserts/dedupes, enriches, and broadcasts a
sync. The client's responsibilities:

- **Connect Google with the Tasks scope.** Use Clerk iOS's prebuilt
  `UserProfileView` with the `.userProfileOAuthConfig` modifier requesting the
  additional scope `https://www.googleapis.com/auth/tasks.readonly`. The SDK
  handles the OAuth web session and reconnect-for-scope flow. (Chosen over a
  custom `createExternalAccount` + `ASWebAuthenticationSession` flow for
  robustness and less code.)
- **Trigger the import.** `POST /todos/import/google-tasks` (no body). Response:
  `{ imported, skipped, importedIds: [String], datedTodos: [{id, title, dueDate}] }`.
- **Pull results.** `await syncService.sync()` — `sync()` already requests all
  todos (`lastSyncedAt: nil`), so imported rows land in SwiftData.
- **Surface the result.** Inline status in Settings ("Imported N tasks") /
  error message on failure. If the import returns the API's 400 "connect your
  Google account" error, nudge the user to connect first.
- **Repeat-schedule review (optional, matches web).** Google doesn't share
  repeat schedules, so imported dated todos come across as one-offs. Show a
  lightweight review sheet listing `datedTodos` with a frequency picker each
  (reuse `Recurrence` + the existing recurrence UI pattern from
  `TodoEditSheet`), writing `recurrence` on the local `TodoItem` and syncing.
  Cuttable for a first pass.

`googleTaskId` does **not** need to be added to the iOS `TodoItem` SwiftData
model: Swift `Codable` ignores unknown keys in the sync payload, and dedupe is
server-side only.

### 2. In-app account deletion

- Add `APIService.deleteMe()` → `DELETE /users/me`.
- Settings "Danger zone" section → destructive confirmation alert → call
  `deleteMe()` → clear the user's local SwiftData → `authService.signOut()`.
- Mirrors web `SettingsModal` handleDeleteAccount.

### 3. Privacy / Terms links

- Settings "About" section with links to `https://nylonimpossible.com/privacy`
  and `https://nylonimpossible.com/terms`.

## Implementation

### Files to modify

- `src/ios/.../Services/APIService.swift` — add `GoogleTasksImportResponse` +
  `ImportedDatedTodo` models, `importGoogleTasks()` and `deleteMe()` methods;
  add both to the `APIProviding` protocol.
- `src/ios/.../Services/SyncService.swift` — expose a helper to run a sync +
  clear local data on account deletion (reuse existing `sync()` / `reset()`).
- `src/ios/.../Views/Components/SettingsView.swift` — add Import, Danger zone,
  and About sections; present Clerk `UserProfileView` sheet for Google connect;
  wire the import button + status; present the review sheet.
- `src/ios/.../Views/Components/` — new `ImportReviewSheet.swift` (dated-todo
  repeat-schedule review). Optional.
- `src/ios/.../Services/UserPreferencesService.swift` or a small new service —
  house the import + delete orchestration so `SettingsView` stays thin.

### Key considerations

- **Clerk iOS SDK**: v1.0.1, already a dependency. Confirmed it exposes
  `user.createExternalAccount(provider:redirectUrl:additionalScopes:)` and the
  `UserProfileView().userProfileOAuthConfig([...])` prebuilt path. Verify the
  exact field names for reading a connected Google account's approved scopes
  during implementation; if unavailable, gate the import button optimistically
  and rely on the API's 400 to prompt a connect.
- **Sync preserves `googleTaskId`**: iOS edits push field-level `TodoChange`s
  that omit `googleTaskId`; confirm the server sync handler doesn't null it on
  update (server concern, verify once).
- **No toast system on iOS**: surface success/errors via inline `Text` and/or
  `.alert`, consistent with the existing Settings error handling.
- Run `swiftlint` from `src/ios/Nylon Impossible/` before finishing.

## Acceptance criteria

- [ ] Settings shows an Import section; connecting Google requests the
      `tasks.readonly` scope and completes via the Clerk web session.
- [ ] "Import from Google Tasks" imports open tasks, they appear in the list
      after sync, re-running skips already-imported tasks, and a result message
      is shown.
- [ ] Dated imports can be given a repeat schedule via the review sheet (or this
      is explicitly deferred).
- [ ] Settings has a Danger zone that deletes the account (`DELETE /users/me`),
      clears local data, and signs out.
- [ ] Settings links to the live Privacy and Terms pages.
- [ ] `swiftlint` passes.

## Implementation notes

- **Deviation from the chosen approach**: the prebuilt Clerk `UserProfileView`
  path was selected, but on inspection the pinned SDK (**clerk-ios 1.0.1**) can't
  request per-connection scopes — `UserProfileAddConnectedAccountView` calls
  `createExternalAccount(provider:)` with no `additionalScopes`, and there is no
  `userProfileOAuthConfig` modifier in this version. Switched to the **custom
  flow**: `user.createExternalAccount(provider: .google, additionalScopes:
  [tasks.readonly])` followed by `account.reauthorize()` (the SDK drives the
  `ASWebAuthenticationSession` inside `reauthorize()`). This also yields a native,
  on-brand Settings UI. Alternative if we ever want the prebuilt view: configure
  the Tasks scope globally in the Clerk dashboard, or upgrade the SDK.
- `googleTaskId` preservation verified: `src/api/src/handlers/sync.ts` never
  references it and updates todos field-by-field, so iOS edits (which omit it)
  don't null it — re-import stays idempotent.
- Verified against `clerk-ios` 1.0.1 source: `ExternalAccount.provider: String`,
  `.approvedScopes: String` (space-separated), `.reauthorize()`;
  `User.externalAccounts`, `User.createExternalAccount(provider:redirectUrl:additionalScopes:)`.
- Not yet built in Xcode in this environment (xcodebuild SPM resolution hung);
  needs a local build + manual test pass before moving to `done/`.

## AI toggle gating (paid only)

The AI toggle must only be **visible to paid (`plan == "pro"`) users** — AI is
held back for the public launch, and free users' `aiEnabled` is already ignored
server-side (`useAI = aiEnabled && plan === "pro"`). `plan` wasn't exposed to
clients, so it's now threaded through:

- `src/api/src/handlers/users.ts` — `GET`/`PATCH /users/me` return `plan`.
- Web: `useUser.ts` `User.plan`; `SettingsModal.tsx` renders the AI block only
  when `user.plan === "pro"`. (`AiToggle.tsx` is dead code — not rendered.)
- iOS: `APIUser.plan` (optional for API-version resilience);
  `UserPreferencesService.isPro`; `SettingsView` shows the AI section only when
  `isPro`. Mock + a `GET /users/me returns plan` API test added.

## Status of work

- [x] `APIService`: `GoogleTasksImportResponse`/`ImportedDatedTodo`,
      `importGoogleTasks()`, `deleteMe()`, protocol + `MockAPIService` updates.
- [x] `SettingsView`: Import, About (privacy/terms), Danger zone sections;
      Google connect + import + delete flows.
- [x] `HeaderView`: inject `SyncService`/`AuthService` into the Settings sheet.
- [x] `ImportReviewSheet`: post-import repeat-schedule review.
- [x] AI toggle gated to paid users across API + web + iOS.
- [x] Web + API: typecheck, tests (135 web / 272 api), Biome check all green.
- [ ] Xcode build + manual test (connect, import, re-import, review, delete;
      confirm AI section hidden for a free user, shown for pro).

## Dependencies

- Related to: `plans/done/2026-03-21-repeating-todos.md` (recurrence types
  reused by the review sheet), web #193 (Google Tasks import), web #191
  (self-serve account deletion).

---

## Overview

This work brought the iOS client up to feature parity with the web app for a public, todo-only launch, and made two supporting changes across the stack. The launch was deliberately scoped to the todo experience: AI and other paid features were held back, so the visible surface needed to match web while the paid machinery stayed dormant. Three iOS gaps were closed: **Google Tasks import** (the headline feature, letting people bring existing tasks across), **in-app account deletion** (an App Store Review Guideline 5.1.1(v) requirement for any app with account creation — without it the build would likely be rejected), and **Privacy / Terms links** (App Store requires a reachable privacy policy). Alongside the iOS work, **AI was gated to paid (`plan === "pro"`) users** everywhere so the toggle is hidden at launch, and the **admin user-edit endpoint was generalized** so an operator can adjust plan/AI/location from the admin panel. No database schema or migration changes were needed — the backend already supported import and deletion; the only server change was threading `plan` out to clients and broadening the admin endpoint.

## Architecture

The import flow keeps Google tokens entirely server-side, mirroring web. iOS connects the account and triggers the import, but never touches OAuth tokens itself:

- **iOS import (`SettingsView.swift`, `APIService.swift`, `ImportReviewSheet.swift`):** The client connects Google via Clerk's `user.createExternalAccount(additionalScopes: ["https://www.googleapis.com/auth/tasks.readonly"])` followed by `account.reauthorize()` (which drives the `ASWebAuthenticationSession` and refreshes `approvedScopes`). Import readiness is derived by checking the connected Google account's space-separated `approvedScopes` for the Tasks scope. Import calls `POST /todos/import/google-tasks` (no body) returning `GoogleTasksImportResponse { imported, skipped, importedIds, datedTodos }`, then runs a sync to pull the new rows into SwiftData. Because Google doesn't export repeat schedules, `datedTodos` feed a post-import `ImportReviewSheet` where each dated import gets an optional frequency; results are written to SwiftData immediately but the network sync is deferred to a single `syncAfterAction()` on sheet dismiss (a Copilot-review perf fix). Status/errors surface as inline `Text` and `.alert` (no toast system on iOS).
- **iOS deletion:** `APIService.deleteMe()` → `DELETE /users/me` (server also removes the Clerk user), then a destructive confirmation `.alert` → `clearLocalData()` → `syncService.reset()` → `authService.signOut()`. Deletion errors render in their own Danger-zone state rather than reusing the import status (a review fix).
- **Paid-AI gating:** `GET`/`PATCH /users/me` (`src/api/src/handlers/users.ts`) now return `plan`. Web `useUser.ts` adds `User.plan` and `SettingsModal.tsx` renders the AI block only when `user.plan === "pro"`. iOS adds `APIUser.plan` (optional String, so it decodes against an older API and is treated as free when absent), surfaced via `UserPreferencesService.isPro`, gating the AI section in `SettingsView`.
- **Admin edit:** `PATCH /admin/users/:id/plan` (`updateUserPlan`) was generalized into `PATCH /admin/users/:id` (`updateUser`) in `src/api/src/handlers/admin.ts`, accepting optional `plan`, `aiEnabled`, and `location`, applying only present fields (rejecting empty updates with `no_valid_fields`) and returning the full updated row. The route change is in `src/api/src/index.ts`; `src/admin/src/api.ts` and `UserDetailPanel.tsx` add an inline Edit form. Email is intentionally left read-only (Clerk-sourced).

**Deviations from the original plan:**
- **Clerk OAuth approach changed.** The plan proposed the prebuilt `UserProfileView` + `.userProfileOAuthConfig` modifier for the Google connect flow. On inspection the pinned `clerk-ios` 1.0.1 can't request per-connection scopes (no `userProfileOAuthConfig` modifier; its add-account view calls `createExternalAccount(provider:)` with no scopes). The implementation switched to the **custom** `createExternalAccount(additionalScopes:)` + `reauthorize()` flow, which also yields a native, on-brand Settings UI.
- **Scope of PR grew beyond the plan.** The original plan document covered only the three iOS gaps. As shipped, the same PR also added **paid-AI gating** (API + web + iOS) and the **admin user-edit generalization** — both documented in later-added plan sections ("AI toggle gating", plus the admin work). These were not in the initial "Solution" and were folded in.
- **Repeat-schedule review was built, not deferred.** The plan marked `ImportReviewSheet` as "optional / cuttable for a first pass"; it shipped in full.
- **`googleTaskId` handling matched the plan.** As predicted, no `googleTaskId` field was added to the iOS `TodoItem` model — dedupe stays server-side, and the plan verified `src/api/src/handlers/sync.ts` never nulls it on field-level updates, so re-import stays idempotent.
- **Manual iOS testing remained open at merge.** The PR could not be built in the CI-less environment (xcodebuild SPM resolution issues), so web (135) and API (274) tests plus typecheck/Biome were green, but the iOS connect/import/re-import/review/delete and AI-visibility paths were merged as still-needs-manual-testing checklist items rather than verified.
