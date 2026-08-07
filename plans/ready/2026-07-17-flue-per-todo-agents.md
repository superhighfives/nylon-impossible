---
title: Per-Todo Agents (Flue Framework)
status: Ready
created: 2026-07-17
updated: 2026-08-06
---

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
2. **New package `src/todo-agent`** — Vite + `@flue/vite` + `@cloudflare/vite-plugin`
   scaffold, `app.ts` route map, `agents/TodoAgent.ts` (`'use agent'`), own
   `wrangler.jsonc` (name, `AI` binding — reuse the account's existing
   Workers AI binding — no D1, no KV; Flue's per-agent DO binding is
   injected by `flueWorkerConfig()`).
3. **`updateTodoCore` extraction** — pull the update logic out of
   `handlers/todos.ts` into `src/api/src/lib/todos-core.ts`, alongside
   `setTodoCompleted`; `updateTodo` REST handler becomes a thin wrapper.
   Keep existing REST tests green.
4. **Tool layer** — `src/todo-agent/tools/todo-tools.ts`: `updateTodo`,
   `addSubtask`, `setDueDate`, `setPriority`, `completeTodo`,
   `proposeDelete`. Each tool's `run()` does a service-binding fetch to a new
   internal route on `src/api` (see next item), not a direct DB call — the
   agent Worker has no D1 binding of its own, on purpose, so the todo's data
   model has exactly one writer path.
5. **Internal route on `src/api`** — `src/api/src/handlers/agent-internal.ts`,
   mounted at `/internal/agent/*`, reachable only via the Service Binding
   (no public DNS route in `wrangler.jsonc`, so it's unreachable except
   Worker-to-Worker — no bearer-token scheme needed, unlike the Gmail add-on
   which is genuinely public-internet-facing). Thin wrappers over
   `updateTodoCore`, `createSmartTodo`, `setTodoCompleted`, each taking
   `userId` + `todoId` + the specific patch, matching the tool signatures.
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

- `src/todo-agent/` (new package): `vite.config.ts`, `flue.config.ts`,
  `wrangler.jsonc`, `app.ts`, `agents/TodoAgent.ts`, `tools/todo-tools.ts`.
- `src/api/src/handlers/agent-internal.ts` — internal tool-call targets
  (update, add-subtask, set-due, set-priority, complete).
- `src/api/src/handlers/todo-agent.ts` — `POST /todos/:id/agent/message`,
  `GET /todos/:id/agent/messages`, `POST /todos/:id/agent/confirm-delete`.
- `src/web/src/components/TodoAgentChat.tsx` (or similar) — chat UI.
- `src/web/src/hooks/useTodoAgent.ts` — send/poll hooks.

### Files to modify

- `src/api/src/lib/todos-core.ts` — add `updateTodoCore`.
- `src/api/src/handlers/todos.ts` — `updateTodo` becomes a thin wrapper.
- `src/api/src/index.ts` — mount the new routes, add the internal-route
  group.
- `src/api/wrangler.jsonc` — add the `TODO_AGENT` service binding.
- `src/web/src/components/TodoItemExpanded.tsx` — mount the chat section.

## Acceptance criteria

- [ ] The Flue 2.0.3 spike confirms: Cloudflare Worker deploy via Vite, a
      real `cloudflareBindingProvider`/`AI`-binding round trip, a
      Service-Binding-driven `dispatch`/`read` round trip, and a clean
      install with no native-module build failures. Findings written back
      into this plan before step 2 starts, whichever way they land.
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
