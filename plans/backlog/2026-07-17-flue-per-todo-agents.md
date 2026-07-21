---
title: Per-Todo Agents (Flue Framework)
status: Backlog
created: 2026-07-17
updated: 2026-07-17
---

# Per-Todo Agents (Flue Framework)

**Date**: 2026-07-17
**Status**: Backlog

## Problem / Opportunity

A todo is often the tip of something larger — "book the DMV visit", "compare the
two contractors", "figure out the visa paperwork". Right now Nylon captures the
title and maybe a URL, but the *work* still happens somewhere else: a browser,
a chat with an assistant, a pile of tabs. When it's done, the user comes back and
ticks the box by hand.

The opportunity: give **each todo its own agent** you can talk to inline. Open a
todo, and there's a conversation attached to it. You can:

- **Discuss / research** — "what do I actually need to bring to renew a passport?"
  with the agent doing the digging.
- **Delegate bounded tasks** — ask it to do small, safe things on your behalf and
  report back (draft text, pull together options, summarise a linked page).
- **Let it act on the todo itself** — update the title/notes, add subtasks, set or
  clear a due date, split into follow-ups, or mark done — all scoped to *this*
  todo via typed tools, with the change syncing live to web + iOS like any other
  edit.

The agent's context is the todo: its title, notes, URL, due date, and history.
One agent per todo, not one global chatbot.

## Why Flue

[Flue Framework](https://flueframework.com/) is an open-source TypeScript agent
framework — "write once, deploy anywhere, use any LLM" — built around
`defineAgent()` with typed **tools**, markdown **skills**, **sandboxes**, and
**durable execution** (sessions persist in durable streams and resume after
interruption). This lines up unusually well with our stack:

- **Same runtime.** Flue deploys to Cloudflare, where the API Worker (Hono)
  already lives. An agent endpoint could be another route group on `src/api`
  rather than a new service in a new language.
- **Durable sessions fit "an agent per todo".** Each todo maps to a long-lived,
  resumable session keyed by todo id — conversation survives across app opens and
  device switches, which is exactly the persistence model we'd otherwise have to
  build by hand.
- **Typed tools are the safety boundary.** The "act on the todo" tools
  (update-title, add-subtask, set-due, complete) become Flue tools that call the
  existing core mutation paths, so the agent can only make changes we already
  expose through the app — no raw DB access.
- **Any-LLM.** Default to the latest Claude models (Opus 4.8 / Sonnet 5) via the
  Anthropic API, consistent with the existing AI smart-create path.

## Rough shape (to be specced later)

- New agent definition (`defineAgent`) whose tools wrap our core todo mutations,
  scoped to a single todo id resolved from the authenticated Clerk user.
- One durable session per todo; a `todo_agent_sessions` mapping (or reuse the
  todo id directly) so reopening a todo resumes the same thread.
- A conversation surface in the todo detail view on both web and iOS — messages
  stream in, tool calls render as inline "agent did X" affordances, and any todo
  mutation the agent makes flows back through the normal sync path (react-query
  invalidation on web, the iOS sync channel) so the UI updates live.
- Reuse the Clerk-held identity for auth; the agent acts *as* the user on *their*
  todo only.

## Open questions

- **Cost / rate control.** An agent per todo could mean a lot of sessions. What
  are the guardrails — is the agent lazily created only when the user opens the
  conversation? Do idle sessions get archived?
- **Tool blast radius.** Which mutations is the agent allowed to make
  autonomously vs. propose-and-confirm? Deleting a todo or bulk-editing feels
  like it needs an explicit human confirm; ticking a subtask maybe not.
- **Durability vs. our data model.** Flue keeps session state in durable streams —
  where does that live relative to our D1 database, and what's the source of
  truth when the agent edits a todo (Flue tool call → core mutation → D1, with the
  session as a log)?
- **Deploy footprint.** Does Flue run as part of the existing API Worker or as a
  separate deployable? What does it add to the Cloudflare setup (Durable Objects,
  Workflows, extra bindings)?
- **Offline / iOS.** The conversation needs the network; how does the todo detail
  view degrade when offline, and does the agent surface even show up on iOS in v1?
- **Overlap with smart-create.** We already have an AI path for turning text into
  a todo. Is the per-todo agent a superset of that, or a distinct surface that
  reuses the same model plumbing?

## References

- Flue Framework — https://flueframework.com/
- Prior art in-repo: the AI smart-create path; the Google Tasks importer
  (`import-google-tasks.ts`) as an example of acting on a user's behalf via a
  Clerk-held connection.
- Related backlog: `2026-07-17-gmail-workspace-addon.md` (also extends Nylon with
  a server-side surface on the existing API Worker).
