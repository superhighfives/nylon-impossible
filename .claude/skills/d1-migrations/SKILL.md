---
name: d1-migrations
description: How to write D1 migrations for nylon-impossible without breaking live writes during deploy (expand/contract). Use when adding or editing anything under src/api/migrations/, changing the D1 schema, adding a column, or making a column NOT NULL, UNIQUE or otherwise stricter.
---

# D1 migrations: expand/contract

Deploy (`.github/workflows/web-deploy.yml`) **applies D1 migrations to the
shared D1 database (the `DB` binding) before rolling out the workers**: migrate,
then deploy API, then deploy web. Both the `web` and `api` workers bind the
same database, so during that window the schema is already new while the old
worker code is still serving.

A migration that **tightens** a constraint in one step therefore causes a brief
outage for live writes until rollout finishes. Concretely: `0023` made
`todos.list_id` NOT NULL with no default, and every write that omitted the
column 500'd (`NOT NULL constraint failed: todos.list_id`) for the length of the
deploy — surfacing on the client as `Error: No error message`.

For any constraint-tightening change, use **expand/contract**:

1. Migration A adds the column **nullable** (or with a safe default).
2. Deploy the workers that populate it.
3. Migration B (a later deploy) makes it `NOT NULL` / adds the strict
   constraint.

A single add-nullable-then-rebuild-NOT-NULL migration applied before the new
code deploys is what bites. Reordering CI to deploy-before-migrate just breaks
it the other way (new code expects a column the migration hasn't added yet), so
this is a migration-authoring discipline, not a CI tweak.

Anything under `src/api/migrations/` is a guarded area: the owner merges it
(CLAUDE.md, "Merging").
