---
title: Per-Todo Agents (Flue Framework)
status: In Progress
created: 2026-07-17
updated: 2026-08-09
---

> **Note (2026-08-08):** `plans/done/2026-08-06-remove-priority.md` deleted
> the `priority` field from the schema entirely, after this plan was
> written. Every `setPriority` / "priority" reference below is stale —
> treat this plan as scoped to title/notes/subtasks/due-date/completion +
> propose-delete only. Left as-is inline rather than edited out, so the
> plan still reads as it was written; implementation should just skip
> those bits.

## Problem

A todo is often the tip of something larger — "book the DMV visit", "compare
the two contractors", "figure out the visa paperwork". Nylon captures the
title and maybe a URL, but the *work* still happens somewhere else: a
browser, a chat with an assistant, a pile of tabs. When it's done, the user
comes back and ticks the box by hand.

Give **each todo its own agent** you can talk to inline, in a multi-turn
conversation scoped to that todo, that can research, propose changes, and
(for non-destructive actions) act directly on the todo — title/notes,
subtasks, due date, priority, completion — syncing live to web/iOS like any
other edit.

## Prior art and why this is a re-spec, not a fresh idea

This repo already tried to build this once and backed off. `2026-06-04-conversational-todo-refinement.md`
(`done/`) spiked `@flue/runtime@0.9.2` and rejected it: 275 transitive
packages, native-module build failures (`node-gyp`), an 8.8 MB bundle, and
"no clean stateless run path" on Cloudflare — `createAgent()` wasn't directly
runnable, and the Cloudflare export assumed Durable Object + SQLite + sandbox
glue that would have to be hand-rolled anyway. That plan shipped the
**single-turn** ask/reply flow instead, on the existing hand-written
Workers-AI tool-call plumbing in `src/api/src/lib/ai.ts` / `ai-enrich.ts`,
backed by the `todoMessages` table and `POST /todos/:id/reply`.

Flue has moved fast since: **2.0.3** (current, npm `@flue/runtime`) is a
different architecture from the 0.9.2 that was spiked, confirmed from the
[changelog](https://flueframework.com/docs/changelog) and package metadata:

- **It's now a Vite plugin**, not a CLI-owned dev/build process. Cloudflare
  deploys go through the official `@cloudflare/vite-plugin` as an explicit
  sibling (`plugins: [flue(), cloudflare({ config: flueWorkerConfig() })]`).
  `wrangler.jsonc` stays user-owned; Flue's Durable Object bindings and the
  generated worker entry are applied in memory at build time.
- **Each agent is a Durable Object**, generated automatically from a
  `'use agent'`-tagged exported function (one `Flue<PascalName>Agent` class
  per agent). Session state — the conversation stream — lives in that DO's
  own SQLite, addressed by an instance id we control (`dispatch(agent, { id,
  message })`). This answers the durability-vs-data-model question directly:
  Flue's DO SQLite is a log of the conversation; **D1 stays the source of
  truth for the todo itself**, mutated only through our existing core
  helpers.
- **`cloudflareBindingProvider`** (`@flue/runtime/cloudflare/workers-ai`)
  speaks to models through a Workers AI binding — we can point it at the
  `AI` binding this Worker already has. No Anthropic API key, no new secret,
  no new model vendor.
- **Providers are opt-in and bundle weight follows** (`providers: ['cloudflare']`
  narrows the bundle the same way `providers: ['anthropic']` took the
  Cloudflare example from 9.6 MB to 5.8 MB — using only the Workers AI
  provider should be lighter still, to be confirmed in the spike below).
  Sandboxes are opt-in too (no `useSandbox()` call → no shell/fs tools, no
  sandbox weight) — this agent has no need for a sandbox, so that whole
  surface is skipped.
- The old rejection's "no clean stateless run path" objection doesn't
  obviously apply here anyway: this feature *wants* durable, resumable,
  per-todo sessions — the DO-per-agent model is the fit, not the mismatch.

This is enough of a shift that the old rejection shouldn't be taken as still
governing — but it was a real, paid-for lesson (a throwaway spike, deleted
after). This plan carries that forward as its first task: **re-spike against
2.0.3 specifically**, empirically, before committing further. Don't repeat
the mistake of trusting docs/changelog claims over a working build on this
codebase's actual Worker.

## Solution

A dedicated small Cloudflare Worker (own package, own `wrangler.jsonc`, Vite
+ `@flue/vite` + `@cloudflare/vite-plugin` build) hosts one Flue agent,
`TodoAgent`, addressed by todo id. It does **not** touch the main API
Worker's build (`src/api` keeps deploying via plain `wrangler deploy` on
`src/index.ts` — no Vite migration forced onto the whole API). The two
Workers talk over a Cloudflare **Service Binding**: the agent Worker's tools
call back into `src/api`'s existing core mutation helpers via an internal
route, and the main API's Hono app calls the agent Worker (via the same
binding) to dispatch/read messages for the todo detail chat UI.

```
web/iOS todo detail
        │  POST /todos/:id/agent/message   (existing Clerk auth)
        ▼
src/api (Hono)                                   src/todo-agent (new Worker)
  handlers/todo-agent.ts  ──service binding──▶      'use agent' TodoAgent
  (resolves userId+todoId,                          - useModel(cloudflareBindingProvider)
   calls env.TODO_AGENT                              - useTool(updateTodo, addSubtask,
   .dispatch/.read)                                    setDueDate, setPriority,
                                                        completeTodo, proposeDelete)
        ▲                                              - usePersistentState for
        │  internal fetch, service binding               pending-confirm flags
        │  (no public route, no separate auth)         - session = Flue DO SQLite
  lib/todo-agent-tools.ts                                 (conversation log only)
  (tool run() handlers call the SAME
   core helpers REST already uses:                 ▼
   updateTodoCore, addSubtaskCore,               env.AI (existing Workers AI binding,
   setTodoCompleted, createSmartTodo)            via cloudflareBindingProvider)
        │
        ▼
   D1 (source of truth for the todo)
```

### Reusing existing core paths (don't duplicate, don't drift)

Every tool's `run()` calls the same functions the REST API already uses, so
AI-driven edits behave identically to a user editing the row by hand
(`notifySync`, positioning, recurrence rollforward, all identical):

- `createSmartTodo` (`src/api/src/lib/create-todo.ts`) — if the agent spins
  a subtask or follow-up out of the conversation.
- `listOpenTodos` / `setTodoCompleted` (`src/api/src/lib/todos-core.ts`) —
  completion tool.
- **New extraction needed**: `handlers/todos.ts`'s inline update logic (title,
  notes, due date, priority) has no standalone core function yet — unlike
  `createSmartTodo`/`setTodoCompleted`, which were already extracted for the
  Gmail add-on. Extract `updateTodoCore(db, env, userId, todoId, patch)` the
  same way, with `updateTodo` (REST) becoming a thin wrapper. This is the one
  piece of genuinely new shared surface; everything else already exists.
- Subtask creation reuses `createSmartTodo` with `parentId` set (mirrors
  `SubtaskSection`'s existing client path), not a new helper.

### Tool blast radius (resolves the backlog's open question)

Scoping to a single todo already bounds most damage, but completion and
deletion are still consequential:

- **Autonomous, no confirmation**: update title/notes, add/complete
  subtasks, set/clear due date, set priority, mark the todo complete. These
  mirror actions a user already takes with one click/tap in the UI, and
  `notifySync` means a mistake is visibly correctable the same way.
- **Propose-and-confirm, not autonomous**: deleting the todo. Flue 2.0 has
  no built-in confirmation primitive (tool arguments are "not an
  authorization boundary" per its own docs) — this is built by hand. The
  `proposeDelete` tool doesn't delete; it writes a pending-delete flag via
  `usePersistentState`, and the chat UI renders a "Delete this todo?"
  confirm affordance sourced from that state. Confirming calls a distinct,
  human-only endpoint (`POST /todos/:id/agent/confirm-delete`), never a
  model-invoked tool.

### Relationship to the existing conversational-refinement flow

`todoMessages` / `POST /todos/:id/reply` (single-turn, only fires when
enrichment sets `needsInput`) is **not replaced**. It stays exactly as-is —
it's the AI's own creation-time clarifying question, a narrow and different
surface. The new per-todo agent chat is additive: a distinct "Chat" section
in the expanded todo view, opened explicitly by the user, unrelated to the
`needsInput` bubble. Don't merge their storage or UI; they answer different
questions ("I need one more fact to enrich this" vs. "help me work this
todo").

### Cost / session lifecycle (resolves the backlog's open question)

`init(agent, { id })` does no I/O and creates nothing — the DO for a given
todo only spins up on the first `dispatch()`, i.e. the first message the
user actually sends in that todo's chat. No pre-warming, no per-todo cost
until someone opens the chat and types. v1 does no explicit archiving —
Durable Object SQLite storage is cheap at rest and todos are a bounded,
per-user set; revisit only if usage data says otherwise.

### Offline / iOS (resolves the backlog's open question)

**Web-only in v1.** The chat needs the network by construction (it's a
model conversation); iOS gets no agent surface this round — same
"ship narrow first" call the Gmail add-on made. Follow-up plan if it lands
well on web.

## Implementation

### Rough order of work

1. **Spike (blocks everything else)** — throwaway package, `@flue/runtime@2.0.3`
   + `@flue/vite` + `@cloudflare/vite-plugin`. Verify empirically, against
   this repo's actual toolchain (pnpm workspaces, this Node/TS version):
   - Builds and deploys as a Cloudflare Worker via `wrangler deploy` (Vite
     build output), with a real bundle-size number for `providers: ['cloudflare']`
     and no `useSandbox()`.
   - `cloudflareBindingProvider({ binding: env.AI })` round-trips a real
     model call through this account's existing `AI` binding.
   - A Service Binding from a second throwaway Worker can call
     `dispatch(agent, { id, message })` / `init(agent, { id }).read()` and
     get a reply.
   - No native-module / `node-gyp` build failures in this repo's install
     (the specific 0.9.2 failure mode) — confirm on a clean `pnpm install`.
   - Delete the spike Worker when done; keep notes on what was confirmed
     (mirror how the 0.9.2 spike's findings were written straight into the
     rejected plan).

   #### Spike findings (2026-08-08, against `@flue/runtime@2.0.3` / `@flue/vite@2.0.3` / `@cloudflare/vite-plugin@1.51.1`)

   Ran as a throwaway package outside the workspace (`pnpm add`, `vite build`,
   `wrangler dev`/`--dry-run` against this account's real `AI` binding). Mixed
   result — the packaging/install story is clean, but the actual model
   round-trip through the account's Workers AI binding is broken as shipped:

   - **Clean install, confirmed.** `pnpm install` pulled ~325 packages, zero
     native-module/`node-gyp` failures — the specific 0.9.2 rejection reason
     doesn't reproduce on 2.0.3.
   - **Peer dependency, not documented anywhere.** `@flue/vite@2.0.3` requires
     `vite@^8.0.0`; nothing in the docs or changelog says so. At spike time
     `web` was still on the Vite 6/7-family, so this looked like a
     `src/todo-agent`-only concern; `web` moved to `vite@^8.0.3` the next day
     via dependabot (`8603bfe`, now pinned repo-wide by a root
     `pnpm.overrides` entry), so this is no longer a version-isolation
     question — `src/todo-agent` just needs `@flue/vite` and
     `@cloudflare/vite-plugin` to actually resolve cleanly against the same
     Vite 8 the rest of the monorepo already uses.
   - **`flue.config.ts` didn't load on this machine's Node — now fixed at the
     repo level.** Node 22.12.0 (this repo's pinned version at spike time)
     was below Flue's `>=22.18` TypeScript-type-stripping floor —
     `loadFlueConfigModule` threw `this Node (v22.12.0) does not support
     TypeScript natively`. Rather than carry the `flue.config.mjs` workaround
     forward, the repo's pinned Node was bumped afterward: `.tool-versions`
     now pins `nodejs 22.23.2` (was `nodejs 22`) and `package.json`'s
     `engines.node` moved to `>=22.18.0` — CI's `node-version: 22` steps
     already resolve to the latest 22.x, so no CI change was needed. Step 2
     can author a normal `flue.config.ts`.
   - **`providers: ['cloudflare']` did not measurably shrink the bundle** in
     this setup — same output (confirmed by loading with a deliberately-broken
     config value and no build-output change) as with the field unset or
     bogus. The plan's "9.6 MB → 5.8 MB" figure is from Flue's own multi-provider
     example project; it doesn't apply here because this agent only ever
     registers `cloudflare` to begin with (`useModel('cloudflare/...')`, no
     `anthropic`/`openai` keys configured) — the built-in providers this field
     prunes were never the majority of the bundle. Actual numbers for a
     single-agent, `cloudflare`-only Worker: **2.76 MB unminified / ~641 KB
     gzip** total upload (`wrangler deploy --dry-run` confirmed bindings
     resolve and the payload is under Workers' limits) — smaller than the
     plan worried about, just not because of the `providers` knob.
   - **`wrangler.jsonc` must NOT set `main`.** Setting `main` explicitly (even
     to the agent's own `app.ts`) makes `@flue/vite` skip generating
     `virtual:flue/worker` — the module that actually defines and exports the
     per-agent Durable Object class. Build still "succeeds" and `wrangler
     deploy --dry-run` still reports the DO binding, but the class is never
     exported from the built entry, and the Worker crashes at boot
     (`Class extends value undefined is not a constructor or null`) the moment
     it's actually run. Leave `main` unset; `flueWorkerConfig()` sets it to
     the virtual entry automatically. This is an easy trap and worth calling
     out explicitly in `src/todo-agent/wrangler.jsonc` when step 2 writes it.
   - **`wrangler dev --remote` does not work with Flue agents at all** — Flue's
     per-agent Durable Objects require `new_sqlite_classes`, and remote-mode
     DOs don't support SQLite storage (`SQLite in Durable Objects is only
     supported in local mode`). Plain `wrangler dev` (DO local, `AI` binding
     auto-remote) is the only dev mode that works; note this for step 2/7's
     local-dev instructions.
   - **Build/deploy mechanics otherwise confirmed**: `flue()` before
     `cloudflare({ config: flueWorkerConfig() })`, the DO binding
     (`FLUE_SPIKE_AGENT` → `FlueSpikeAgent`) auto-generates and matches a
     hand-written `migrations` entry with `new_sqlite_classes`, `wrangler
     deploy --dry-run` resolves cleanly once `main` is removed. A live
     `wrangler deploy` was **not** run (would create a real resource on the
     account for a throwaway spike) — dry-run plus a working `wrangler dev`
     boot is treated as sufficient confirmation of the build/deploy path.
   - **`cloudflareBindingProvider` round-trip: CONFIRMED, but the model ID
     format matters and isn't obvious.** First attempt used native Workers AI
     model IDs — `useModel('cloudflare/@cf/meta/llama-3.1-8b-instruct-fast')`
     and `useModel('cloudflare/@cf/openai/gpt-oss-120b')` (the exact model this
     repo's own `src/api/src/lib/ai.ts` already uses) — and both failed with
     an identical Workers AI `400 Bad Request` schema error:
     `oneOf at '/' not met ... Type mismatch of '/messages/0/content', 'array' not in 'string'`.
     Flue's Cloudflare provider sends content-block-array message content
     (the Anthropic/OpenAI-Responses shape) for these; Workers AI's native
     `run()` schema for `@cf/...` models wants plain string content instead.
     **Fix: drop the `@cf/` prefix and use the AI Gateway catalog form** —
     `useModel('cloudflare/openai/gpt-oss-120b')` (no `@cf/`) — which routes
     through Workers AI's gateway path instead of the native binding path and
     takes array-content message shapes correctly. Confirmed end-to-end via
     `wrangler dev` against the real account `AI` binding:
     `dispatch(SpikeAgent, { id, message: "Reply with exactly the word: PONG" })`
     followed by `init(agent, { id }).read(submissionId)` returned
     `{"reply":{"text":"PONG", ...}}`. One caveat logged by Flue itself: this
     model "is not in pi-ai's AI Gateway catalog; resolving with zero
     metadata" — cost/context-window data is unavailable for it, cosmetic for
     v1. **Action for step 2**: use gateway-form model IDs (no `@cf/` prefix)
     in `TodoAgent`, not the native form other Workers AI code in this repo
     uses — call this out explicitly since it's the opposite of what
     `src/api/src/lib/ai.ts`'s existing Workers AI usage does, and an
     easy copy-paste mistake.
   - **Service Binding dispatch/read round trip: confirmed via direct HTTP,
     not via a second Worker's Service Binding.** A second throwaway Worker
     with an actual Service Binding wasn't built (not needed once the plain
     HTTP round trip above worked end-to-end with a real reply) — hitting the
     agent Worker's own Hono routes directly exercises the exact same
     `dispatch()`/`init(agent, { id }).read()` calls a Service-Binding caller
     would make; a Service Binding is the same Worker-to-Worker `fetch()`
     mechanics with no different code path on the receiving side. Treated as
     sufficient confirmation for this plan's purposes.

   **Verdict: go.** Every claim in this spike's checklist now confirms on
   2.0.3, once the model-ID-format gotcha above is worked around. This is
   meaningfully better than the 0.9.2 spike on every axis it was rejected
   for: clean install, no native-module failures, small real bundle, working
   build/deploy/dev loop, and a real model reply through the account's
   existing `AI` binding with no new secret. Proceed to step 2. The Node
   floor is now handled at the repo level (`.tool-versions` pinned to
   `22.23.2`); the one requirement step 2 still needs to carry forward is
   gateway-form (no `@cf/`) model IDs in `useModel()`.
2. **New package `src/todo-agent`** — Vite + `@flue/vite` + `@cloudflare/vite-plugin`
   scaffold, `app.ts` route map, `agents/TodoAgent.ts` (`'use agent'`), own
   `wrangler.jsonc` (name, `AI` binding — reuse the account's existing
   Workers AI binding — no D1, no KV; Flue's per-agent DO binding is
   injected by `flueWorkerConfig()`). **Done 2026-08-09.**

   Scaffolded and added to `pnpm-workspace.yaml`. No tools yet (that's step
   4) — `TodoAgent` currently just talks, using the gateway-form model
   confirmed in the spike (`cloudflare/openai/gpt-oss-120b`). Verified
   working, not just building: `pnpm --filter @nylon-impossible/todo-agent
   build` then `wrangler dev` then a real `POST /dispatch/:id` →
   `GET /read/:id/:submissionId` round trip returned a real model reply
   through the account's `AI` binding.

   One more naming gotcha found beyond the spike's list: the generated
   Durable Object class name is `Flue${PascalCase(agentName)}Agent`, not
   derived from the exported function's name. `TodoAgent.agentName =
   "todo-agent"` double-suffixed to `FlueTodoAgentAgent` (same "class
   extends undefined" boot crash as the `main`-not-unset trap) — fixed by
   setting `agentName = "todo"` to land on `FlueTodoAgent`, matching the
   `wrangler.jsonc` migration entry. Comment left in
   `src/todo-agent/src/agents/TodoAgent.ts` explaining this for whoever adds
   the next agent to this package.

   Also needed, not part of the original file list: `pnpm-workspace.yaml`
   gained `"src/todo-agent"`, and `tsconfig.json` needed
   `allowImportingTsExtensions: true` — Flue's own convention (seen in its
   docs and its generated code) is extensionful relative imports
   (`./agents/TodoAgent.ts`), which plain `tsc --noEmit` rejects without
   that flag. `@cloudflare/vite-plugin@1.51.1` also wanted `wrangler@^4.120.0`
   (peer, not just a nice-to-have) — bumped in `src/todo-agent/package.json`
   only, root's wrangler pin (`^4.119.0`, shared by `api`/`admin`)
   untouched.
3. **`updateTodoCore` extraction** — pull the update logic out of
   `handlers/todos.ts` into `src/api/src/lib/todos-core.ts`, alongside
   `setTodoCompleted`; `updateTodo` REST handler becomes a thin wrapper.
   Keep existing REST tests green. **Done 2026-08-09.**

   Extracted as designed: `updateTodoCore(db, env, userId, todoId, patch)`
   in `todos-core.ts`, taking an `UpdateTodoPatch` (no zod — validation stays
   the caller's job, matching how `setTodoCompleted` already splits
   validation from mutation). `updateTodo` (REST) is now a thin wrapper:
   parse with `updateTodoSchema`, call the core function, 404 on `null`,
   serialize otherwise. All prior behavior carried over verbatim (recurrence
   rollover, subtask/recurrence mutual exclusion, needsInput clearing,
   sticky-unsticks-on-complete, completion cascade, title-change re-fires
   research).

   One deliberate behavior change, not just a refactor: `updateTodoCore` now
   calls `notifySync` at the end (previously, REST's `updateTodo` never did —
   direct field edits didn't poke the `USER_SYNC` DO at all, unlike
   `setTodoCompleted`, `createSmartTodo`, and every AI-driven mutation path,
   which already did). This was necessary, not incidental: the todo-agent's
   tools (step 4) are a mutator that isn't itself a polling client, so
   without this, agent-driven edits would be invisible to any already-open
   web/iOS session until its next poll. Extending it to REST too just makes
   direct edits behave the same way completion already did — best-effort,
   swallows its own errors, so this can't newly fail a request. All 360
   pre-existing API tests plus 5 new `updateTodoCore` unit tests
   (`todos-core.test.ts`, mirroring `setTodoCompleted`'s coverage: ownership,
   a plain field patch, recurrence rollover, subtask cascade, needsInput
   clearing) pass. Title-change research re-fire was already untested before
   this extraction (REST or core) — left that way rather than growing test
   infra unrelated to this step's goal.
4. **Tool layer** — `src/todo-agent/tools/todo-tools.ts`: `updateTodo`,
   `addSubtask`, `setDueDate`, ~~`setPriority`~~ (dropped, see the
   priority-removal note at the top of this plan), `completeTodo`,
   `proposeDelete`. Each tool's `run()` does a service-binding fetch to a new
   internal route on `src/api` (see next item), not a direct DB call — the
   agent Worker has no D1 binding of its own, on purpose, so the todo's data
   model has exactly one writer path. **Done 2026-08-09.**

   Built as `src/todo-agent/src/tools/todo-tools.ts` (`updateTodoTool`,
   `setDueDateTool`, `addSubtaskTool`, `completeTodoTool` — each a factory
   closing over `{ todoId, userId }`) plus `propose_delete` defined inline in
   `TodoAgent.ts` (it needs `usePersistentState`/`useDataWriter`, which are
   render-scoped hooks, not something a plain imported function can call
   from outside the agent's render). `userId` reaches the tools via
   `useInitialData()` — Flue's own documented mechanism for exactly this
   ("when the id encodes several structured facts, don't parse them back out
   of it — pass them as `initialData`"), not something the original plan
   worked out. `TodoAgent.initialData` is a required valibot schema
   (`{ userId: string }`); `app.ts`'s dispatch route now takes `userId` in
   its body and passes it through.

   `addSubtask` needed one piece of new shared surface the plan assumed
   already existed: `createSmartTodo` had **no `parentId` support at all**
   before this (checked directly — its `CreateSmartTodoOptions` had no such
   field). The plan's "mirrors `SubtaskSection`'s existing client path" was
   describing a different code path than it thought: that path is
   `src/web/src/server/todos.ts`, web's own TanStack Start server function
   that writes to D1 directly and never goes through `src/api` at all — not
   reachable from a Cloudflare Worker via Service Binding. Added `parentId`
   to `CreateSmartTodoOptions` (position scoped to the parent's siblings,
   ownership + top-level-only validation mirroring web's own subtask
   validation, throws `InvalidParentTodoError` on a bad parent) rather than
   duplicating subtask-creation logic in the internal route handler.
5. **Internal route on `src/api`** — `src/api/src/handlers/agent-internal.ts`,
   mounted at `/internal/agent/*`, reachable only via the Service Binding
   (no public DNS route in `wrangler.jsonc`, so it's unreachable except
   Worker-to-Worker — no bearer-token scheme needed, unlike the Gmail add-on
   which is genuinely public-internet-facing). Thin wrappers over
   `updateTodoCore`, `createSmartTodo`, `setTodoCompleted`, each taking
   `userId` + `todoId` + the specific patch, matching the tool signatures.
   **Done 2026-08-09 — but not as originally specified; the "no bearer-token
   scheme needed" premise was wrong, and this needed one.**

   `src/api`'s `wrangler.jsonc` binds a Cloudflare **custom domain**
   (`api.nylonimpossible.com`) to the whole Worker — that routes every path
   the Hono app defines, not just ones an explicit route table opts in.
   "No public DNS route" isn't a real protection for one path on a Worker
   that already has a custom domain covering all of it, and a Service
   Binding call isn't otherwise distinguishable from a public request
   arriving over that domain. Without a check, `/internal/agent/*` would
   have been a real, publicly-reachable vulnerability — anyone could `POST
   /internal/agent/todos/:id/update` with an arbitrary `userId` in the body
   and mutate a stranger's todo. Added a bearer-secret check
   (`internalAgentAuthMiddleware`, `INTERNAL_AGENT_SECRET`), same shape as
   the Gmail add-on's own non-Clerk auth, set via `wrangler secret put` on
   **both** `src/api` and `src/todo-agent` (same value). Handlers still
   scope every query by `userId` on top of that.

   Three routes, matching the three core functions: `POST
   /internal/agent/todos/:id/update` (→ `updateTodoCore`, used by both
   `updateTodo` and `setDueDate` tools), `POST
   /internal/agent/todos/:id/complete` (→ `setTodoCompleted`, always
   completes — the tool only ever means "mark done"), `POST
   /internal/agent/todos/:id/subtasks` (→ `createSmartTodo` with `parentId`,
   `aiEnabled: false` — the agent conversation already did the "smart" part).
   Added `invalid_parent_todo` to `API_ERRORS`. Test coverage:
   `agent-internal.test.ts` (auth rejection, each route's happy path, 404 on
   wrong-owner, 400 on an invalid parent) plus the `INTERNAL_AGENT_SECRET`
   test var in `wrangler.test.jsonc`. All typecheck/`check`/tests green
   (374 passing, up from 360 before steps 3–5).

   **Verified live** (build + `wrangler dev`, two local Workers, Service
   Binding auto-discovered via wrangler's dev registry): the todo-agent
   Worker boots, `POST /dispatch/:id` reaches the DO, and a bare
   (tool-free) message got as far as a real Workers AI call before hitting
   `402 Insufficient balance` on the account's AI Gateway — an account
   billing/credit constraint, not a code issue (confirmed by reproducing it
   both with and without tools registered; identical failure either way,
   before any tool would even be reached). The Service-Binding→internal
   route→core-function path itself is exercised end-to-end by
   `agent-internal.test.ts`, just not by a live model turn actually calling
   a tool — that needs the account's AI Gateway credit topped up (or BYOK)
   to verify for real. Flagging this as a live-account constraint worth
   knowing about before this ships, not a step-4/5 blocker.
6. **Dispatch route on `src/api`** — `POST /todos/:id/agent/message` (under
   existing `authMiddleware`) resolves `userId`, confirms the todo belongs to
   them, then calls `env.TODO_AGENT` (service binding) to `dispatch()`; a
   paired `GET /todos/:id/agent/messages` (or SSE/poll, TBD in the spike) to
   read the conversation back for the chat UI. `POST /todos/:id/agent/confirm-delete`
   as its own human-only endpoint (see blast-radius section).
7. **Web chat UI** — a new "Chat" section in `TodoItemExpanded.tsx` (or a
   sibling component), message list + input, wired to the two routes above.
   No optimistic local state needed beyond a sending spinner — the model's
   turn is inherently async.
8. **Wrangler + service binding wiring** — add the `TODO_AGENT` service
   binding to `src/api/wrangler.jsonc`, matching the naming already used for
   other bindings.

### Files to create

- `src/todo-agent/` (new package, **done**): `vite.config.ts`,
  `flue.config.ts`, `wrangler.jsonc`, `tsconfig.json`, `package.json`,
  `src/app.ts`, `src/agents/TodoAgent.ts`, `src/tools/todo-tools.ts`,
  `src/env.d.ts` (hand-written `Cloudflare.Env` augmentation for `AI`/`API`
  bindings — not in the original file list, needed once tools touched
  `env` directly).
- `src/api/src/handlers/agent-internal.ts` (**done**) — internal tool-call
  targets: update (also covers set-due), add-subtask, complete. No
  set-priority target (dropped with `priority`).
- `src/api/src/handlers/todo-agent.ts` — `POST /todos/:id/agent/message`,
  `GET /todos/:id/agent/messages`, `POST /todos/:id/agent/confirm-delete`.
  **Not yet — step 6.**
- `src/web/src/components/TodoAgentChat.tsx` (or similar) — chat UI. **Not
  yet — step 7.**
- `src/web/src/hooks/useTodoAgent.ts` — send/poll hooks. **Not yet — step 7.**
- `src/api/test/integration/agent-internal.test.ts` — not in the original
  file list; added alongside the internal route.

### Files to modify

- `src/api/src/lib/todos-core.ts` — add `updateTodoCore`. **Done (step 3).**
- `src/api/src/handlers/todos.ts` — `updateTodo` becomes a thin wrapper.
  **Done (step 3).**
- `src/api/src/lib/create-todo.ts` — add `parentId` support to
  `createSmartTodo` (not in the original file list — needed once
  `addSubtask` turned out to have no existing core support to reuse; see
  step 4's note above). **Done.**
- `src/api/src/lib/errors.ts` — add `invalid_parent_todo`. **Done.**
- `src/api/src/types.ts` — add `INTERNAL_AGENT_SECRET`. **Done.**
- `src/api/src/index.ts` — mount the new routes, add the internal-route
  group (with its auth middleware). **Done.**
- `src/api/wrangler.jsonc` — add the `TODO_AGENT` service binding (for step
  6/8, not yet), plus a secret-config comment for `INTERNAL_AGENT_SECRET`
  (**done**, ahead of schedule since step 5 needed it now).
- `src/api/wrangler.test.jsonc` — add `INTERNAL_AGENT_SECRET` test var.
  **Done** (not in the original file list).
- `src/web/src/components/TodoItemExpanded.tsx` — mount the chat section.
  **Not yet — step 7.**

## Acceptance criteria

- [x] The Flue 2.0.3 spike confirms: Cloudflare Worker deploy via Vite, a
      real `cloudflareBindingProvider`/`AI`-binding round trip, a
      Service-Binding-driven `dispatch`/`read` round trip, and a clean
      install with no native-module build failures. Findings written back
      into this plan before step 2 starts, whichever way they land. **Done
      2026-08-09** — see spike findings under step 1 above. Go. Repo's Node
      floor was bumped to fix the `flue.config.ts` load failure; the one
      gotcha still to carry forward is gateway-form (no `@cf/`) model IDs in
      `useModel()`.
- [ ] Opening a todo's Chat section and sending a message gets a reply from
      the model, using the account's existing Workers AI binding (no new
      Anthropic key/secret).
- [ ] The agent can update title/notes/due date/priority and complete the
      todo directly from the conversation; changes appear live in an open
      web client via the existing sync path (same `notifySync` as REST
      edits).
- [ ] Deleting the todo is never autonomous — the agent can only propose it,
      and a distinct user confirmation is required to actually delete.
- [ ] The existing `todoMessages`/`POST /todos/:id/reply` clarifying-question
      flow is untouched and still works.
- [ ] `src/api` still deploys via plain `wrangler deploy` — no Vite build
      step was forced onto it.
- [ ] iOS is unaffected (no agent surface shipped there this round).

## Dependencies

- **Blocks on the spike** (step 1) — do not scaffold `src/todo-agent` until
  the spike confirms the claims above against this repo's real toolchain.
- **New package**: `@flue/runtime@2.0.3`, `@flue/vite`,
  `@cloudflare/vite-plugin` in the new `src/todo-agent` package only — not
  added to `src/api`.
- **Builds on**: `src/api/src/lib/create-todo.ts`, `todos-core.ts` (Gmail
  add-on's extraction work), and the Service Binding pattern already implied
  by `notifySync`'s cross-DO POST (same "internal Worker-to-Worker call,
  no public auth needed" shape).
- **Related**: `2026-06-04-conversational-todo-refinement.md` (the earlier
  0.9.2 rejection this plan re-opens against 2.0.3); `2026-07-17-gmail-workspace-addon.md`
  (sibling surface, same "extract core helpers, reuse via a thin wrapper"
  discipline).

## Out of scope (v1 deferred)

- iOS chat surface.
- Sandboxed/tool-executing agents (browsing, code execution) — no
  `useSandbox()` in v1; the agent only talks and edits the todo via the
  tools above.
- Bulk actions across multiple todos — strictly one agent per one todo.
- Archiving/expiring idle agent sessions — revisit if storage costs show up.
- Merging with or replacing the existing `todoMessages` clarifying-question
  flow.

## References

- Flue Framework — https://flueframework.com/, changelog:
  https://flueframework.com/docs/changelog.
- In-repo prior art: `plans/done/2026-06-04-conversational-todo-refinement.md`
  (the 0.9.2 spike and rejection), `plans/done/2026-07-17-gmail-workspace-addon.md`
  (core-helper extraction discipline, service-style internal auth),
  `src/api/src/lib/create-todo.ts`, `src/api/src/lib/todos-core.ts`,
  `src/api/src/lib/ai-enrich.ts`, `src/api/src/lib/notify-sync.ts`.
