# Remove Google Tasks import

Remove the Google Tasks import feature from the API, web, iOS, and database.

## Rollout

Shipped as a single PR. The column drop (`0029_drop_google_task_id`) runs
before the workers deploy, so old workers can briefly fail todo reads with
`no such column: google_task_id`. That was accepted because no one uses the
feature and the window is short. Don't treat this as a precedent for features
that are in use: those need expand/contract (see CLAUDE.md).

## Code removal

### API (`src/api`)

- Delete `src/handlers/import-google-tasks.ts`.
- `src/index.ts`: remove the import and the
  `app.post("/todos/import/google-tasks", …)` route.
- Delete `test/integration/import-google-tasks.test.ts`.
- `test/__mocks__/clerk-backend.ts`: remove `mockGetUserOauthAccessToken`
  and `getUserOauthAccessToken`. Only the import test uses them; the Gmail
  add-on tests don't.
- `src/lib/ensure-user.ts`: the D1 chunking comment cites
  `import-google-tasks.ts`. Drop that clause and keep the rest of the
  explanation.

### Web (`src/web`)

- `components/SettingsModal.tsx`: remove the whole "Import" `LayerCard`,
  `GOOGLE_TASKS_SCOPE`, `googleAccount`/`googleTasksReady`,
  `handleConnectGoogle`, `isConnectingGoogle`, and the
  `useImportGoogleTasks`/`useImportReview` hooks. Remove `useClerkUser` and
  `InfoTooltip` if nothing else uses them (`Loader` is still used on line ~175).
- `hooks/useTodos.ts`: delete `useImportGoogleTasks` (around lines 456–502).
- Delete `components/ImportReviewModal.tsx` and `hooks/useImportReview.tsx`.
- `routes/__root.tsx`: remove `ImportReviewContext.Provider`,
  `useImportReviewValue`, and `<ImportReviewModal />`.
- `components/TodoGrid.tsx`: remove `useImportReview()`. Stop passing
  `hiddenIds` to `getIncompleteOrder` (4 call sites) and stop passing
  `highlightIds`/`hiddenIds` to `TodoList`. Remove the `hiddenIds` filter at
  around line 974.
- `components/TodoList.tsx`: remove the `hiddenIds` parameter from
  `getIncompleteOrder` and the `highlightIds`/`hiddenIds` props. Remove the
  `highlighted` prop on the row and its `bg-accent-base` class, since the
  import glow is its only use.
- `lib/lists.ts`: same comment fix as `ensure-user.ts`.

### iOS (`src/ios`)

The project uses synced folders, so deleting files doesn't require editing
`project.pbxproj`.

- Delete `Views/Components/ImportSettingsSection.swift` and
  `Views/Components/ImportReviewSheet.swift`.
- `Views/Components/SettingsView.swift`: remove `ImportSettingsSection()`.
- `Services/APIService.swift`: remove `GoogleTasksImportResponse`, the
  protocol requirement, and the `importGoogleTasks()` implementation.
- `Tests/Mocks/MockAPIService.swift`: remove the `importGoogleTasks*` stubs.

Older App Store builds will still show the import button, and it will return
404 ("Couldn't import from Google Tasks. Try again."). That's acceptable; don't
keep a stub route for them.

### Schema

- Removed `googleTaskId` and `idx_todos_user_google_task` from `schema.ts`.
  `0029_drop_google_task_id.sql` drops the index before the column, because
  SQLite won't drop an indexed column.

### Verify

- `pnpm typecheck && pnpm lint && pnpm api:test` (plus web tests if present).
- `pnpm --filter @nylon-impossible/api db:check-meta`.
- Compile-check iOS. See the memory note on SDK/runtime mismatch: use a
  generic build, not a simulator test run.
- Run a final grep with no hits outside `migrations/` and `plans/done/`:
  `grep -rniE "google.?task|gtask|importReview|ImportSettings" src`.

## Outside the repo

- **Clerk dashboard:** remove `https://www.googleapis.com/auth/tasks.readonly`
  from the Google connection's additional scopes. Leave Google sign-in and the
  Gmail add-on config alone.
- **Google Cloud console:** remove the Tasks scope from the OAuth consent
  screen, and disable the Tasks API if nothing else uses it.
- Existing users' granted Tasks scopes go unused and need no action.
- **Memory:** delete `gtasks-api-drops-due.md` and its line in `MEMORY.md`
  once PR 1 merges.
