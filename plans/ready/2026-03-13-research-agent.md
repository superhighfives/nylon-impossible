# Research Agent for Todos

**Date:** 2026-03-13
**Status:** Ready
**Scope:** API + Web (iOS later)

## Overview

Turn todos into research agents. When a user creates a todo with research intent ("Dogs ages vs human ages", "Best practices for React Server Components"), the system automatically researches the topic in the background and attaches findings to the todo.

## Core Behavior

- **Trigger**: AI detects research intent during todo extraction (questions, "look up", "how to", comparisons)
- **Output**: Brief 2-3 sentence summary with numbered citations [1], [2] linking to source URLs
- **Runs on**: Cloudflare Workers AI (`@cf/moonshotai/kimi-k2.5` with thinking + search)
- **UX**: Optimistic - todo appears immediately, "Researching..." indicator, results appear via WebSocket

### What Triggers Research

| Input | Research? | Why |
|-------|-----------|-----|
| "Feed dog" | No | Action item |
| "Buy groceries" | No | Action item |
| "Dogs ages vs human ages" | Yes | Comparison/question |
| "Look up white chocolate recipe" | Yes | Explicit research intent |
| "Best practices for React Server Components" | Yes | Information seeking |
| "How does OAuth work" | Yes | Question |

### What Research Produces

Brief 2-3 sentence summary with citations:

> Dogs age faster than humans, but the "7 years" rule is a myth - it varies by breed and size. [1] Small breeds generally live longer than large breeds, with a 1-year-old dog roughly equivalent to a 15-year-old human. [2]

Citations [1], [2] link to source URLs displayed as cards below the summary.

---

## Data Model

### New Table: `todoResearch`

```sql
CREATE TABLE todo_research (
  id TEXT PRIMARY KEY NOT NULL,
  todo_id TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' NOT NULL, -- 'pending' | 'completed' | 'failed'
  summary TEXT, -- markdown with [1], [2] references
  researched_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE INDEX idx_todo_research_todo_id ON todo_research(todo_id);
CREATE INDEX idx_todo_research_status ON todo_research(status);
```

### Modified: `todoUrls`

```sql
ALTER TABLE todo_urls ADD COLUMN research_id TEXT REFERENCES todo_research(id) ON DELETE CASCADE;
CREATE INDEX idx_todo_urls_research_id ON todo_urls(research_id);
```

### Relationships

- URLs with `researchId` → research sources (display with citation number)
- URLs without `researchId` → user/extracted URLs (display as today)
- One `todoResearch` per todo (1:1, enforced by unique constraint)
- Re-research: delete old `todoResearch` (cascades to source URLs), create fresh

---

## API Changes

### Remove `shouldUseAI`

Delete `src/api/src/lib/smart-input.ts`. All input goes through AI extraction.

### Update `extractTodos` Response

```ts
// Current
interface ExtractedItem {
  title: string;
  urls?: string[];
  dueDate?: string;
}

// New
interface ExtractedItem {
  title: string;
  urls?: string[];
  dueDate?: string;
  needsResearch?: boolean;
}
```

Update the AI prompt to detect research intent and return `needsResearch: true` for items that should be researched.

### Update `POST /todos/smart`

```ts
// Pseudocode
const extracted = await extractTodos(ai, text);

for (const item of extracted) {
  const todo = await createTodo(item);
  
  if (item.needsResearch) {
    const research = await createTodoResearch(todo.id, 'pending');
    
    // Background research
    c.executionCtx.waitUntil(
      executeResearch(todo.id, todo.title, research.id)
    );
  }
}

return optimisticResponse(todos);
```

### New: Research Execution

Research times out after 60 seconds if no response.

```ts
async function executeResearch(todoId: string, query: string, researchId: string) {
  try {
    // 1. Call Workers AI with web search (60s timeout)
    const result = await ai.run('@cf/moonshotai/kimi-k2.5', {
      messages: [{ role: 'user', content: `Research: ${query}` }],
      // Model has built-in thinking + search capabilities
    });
    
    // 2. Parse response into summary + sources
    const { summary, sources } = parseResearchResponse(result);
    
    // 3. Insert source URLs
    for (const [index, url] of sources.entries()) {
      await insertTodoUrl({
        todoId,
        researchId,
        url,
        position: generatePosition(index),
        fetchStatus: 'pending'
      });
      // Kick off metadata fetch for each URL
      waitUntil(fetchUrlMetadata(urlId));
    }
    
    // 4. Update research record
    await updateTodoResearch(researchId, {
      status: 'completed',
      summary,
      researchedAt: new Date()
    });
    
    // 5. Broadcast sync
    await broadcastSync(userId);
    
  } catch (error) {
    await updateTodoResearch(researchId, { status: 'failed' });
    await broadcastSync(userId);
  }
}
```

### Update Sync Endpoint

Include research data in response:

```ts
// In serializeTodo or as separate join
{
  id: todo.id,
  title: todo.title,
  // ... existing fields ...
  research: todo.research ? {
    id: todo.research.id,
    status: todo.research.status,
    summary: todo.research.summary,
    researchedAt: todo.research.researchedAt?.toISOString() ?? null,
  } : null,
  urls: [
    // Existing URL serialization, now includes researchId
    { id, url, title, researchId, ... }
  ]
}
```

---

## Web UI

### Expanded Todo View

```
┌─────────────────────────────────────────┐
│ ☐ Dogs ages vs human ages               │
├─────────────────────────────────────────┤
│ Notes                                   │
│ [editable textarea, always available]   │
├─────────────────────────────────────────┤
│ Research                    ↻ Refresh   │
│ ─────────────────────────────────────── │
│ Dogs age faster than humans, but the    │
│ "7 years" rule is a myth. Small breeds  │
│ live longer than large breeds. [1][2]   │
│                                         │
│ Sources                                 │
│ [1] 🌐 AKC - Dog Age Calculator         │
│ [2] 🌐 PetMD - How Dogs Age             │
└─────────────────────────────────────────┘
```

### Research Section States

| State | Display |
|-------|---------|
| No research | Section hidden |
| Pending | "Researching..." + spinner, no refresh button |
| Completed | Summary + numbered source cards + refresh button |
| Failed | "Research failed" + retry button |

### Main List View

- Show small "Researching..." indicator badge when `research.status === 'pending'`
- No research content in compact view (expanded only)

### Source Cards

Source URLs display with citation number prefix:

```tsx
<div className="flex items-center gap-2">
  <span className="text-xs text-gray-dim">[{index + 1}]</span>
  <UrlCard url={url} />
</div>
```

### Re-research Flow

1. User clicks "Refresh" button
2. Delete existing `todoResearch` record (cascades to source URLs)
3. Create new `todoResearch` with `status: 'pending'`
4. Kick off background research
5. UI updates to pending state via sync

---

## Implementation Phases

### Phase 1: Data Model

- [ ] Create migration for `todoResearch` table
- [ ] Create migration to add `researchId` to `todoUrls`
- [ ] Update Drizzle schema in `@nylon/db`
- [ ] Run migrations locally and verify

### Phase 2: AI Integration

- [ ] Update `extractTodos` prompt to return `needsResearch`
- [ ] Create `executeResearch` function
- [ ] Integrate Workers AI web search
- [ ] Parse AI response into summary + source URLs
- [ ] Handle citation formatting [1], [2]

### Phase 3: API Changes

- [ ] Remove `shouldUseAI` and fast path
- [ ] Update `smartCreate` to always call AI
- [ ] Create `todoResearch` record when `needsResearch: true`
- [ ] Execute research in background via `waitUntil`
- [ ] Update sync endpoint to include research data
- [ ] Add re-research endpoint or handle via sync

### Phase 4: Web UI

- [ ] Add research types to `SerializedTodo`
- [ ] Create `ResearchSection` component
- [ ] Implement pending/completed/failed states
- [ ] Create source cards with citation numbers
- [ ] Add "Researching..." indicator to list view
- [ ] Add refresh button and re-research flow
- [ ] Update `TodoItemExpanded` to show research section

### Phase 5: Polish

- [ ] Error handling and retry logic
- [ ] WebSocket broadcast on research completion
- [ ] Loading states and transitions
- [ ] Test edge cases (empty results, AI failures, long queries)

---

## Out of Scope

- iOS support (follow-up work)
- Manual research trigger (add if users request)
- Research history/versioning (replace only)
- Editing research summary (read-only)
- Research on existing todos (new todos only, plus re-research)

---

## Configuration

| Setting | Value |
|---------|-------|
| AI Model | `@cf/moonshotai/kimi-k2.5` (thinking + search) |
| Research Timeout | 60 seconds |
| Rate Limiting | None (single user for now) |
