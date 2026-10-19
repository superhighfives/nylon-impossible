# Backend reset: moving data onto the baseline schema

Phase 1 of `plans/in-progress/2026-10-18-cohesive-redesign.md` squashed the D1
migrations into one `src/api/migrations/0000_baseline.sql` and dropped the
Completed system list, `users.location`, `users.plan` and
`users.hide_completed`. The existing databases can't take that baseline,
because their `d1_migrations` table records the 31 old migrations. So the
reset creates **new** production and preview databases, applies the baseline
to them, and copies the owner's data across with these two scripts. The old
databases stay untouched as a backup.

| Script | What it does |
| --- | --- |
| `export.mjs` | Runs SELECTs only against a pre-reset database and writes `export.json`. It reads users, lists, todos (subtasks included), todo_urls and gmail_addon_links for one account, or for all of them with `--all`. |
| `import.mjs` | Turns `export.json` into `import.sql` for a baseline database. It never talks to D1 itself. |

`import.mjs` makes these mappings (the header of the file has the detail):

- **Lists:** `sometime` becomes `someday` (a system list named "Sometime" is
  renamed "Someday"), and `completed` list rows are dropped.
- **Columns:** the removed columns are never exported.
- **Ids:** every id is kept, so todos keep their `list_id` and `parent_id`.
  The only exception is a dashless 32-hex id, which is rewritten to the
  dashed UUID form everywhere it appears.
- **Dangling references:** a todo whose list didn't survive moves to Today,
  and a subtask whose parent is missing becomes top-level. Both are reported
  as warnings.
- **Gmail add-on links** are left out unless you pass
  `--include-gmail-links`.

Both scripts write under `.wrangler/db-reset/` by default, which is
gitignored. **Don't commit these files: they hold real todo data.**

## Before you start

- Run everything from the repo root, on the `backend-reset` branch, after
  `pnpm install`.
- `wrangler whoami` must show the account that owns `nylon-impossible-db`.
- Pick a quiet window. The current TestFlight build only understands the
  `sometime` and `completed` list kinds, so web, API and iOS should change
  over together and you should accept a short gap.
- Have the new iOS build archived and ready to upload, so it can go out in
  the same window.

## Runbook

### 1. Back up the old production database

This step is read-only.

```sh
mkdir -p .wrangler/backups
npx wrangler d1 export nylon-impossible-db --remote \
  -c src/api/wrangler.jsonc \
  --output .wrangler/backups/pre-reset-$(date +%Y%m%d).sql
```

### 2. Export the old production data

Do this while the config still points at the old database. The export is
read-only.

```sh
node scripts/db-reset/export.mjs \
  --db DB -c src/api/wrangler.jsonc --remote \
  --email <your sign-in email>
```

Check the counts it prints against what you see in the app. Use `--user-id
user_…` instead of `--email` if your email changed.

### 3. Create the new databases

D1 names are unique per account, so the new databases need new names:

```sh
npx wrangler d1 create nylon-db
npx wrangler d1 create nylon-preview-db
```

Note the `database_id` printed for each.

### 4. Point the config at the new databases

Every wrangler command in the repo (package.json, CI and
`scripts/db-dev-bootstrap.sh`) addresses the database by its **binding**
(`DB`), not its name. So only the wrangler configs change. Look for the
`TODO(backend-reset)` comments and remove them as you go.

- **`src/api/wrangler.jsonc`:**
  - top-level `d1_databases[0]`: set `database_name` to `nylon-db`, set
    `database_id` to the new production id, and set `preview_database_id` to
    the new preview id.
  - `previews.d1_databases[0]`: set `database_name` to `nylon-preview-db` and
    `database_id` to the new preview id.
- **`src/web/wrangler.jsonc`:** make the same two changes (top-level and
  `previews`). The web worker binds the same database.
- **`src/api/wrangler.test.jsonc`:** optional. Tests run on miniflare and
  never reach the remote database, but changing it keeps the names
  consistent.

Nothing else references the ids. `grep -rn "effd712c\|4d45eefe" .` should
come back empty after this step (except for this README).

Commit this change on the branch. **Don't merge yet.**

### 5. Apply the baseline to both new databases

```sh
npx wrangler d1 migrations apply DB --remote -c src/api/wrangler.jsonc
npx wrangler d1 migrations apply DB --remote --preview -c src/api/wrangler.jsonc
```

Each should list exactly `0000_baseline.sql`.

### 6. Generate and apply the import

```sh
node scripts/db-reset/import.mjs        # add --include-gmail-links to keep the add-on link
npx wrangler d1 execute DB --remote -c src/api/wrangler.jsonc \
  --file .wrangler/db-reset/import.sql
```

Read every `! warning` line before applying. Then check that the counts
match the `-- Expect:` line at the top of `import.sql`:

```sh
npx wrangler d1 execute DB --remote -c src/api/wrangler.jsonc --command "
  SELECT (SELECT count(*) FROM users) AS users,
         (SELECT count(*) FROM lists) AS lists,
         (SELECT count(*) FROM todos) AS todos,
         (SELECT count(*) FROM todo_urls) AS links,
         (SELECT group_concat(system_kind) FROM lists WHERE kind = 'system') AS system_lists"
npx wrangler d1 execute DB --remote -c src/api/wrangler.jsonc --command "PRAGMA foreign_key_check"
```

The preview database starts empty. Previews provision users on demand through
`ensureUser`, so they don't need the import.

### 7. Deploy everything in one window

1. **Merge the branch.** CI's `web-deploy.yml` applies migrations to the new
   database (a no-op, since the baseline is already there), then deploys the
   API, then the web app.
   - **Don't merge before step 4 lands on the branch.** If CI runs `d1
     migrations apply` against the old database, it tries to run the baseline
     over existing tables and the deploy fails.
   - The same goes for the PR's own preview job, which applies migrations to
     the preview database. Push step 4 before CI runs a preview for the PR,
     or expect that job to fail until you do.
2. **Ship iOS.** Upload the build (`ios-release.yml`, or from Xcode) and
   install it from TestFlight. Until then, the old build sees lists it can't
   classify and has no Completed page.
3. **Check the web app** at nylonimpossible.com: the lists, todos, subtasks
   and links are there, Someday is named correctly, and checking a todo shows
   "Done · Undo".

### 8. Reconnect the Gmail add-on

Skip this step if you imported with `--include-gmail-links`.

Open the add-on in Gmail. The email fast path in `addon-auth.ts` may link it
automatically. If it doesn't, use the **Connect Nylon** card once.

### 9. Local development

Your local `.wrangler/state` has the old migration history. Reset it once:

```sh
pnpm db:fresh
```

### 10. Later: delete the old databases

Once the new databases have run cleanly for a while (a couple of weeks),
delete the old ones, along with the backup files if you no longer want them:

```sh
npx wrangler d1 delete nylon-impossible-db
npx wrangler d1 delete nylon-impossible-preview-db
```

## Rolling back

The old databases and workers are untouched until step 7. To roll back after
it, revert the merge. That restores the old wrangler ids and code, and CI
redeploys against the old database. Then reinstall the previous TestFlight
build. Anything written to the new database in between needs copying back by
hand.

## Testing the scripts locally

These steps were run before the branch was handed over. To repeat them:

1. Build a source database from the old migrations. Check out
   `main:src/api/migrations` into a temp dir and point a scratch wrangler
   config's `migrations_dir` at it.
2. Apply those migrations with `--local --persist-to <scratch>`, then seed
   sample data: Sometime and Completed lists, a dashless list id, subtasks, a
   repeating todo, links, and a Gmail link.
3. Run `export.mjs` against that scratch database with
   `--local --persist-to`.
4. Run `import.mjs` on the export.
5. Apply `0000_baseline.sql` and then `import.sql` to a second scratch
   database, and compare the counts. `PRAGMA foreign_key_check` should come
   back clean.

Never point `--persist-to` at the repo's `.wrangler/state`.
