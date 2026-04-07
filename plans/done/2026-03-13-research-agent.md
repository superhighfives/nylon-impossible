# Research Agent for Todos

**Date:** 2026-03-13  
**Updated:** 2026-03-27  
**Status:** Ready  
**Scope:** API + Web (iOS out of scope for this plan)

## Overview

When a todo has research intent ("Dogs ages vs human ages", "Best practices for React Server Components", "Book dinner at San Jalisco"), the system automatically researches the topic in the background and attaches a 2-3 sentence summary with numbered citations to the todo. Research runs after creation via `waitUntil`, same pattern as the existing AI enrichment.

## What triggers research

| Input | Research? | Type |
|-------|-----------|------|
| "Feed dog" | No | — |
| "Buy groceries" | No | — |
| "Dogs ages vs human ages" | Yes | `general` |
| "Best practices for React Server Components" | Yes | `general` |
| "How does OAuth work" | Yes | `general` |
| "Book dinner at San Jalisco" | Yes | `location` |
| "Drinks at The Rusty Nail" | Yes | `location` |

## What research produces

A 2-3 sentence summary with numbered citations [1][2] linking to source URLs shown as cards. For location todos, sources are the venue website + Google Maps.

---

## Phase 1: Update `TodoEnrichment` shape

### Current shape (in `src/api/src/lib/ai.ts`)

```ts
export interface TodoEnrichment {
  title: string;
  urls?: string[];
  dueDate?: string;
  priority?: "high" | "low";
}
```

### New shape

```ts
export interface TodoEnrichment {
  title: string;
  urls?: string[];
  dueDate?: string;
  priority?: "high" | "low";
  research?: {
    type: "general" | "location";
  };
}
```

The presence of `research` is the signal — no separate `needsResearch` boolean needed.

### Tool definition changes

Add to `enrichTodoTool.parameters.properties`:

```ts
research: {
  type: "object",
  description: "Set when the todo has research intent - questions, comparisons, 'look up', venue references. Do NOT set for plain action items ('buy milk', 'call mom').",
  properties: {
    type: {
      type: "string",
      enum: ["general", "location"],
      description: "'location' for venue/place todos (restaurants, bars, cafes). 'general' for everything else."
    }
  },
  required: ["type"]
}
```

### System prompt additions

Add research detection examples to the prompt:

```
- "Dogs ages vs human ages" → { title: "Dogs ages vs human ages", research: { type: "general" } }
- "How does OAuth work" → { title: "How does OAuth work", research: { type: "general" } }
- "Book dinner at San Jalisco" → { title: "Book dinner at San Jalisco", research: { type: "location" } }
- "Buy milk" → { title: "Buy milk" } (no research - plain action)
- "Call mom" → { title: "Call mom" } (no research - plain action)
```

### Update `hasEnrichment` check in `enrichTodo`

```ts
const hasEnrichment =
  (enrichment.urls && enrichment.urls.length > 0) ||
  enrichment.dueDate ||
  enrichment.priority ||
  enrichment.research; // add this
```

### Update tests in `src/api/test/unit/ai.test.ts`

---

## Phase 2: Data model

### Migration 1: `todo_research` table

```sql
CREATE TABLE todo_research (
  id TEXT PRIMARY KEY NOT NULL,
  todo_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed'
  research_type TEXT NOT NULL DEFAULT 'general', -- 'general' | 'location'
  summary TEXT,
  researched_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE INDEX idx_todo_research_todo_id ON todo_research(todo_id);
CREATE INDEX idx_todo_research_status ON todo_research(status);
```

### Migration 2: `research_id` on `todo_urls`

```sql
ALTER TABLE todo_urls ADD COLUMN research_id TEXT REFERENCES todo_research(id) ON DELETE CASCADE;
CREATE INDEX idx_todo_urls_research_id ON todo_urls(research_id);
```

### Migration 3: `location` on `users`

```sql
ALTER TABLE users ADD COLUMN location TEXT;
```

### Drizzle schema updates (`src/shared/src/schema.ts`)

Add `todoResearch` table, add `researchId` to `todoUrls`, add `location` to `users`.

---

## Phase 3: Research execution

### New file: `src/api/src/lib/research.ts`

```ts
export async function executeResearch(
  db, ai, env, todoId, userId, query, researchType, researchId, userLocation?
): Promise<void>
```

**General research flow:**
1. Call `@cf/moonshotai/kimi-k2.5` with thinking + web search enabled, 60s timeout
2. Parse response: extract summary text + source URLs from citations
3. Insert source URLs into `todoUrls` with `researchId` set
4. Fetch URL metadata for each source in background
5. Update `todoResearch` → `status: "completed"`, `summary`, `researchedAt`
6. Notify sync

**Location research flow:**
Same as general, but prompt instructs the model to:
- Find the specific venue
- Write summary with address/description
- Return `[1]` = venue website, `[2]` = Google Maps URL
- If `userLocation` is set, use `"${query} near ${userLocation}"` as search context

**On failure:**
Update `todoResearch` → `status: "failed"`, notify sync.

### Update `src/api/src/lib/ai-enrich.ts`

After existing enrichment completes, check `enrichment.research`:

```ts
if (enrichment.research) {
  const research = await db.insert(todoResearch).values({
    id: crypto.randomUUID(),
    todoId,
    researchType: enrichment.research.type,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  }).returning().then(r => r[0]);

  // Dispatch research in background (it runs after enrichment completes)
  await executeResearch(db, ai, env, todoId, userId, originalText, enrichment.research.type, research.id, userLocation);
}
```

Note: `executeResearch` is awaited inside `waitUntil` — it's still background from the client's perspective since `enrichTodoWithAI` itself is in a `waitUntil`.

---

## Phase 4: API changes

### Update `POST /users/me` (PATCH handler)

Accept and persist `location` field:

```ts
const updateUserSchema = z.object({
  aiEnabled: z.boolean().optional(),
  location: z.string().max(200).nullable().optional(),
});
```

### Update sync endpoint (`src/api/src/handlers/sync.ts`)

`serializeTodo` needs to include research data. This requires a join or separate query.

```ts
// serializeTodo gets a research param
function serializeTodo(todo, urls, research) {
  return {
    ...existing fields...,
    research: research ? {
      id: research.id,
      status: research.status,
      researchType: research.researchType,
      summary: research.summary,
      researchedAt: research.researchedAt?.toISOString() ?? null,
    } : null,
    urls, // now includes researchId per URL
  };
}
```

`serializeUrl` needs to include `researchId`.

The sync query needs to LEFT JOIN `todo_research`.

### Pass `userLocation` to enrichment

In `smart-create.ts`, fetch the user's `location` from the DB and pass it to `enrichTodoWithAI`. Thread it through to `executeResearch`.

---

## Phase 5: Web types and server functions

### `src/web/src/types/database.ts`

```ts
export type ResearchStatus = "pending" | "completed" | "failed";
export type ResearchType = "general" | "location";

export interface SerializedResearch {
  id: string;
  status: ResearchStatus;
  researchType: ResearchType;
  summary: string | null;
  researchedAt: string | null;
}

// Update SerializedTodoUrl
export interface SerializedTodoUrl {
  // ...existing fields...
  researchId: string | null; // add
}

// Update TodoWithUrls
export interface TodoWithUrls {
  // ...existing fields...
  research: SerializedResearch | null; // add
}
```

### `src/web/src/server/todos.ts`

Update `serializeTodoWithUrls` to accept and serialize research. Update `getTodos` to fetch research records and join them.

---

## Phase 6: Web UI

### Settings modal — `src/web/src/components/SettingsModal.tsx`

Uses `@base-ui/react/dialog` (already installed at v1.3.0).

Triggered from the Header (e.g., a settings icon button alongside the `UserButton`).

Contains a single field for now: **Location** — plain text input, placeholder "e.g. Los Angeles, CA". Saved via PATCH `/users/me`. Displayed below a brief explanation: "Used to find local venues when researching location todos."

```tsx
import { Dialog } from "@base-ui/react/dialog";

export function SettingsModal() {
  return (
    <Dialog.Root>
      <Dialog.Trigger render={<Button variant="ghost" size="sm" shape="square" aria-label="Settings"><Settings size={16} /></Button>} />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-[70]" />
        <Dialog.Popup className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-gray-surface rounded-xl shadow-lg p-6 space-y-4">
            <Dialog.Title>Settings</Dialog.Title>
            {/* Location field */}
            <Field label="Your location" description="Used to find local venues when researching location todos.">
              <Input placeholder="e.g. Los Angeles, CA" ... />
            </Field>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button variant="primary" onClick={handleSave}>Save</Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Add the trigger button to `Header.tsx` alongside the existing `UserButton` (signed-in only).

### `ResearchSection` component — `src/web/src/components/ResearchSection.tsx`

Renders inside `TodoItemExpanded` above the URLs section.

| State | Display |
|-------|---------|
| No research | Hidden |
| Pending | "Researching..." + gray spinner, no refresh |
| Completed | Summary text with `[1]`, `[2]` inline + source URL cards with citation prefix |
| Failed | "Research failed." + "Try again" button |

Source URL cards reuse the existing `UrlCard` component (already in `TodoItemExpanded.tsx`) but with a `[N]` citation badge prefix. Only URLs with `researchId` matching this research record are shown in the Research section; user/extracted URLs continue to show in the existing Links section.

Refresh button (completed state): calls re-research endpoint.

### Re-research

New server function `reresearchTodo(todoId)` → calls `POST /todos/:id/research` which is idempotent: deletes existing `todoResearch` record (cascading to source URLs) and creates a fresh pending one, kicking off background research again.

### List view indicator

Update `TodoList.tsx`: when `todo.research?.status === "pending"`, show a spinner next to the title (same treatment as `aiStatus`).

### `TodoItemExpanded` update

Add `<ResearchSection research={todo.research} researchUrls={...} todoId={todo.id} />` between the save button and the Links section.

---

## Phase 7: API tests

Update `src/api/test/integration/smart-create.test.ts` and `src/api/test/integration/smart-create-ai.test.ts` to cover:
- `enrichment.research` returned from mock AI triggers `todoResearch` creation
- Research appears in sync response
- Re-research endpoint deletes and recreates

---

## Migrations (in order)

1. `0004_add_todo_research.sql` — new `todo_research` table
2. `0005_add_research_id_to_todo_urls.sql` — `research_id` column on `todo_urls`
3. `0006_add_user_location.sql` — `location` column on `users`

---

## Out of scope

- iOS (follow-up plan)
- Manual research trigger on existing todos (re-research only)
- Research history/versioning
- Editing the summary
- Rate limiting

---

## Acceptance criteria

- [ ] `enrichTodo` returns `research: { type }` for questions, comparisons, and venue references
- [ ] `enrichTodo` does NOT return `research` for plain action items
- [ ] `todoResearch` record created when `enrichment.research` is set
- [ ] Research summary and source URLs appear in sync response
- [ ] Web expanded todo shows Research section with pending/completed/failed states
- [ ] Source URLs show citation prefix `[N]` and are visually separate from user URLs
- [ ] Refresh button triggers re-research
- [ ] Settings modal opens from Header, saves location via PATCH `/users/me`
- [ ] Location is used as context in location research queries
- [ ] All existing tests pass; new tests cover research flow
