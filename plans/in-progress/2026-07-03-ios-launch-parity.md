# iOS launch parity: Google Tasks import, account deletion, legal links

**Date**: 2026-07-03
**Status**: In Progress

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
