---
title: Repeating Todos
status: Complete
created: 2026-03-21
updated: 2026-03-21
---

# Repeating Todos

**Date:** 2026-03-21
**Status:** Ready

## Problem

Todos cannot currently repeat. Users who have recurring tasks (weekly reviews, monthly bill payments, daily habits) must manually recreate the same todo each time, which is tedious and easy to forget.

## Solution

Add a recurrence rule to todos. When a repeating todo is completed, its `dueDate` advances in place to the next occurrence and the `completed` flag is cleared — one row, advancing forward, instead of cloning a new row per occurrence.

## Recurrence patterns (v1)

A deliberately small set, all anchored on the todo's `dueDate`:

- **Daily** — repeat every day
- **Weekly** — repeat on the same day-of-week as `dueDate`
- **Monthly** — repeat on the same day-of-month as `dueDate` (clamped for short months: Jan 31 → Feb 28/29)
- **Yearly** — repeat on the same month + day as `dueDate`

Out of scope for v1: custom intervals (every 2 weeks), nth-weekday-of-month (third Sunday), multiple days per week, end dates, occurrence counts. The JSON shape leaves room to add these later without a migration.

## Resolved decisions

### Storage

A structured JSON column `recurrence` on the `todos` table, nullable. Shape for v1:

```json
{ "frequency": "daily" | "weekly" | "monthly" | "yearly" }
```

A todo with `recurrence = null` is non-repeating. Recurrence requires a `dueDate` — the rule has no meaning without an anchor, and the picker is disabled until a due date is set.

Chosen over an RRULE string because v1 patterns are simple, the JSON is directly readable from both Swift and TypeScript without a parser dependency, and additional fields (interval, byDay, etc.) can be added later without changing the storage format.

### Advance, don't clone

Completing a repeating todo:
1. computes the next `dueDate` from `frequency` + current `dueDate`
2. advances `dueDate` past "now" (skipping any missed occurrences in one step, so a daily todo left unchecked for a week doesn't backfill 7 advances)
3. clears `completed` back to `false`

History of past completions is not preserved in v1. If we later want a completion log, it's an additive table — not a reason to clone now.

### Eager advance, both client and server

- **Optimistic client advance**: on tick-to-complete, the client immediately advances `dueDate` and clears `completed` locally so the UI doesn't flash "done" and disappear from the today view.
- **Canonical server advance**: the sync/update handler re-computes the advance from the server's view of the row. The server's result is authoritative on conflict.

Both implementations live behind a shared helper `nextDueDate(recurrence, from, now)`, ported to TS and Swift with matching tests so the two paths agree. `from` is the todo's current `dueDate` (the anchor); `now` is the current wall-clock time. The helper advances from `from` by `frequency` repeatedly until the result is strictly greater than `now`, so a daily todo left unchecked for a week becomes a single advance to tomorrow rather than seven advances.

### Picker UI

A flat 5-option control: **None · Daily · Weekly · Monthly · Yearly**.

- iOS (`TodoEditSheet.swift`): SwiftUI `Picker` with `.menu` style.
- Web (`TodoItemExpanded.tsx`): the existing `Select` component in `src/web/src/components/ui/Select.tsx` (built on `@base-ui/react/select`).
- Disabled (with helper text) until a `dueDate` is set.
- The label reflects the anchor — e.g. "Weekly on Wednesday", "Monthly on the 14th" — computed from `dueDate` rather than stored.

### AI smart-create integration

The current smart-create path (`src/api/src/handlers/smart-create.ts`) takes raw text as the todo title and then runs `enrichTodoTool` from `src/api/src/lib/ai.ts` for URL/metadata enrichment — it does not extract structured fields like `dueDate` or recurrence from the input. v1 adds that extraction: either extend `enrichTodoTool` to also return optional `dueDate` and `recurrence` (same JSON shape as storage), or add a small dedicated extraction tool invoked from `smartCreate` before enrichment. Prompts like "remind me every Monday to review backlog" should produce a todo with `title: "review backlog"`, `dueDate` set to the next Monday, and `recurrence: { frequency: "weekly" }`. If the model returns a recurrence without a `dueDate`, the API derives one (e.g. the next matching weekday) before persisting.

## Notifications (v1: badge only)

The badge count is the number of todos where `completed = false` and `dueDate < startOfTomorrowLocal`, where `startOfTomorrowLocal` is midnight at the start of the next calendar day in the user's local timezone. `dueDate` is stored as a UTC timestamp (`integer("due_date", { mode: "timestamp" })` in `src/shared/src/schema.ts`), so each surface converts that timestamp into the local day before comparing. This intentionally treats "due today" and "overdue" the same way for badging.

- **iOS**: set `applicationIconBadgeNumber` to that count, recomputed after every sync and on app foreground (so the badge crosses the day boundary even without a sync).
- **Web**: call `navigator.setAppBadge(n)` (feature-detected) with the same count, recomputed in the `useTodos` hook and on tab visibility change.
- **Server-side computation** is unnecessary for v1 because we only badge on the user's own devices; both clients use their own local timezone.

Local notifications and push are explicitly out of scope for v1. Once the badge surface is in place we can decide whether scheduled local notifications add enough value to justify the permission prompt.

## Implementation outline

Rough order of work, not a contract:

1. **Schema** — add nullable `recurrence` JSON column to the `todos` table in `src/shared/src/schema.ts` (the canonical Drizzle schema; `src/web/src/lib/schema.ts` re-exports it). Generate the migration into `src/api/migrations/`. Mirror the field on `TodoItem.swift`. Extend `createTodoSchema` / `updateTodoSchema` in `src/web/src/lib/validation.ts`.
2. **Shared advance helper** — `nextDueDate(recurrence, from, now)` in both TS (`src/api/src/lib`, also reachable from the web) and Swift (`Nylon Impossible/Utils`), with parity tests.
3. **Server complete-handler** — when an update flips `completed` from `false` → `true` on a row with non-null `recurrence`, advance `dueDate` and keep `completed = false` instead of persisting the completion.
4. **Client optimistic advance** — same logic in `useTodos.ts` (web) and `TodoViewModel.swift` (iOS) before the network round-trip.
5. **Picker UI** — add to `TodoEditSheet.swift` and `TodoItemExpanded.tsx`.
6. **Badge** — wire `applicationIconBadgeNumber` in iOS and `navigator.setAppBadge` in the web sync path, using the local-day boundary defined in *Notifications*.
7. **AI** — extend `enrichTodoTool` in `src/api/src/lib/ai.ts` (or add a small extraction tool invoked from `src/api/src/handlers/smart-create.ts`) to surface optional `dueDate` and `recurrence` from the input text.

## Acceptance criteria

- [ ] A todo can be created or edited with a recurrence rule (Daily/Weekly/Monthly/Yearly) when a due date is set
- [ ] Completing a repeating todo advances its `dueDate` to the next future occurrence and clears `completed`, on both iOS and web
- [ ] Optimistic client advance and server advance produce the same next `dueDate` for the same input (covered by parity tests)
- [ ] The recurrence picker is available in the iOS edit sheet and the web expanded todo view, and is disabled without a due date
- [ ] App badge on iOS and web reflects the count of todos due today or overdue, and updates after sync and on completion
- [ ] AI smart-create can produce a repeating todo from natural-language input like "every Monday review backlog"

## Out of scope (deferred)

- Custom intervals, nth-weekday-of-month, multiple days per week, end dates / occurrence counts
- Per-occurrence edits or skip-this-one
- Completion history for repeating todos
- Scheduled local notifications and push notifications
