# Item Schema Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the todo schema to support description, URLs with metadata, due dates, priority, and lists. Update AI extraction to parse URLs and dates from input. Add edit UI to web (inline expansion) and iOS (edit sheet).

**Architecture:**
- Schema: Add columns to `todos`, create `lists`, `todo_lists`, `todo_urls` tables
- API: Extend AI to extract `{ title, urls[], dueDate }`, background URL metadata fetching
- Web: Inline expanded edit view for new fields
- iOS: Full edit sheet, updated model and API service

**Tech Stack:** Drizzle ORM, SQLite/D1, Zod, Effect, Hono, React, SwiftUI, SwiftData

---

## Phase 1: Schema

### Task 1.1: Add new columns to todos table

**Files:**
- Modify: `src/web/src/lib/schema.ts:21-48`

Add after `position` column:

```typescript
description: text("description"),
dueDate: integer("due_date", { mode: "timestamp" }),
priority: text("priority", { enum: ["high", "low"] }),
```

**Verify:** `cd src/web && pnpm typecheck`

**Commit:** `git commit -m "add description, dueDate, priority to todos schema"`

---

### Task 1.2: Add lists table with hardcoded defaults

**Files:**
- Modify: `src/web/src/lib/schema.ts`

Add after todos table:

```typescript
// Lists table (hardcoded defaults: TODO, Shopping, Bills, Work)
export const lists = sqliteTable(
  "lists",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: text("position").notNull().default("a0"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_lists_user_id").on(table.userId),
  ],
);
```

**Commit:** `git commit -m "add lists table schema"`

---

### Task 1.3: Add todo_lists join table

**Files:**
- Modify: `src/web/src/lib/schema.ts`

```typescript
import { primaryKey } from "drizzle-orm/sqlite-core";

// Todo-Lists join table
export const todoLists = sqliteTable(
  "todo_lists",
  {
    todoId: text("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    primaryKey({ columns: [table.todoId, table.listId] }),
    index("idx_todo_lists_todo").on(table.todoId),
    index("idx_todo_lists_list").on(table.listId),
  ],
);
```

**Commit:** `git commit -m "add todo_lists join table schema"`

---

### Task 1.4: Add todo_urls table for URL metadata

**Files:**
- Modify: `src/web/src/lib/schema.ts`

```typescript
// Todo URLs with fetched metadata
export const todoUrls = sqliteTable(
  "todo_urls",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    todoId: text("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    description: text("description"),
    siteName: text("site_name"),
    favicon: text("favicon"),
    position: text("position").notNull().default("a0"),
    fetchedAt: integer("fetched_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_todo_urls_todo").on(table.todoId),
  ],
);
```

**Commit:** `git commit -m "add todo_urls table for URL metadata"`

---

### Task 1.5: Add relations and type exports

**Files:**
- Modify: `src/web/src/lib/schema.ts`

Update existing relations and add new ones:

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  todos: many(todos),
  lists: many(lists),
}));

export const todosRelations = relations(todos, ({ one, many }) => ({
  user: one(users, {
    fields: [todos.userId],
    references: [users.id],
  }),
  todoLists: many(todoLists),
  todoUrls: many(todoUrls),
}));

export const listsRelations = relations(lists, ({ one, many }) => ({
  user: one(users, {
    fields: [lists.userId],
    references: [users.id],
  }),
  todoLists: many(todoLists),
}));

export const todoListsRelations = relations(todoLists, ({ one }) => ({
  todo: one(todos, {
    fields: [todoLists.todoId],
    references: [todos.id],
  }),
  list: one(lists, {
    fields: [todoLists.listId],
    references: [lists.id],
  }),
}));

export const todoUrlsRelations = relations(todoUrls, ({ one }) => ({
  todo: one(todos, {
    fields: [todoUrls.todoId],
    references: [todos.id],
  }),
}));

// Type exports
export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type TodoList = typeof todoLists.$inferSelect;
export type NewTodoList = typeof todoLists.$inferInsert;
export type TodoUrl = typeof todoUrls.$inferSelect;
export type NewTodoUrl = typeof todoUrls.$inferInsert;
```

**Verify:** `cd src/web && pnpm typecheck`

**Commit:** `git commit -m "add schema relations and type exports"`

---

### Task 1.6: Generate and apply migration

**Steps:**

```bash
# Delete old migrations (data can be blown away)
rm -rf src/web/migrations/*.sql src/web/migrations/meta

# Generate fresh migration
cd src/web && pnpm db:generate

# Apply locally
cd src/web && pnpm db:migrate

# Apply to production
cd src/web && pnpm db:migrate:remote
```

**Commit:** `git commit -m "generate fresh migration for expanded schema"`

---

## Phase 2: API

### Task 2.1: Update API db.ts exports

**Files:**
- Modify: `src/api/src/lib/db.ts`

Add exports for new tables:

```typescript
export { lists, todoLists, todoUrls } from "@nylon-impossible/web/schema";
```

**Verify:** `cd src/api && pnpm typecheck`

**Commit:** `git commit -m "export new schema tables from API db"`

---

### Task 2.2: Extend AI extraction for URLs and dates

**Files:**
- Modify: `src/api/src/lib/ai.ts`

Update `ExtractedItem` interface:

```typescript
interface ExtractedItem {
  title: string;
  urls?: string[];
  dueDate?: string; // ISO date string
}
```

Update `AIToolCallResponse`:

```typescript
interface AIToolCallResponse {
  todos: Array<{
    title: string;
    urls?: string[];
    dueDate?: string;
  }>;
}
```

Update `extractTodosTool` parameters to include `urls` and `dueDate`:

```typescript
const extractTodosTool = {
  type: "function" as const,
  function: {
    name: "extract_todos",
    description:
      "Extract actionable tasks from text. Also extract any URLs and due dates mentioned.",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description: "List of extracted todo items",
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description:
                  "Concise action item. If a URL is present, use the action verb + a placeholder like 'Check [URL]' - the title will be updated when metadata is fetched.",
              },
              urls: {
                type: "array",
                items: { type: "string" },
                description: "Any URLs mentioned in relation to this task",
              },
              dueDate: {
                type: "string",
                description:
                  "ISO 8601 date (YYYY-MM-DD) if a due date is mentioned. Convert relative dates like 'tomorrow', 'next week', 'Friday' to absolute dates.",
              },
            },
            required: ["title"],
          },
        },
      },
      required: ["todos"],
    },
  },
};
```

Update system prompt to include current date and URL/date extraction:

```typescript
function getSystemPrompt(): string {
  const today = new Date().toISOString().split("T")[0];
  return `You are a helpful assistant that extracts actionable todo items from text.
Today's date is ${today}. Use this to convert relative dates.

IMPORTANT: You MUST always call the extract_todos tool with your findings.

Your job is to parse text and extract:
1. Actionable tasks (required)
2. Any URLs associated with each task
3. Any due dates mentioned (convert to ISO format YYYY-MM-DD)

For URLs:
- Extract the full URL
- The title should describe the action, not include the raw URL
- Example: "check https://google.com" -> title: "Check Google", urls: ["https://google.com"]

For dates:
- "tomorrow" -> next day from today
- "next week" -> 7 days from today  
- "Friday" -> the coming Friday
- "in 3 days" -> today + 3 days

Examples:
- "check https://example.com tomorrow" -> { title: "Check Example", urls: ["https://example.com"], dueDate: "${new Date(Date.now() + 86400000).toISOString().split("T")[0]}" }
- "buy milk" -> { title: "Buy milk" }
- "call mom next week" -> { title: "Call mom", dueDate: "..." }`;
}
```

**Verify:** `cd src/api && pnpm typecheck`

**Commit:** `git commit -m "extend AI extraction for URLs and due dates"`

---

### Task 2.3: Add URL metadata fetching utility

**Files:**
- Create: `src/api/src/lib/url-metadata.ts`

```typescript
interface UrlMetadata {
  title: string | null;
  description: string | null;
  siteName: string | null;
  favicon: string | null;
}

export async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "NylonBot/1.0" },
      redirect: "follow",
    });

    if (!response.ok) {
      return { title: null, description: null, siteName: null, favicon: null };
    }

    const html = await response.text();
    
    const title = extractMeta(html, "og:title") 
      ?? extractMeta(html, "twitter:title")
      ?? extractTitle(html);
    
    const description = extractMeta(html, "og:description")
      ?? extractMeta(html, "twitter:description")
      ?? extractMeta(html, "description");
    
    const siteName = extractMeta(html, "og:site_name")
      ?? new URL(url).hostname.replace("www.", "");
    
    const favicon = extractFavicon(html, url);

    return { title, description, siteName, favicon };
  } catch {
    return { title: null, description: null, siteName: null, favicon: null };
  }
}

function extractMeta(html: string, property: string): string | null {
  const ogMatch = html.match(
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, "i")
  ) ?? html.match(
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, "i")
  );
  if (ogMatch) return ogMatch[1];

  const nameMatch = html.match(
    new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`, "i")
  ) ?? html.match(
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${property}["']`, "i")
  );
  return nameMatch?.[1] ?? null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function extractFavicon(html: string, baseUrl: string): string | null {
  const match = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
  
  if (match) {
    const href = match[1];
    if (href.startsWith("http")) return href;
    if (href.startsWith("//")) return `https:${href}`;
    const base = new URL(baseUrl);
    return new URL(href, base.origin).toString();
  }
  
  return `${new URL(baseUrl).origin}/favicon.ico`;
}
```

**Commit:** `git commit -m "add URL metadata fetching utility"`

---

### Task 2.4: Update smart-create handler

**Files:**
- Modify: `src/api/src/handlers/smart-create.ts`

Update imports and `serializeTodo` to include new fields. Update `createAndReturn` to:
1. Accept `urls` and `dueDate` from extracted items
2. Insert URL records immediately  
3. Use `c.executionCtx.waitUntil()` to fetch metadata in background
4. Notify clients after metadata is fetched

Key changes:

```typescript
// Update items type
items: Array<{ title: string; urls?: string[]; dueDate?: string }>

// In row creation, add dueDate
dueDate: item.dueDate ? new Date(item.dueDate) : null,

// After todo insert, insert URLs and queue background fetch
if (urlsToFetch.length > 0) {
  await db.insert(todoUrls).values(
    urlsToFetch.map(({ todoId, url }) => ({
      id: crypto.randomUUID(),
      todoId,
      url,
      createdAt: now,
      updatedAt: now,
    }))
  );

  c.executionCtx.waitUntil(
    fetchAndUpdateUrlMetadata(db, urlsToFetch, c.env, userId)
  );
}
```

**Verify:** `cd src/api && pnpm typecheck`

**Commit:** `git commit -m "update smart-create for URLs and due dates"`

---

### Task 2.5: Update sync handler for new fields

**Files:**
- Modify: `src/api/src/handlers/sync.ts`

Update `syncRequestSchema` to include `description`, `dueDate`, `priority`.  
Update `serializeTodo` to return new fields.  
Update sync logic to apply new fields.

**Commit:** `git commit -m "update sync handler for new todo fields"`

---

### Task 2.6: Add GET /todos/:id endpoint with URLs

**Files:**
- Modify: `src/api/src/handlers/todos.ts`
- Modify: `src/api/src/index.ts` (register route)

Return todo with associated URLs from `todo_urls` table.

**Commit:** `git commit -m "add GET /todos/:id endpoint with URLs"`

---

### Task 2.7: Seed default lists on user creation

**Files:**
- Modify: `src/api/src/handlers/sync.ts`

After user creation, insert default lists: "TODO", "Shopping", "Bills", "Work"

```typescript
const defaultLists = ["TODO", "Shopping", "Bills", "Work"];
const positions = generateNKeysBetween(null, null, defaultLists.length);

await db.insert(lists).values(
  defaultLists.map((name, i) => ({
    id: crypto.randomUUID(),
    userId,
    name,
    position: positions[i],
  }))
);
```

**Commit:** `git commit -m "seed default lists on user creation"`

---

## Phase 3: Web Validation & Types

### Task 3.1: Update validation schemas

**Files:**
- Modify: `src/web/src/lib/validation.ts`

Add `description`, `dueDate`, `priority` to create/update schemas.

**Commit:** `git commit -m "update validation schemas for new fields"`

---

### Task 3.2: Update database types

**Files:**
- Modify: `src/web/src/types/database.ts`

Export new types, add `TodoWithUrls` interface.

**Commit:** `git commit -m "update database types for new schema"`

---

### Task 3.3: Update server todos.ts

**Files:**
- Modify: `src/web/src/server/todos.ts`

Update `createTodo` and `updateTodo` to handle new fields.

**Commit:** `git commit -m "update server todos for new fields"`

---

## Phase 4: Web UI

### Task 4.1: Create TodoItemExpanded component

**Files:**
- Create: `src/web/src/components/TodoItemExpanded.tsx`

Inline expansion with:
- Description textarea
- Due date picker with clear button
- Priority select (None/High/Low)
- URLs list with favicon, title, description

**Commit:** `git commit -m "add TodoItemExpanded component"`

---

### Task 4.2: Update TodoList with inline expansion

**Files:**
- Modify: `src/web/src/components/TodoList.tsx`

Add `expandedId` state. Add "More/Less" button to each item. Render `TodoItemExpanded` when expanded.

**Commit:** `git commit -m "add inline expansion to TodoList"`

---

### Task 4.3: Add useTodoWithUrls hook

**Files:**
- Modify: `src/web/src/hooks/useTodos.ts`

Fetch single todo with URLs when expanded.

**Commit:** `git commit -m "add useTodoWithUrls hook"`

---

## Phase 5: iOS

### Task 5.1: Update TodoItem model

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/Models/TodoItem.swift`

Add properties: `itemDescription`, `dueDate`, `priority`

**Commit:** `git commit -m "update iOS TodoItem model for new fields"`

---

### Task 5.2: Update APIService models

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/Services/APIService.swift`

Update `APITodo`, `TodoChange`, `SmartCreateTodo` to include new fields.

**Commit:** `git commit -m "update iOS API models for new fields"`

---

### Task 5.3: Update SyncService for new fields

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/Services/SyncService.swift`

Include new fields in sync payloads and when applying server changes.

**Commit:** `git commit -m "update iOS SyncService for new fields"`

---

### Task 5.4: Create TodoEditSheet view

**Files:**
- Create: `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/TodoEditSheet.swift`

Full edit form with:
- Title text field
- Description multiline field
- Due date toggle + DatePicker
- Priority picker (None/High/Low)

**Commit:** `git commit -m "add iOS TodoEditSheet view"`

---

### Task 5.5: Update TodoItemRow to show edit sheet

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/TodoItemRow.swift`

Replace alert with sheet. Show due date below title. Show priority indicator.

**Commit:** `git commit -m "update iOS TodoItemRow with edit sheet"`

---

### Task 5.6: Wire up onSave in ContentView

**Files:**
- Modify: `src/ios/Nylon Impossible/Nylon Impossible/ContentView.swift`

Pass `onSave` callback to TodoItemRow.

**Commit:** `git commit -m "wire up onSave in iOS ContentView"`

---

## Phase 6: Testing & Verification

### Task 6.1: Update validation tests

**Files:**
- Modify: `src/web/src/lib/__tests__/validation.test.ts`

Add tests for new fields.

**Commit:** `git commit -m "add validation tests for new schema fields"`

---

### Task 6.2: Run full test suite

```bash
cd src/web && pnpm test
cd src/api && pnpm test
cd src/web && pnpm typecheck
cd src/api && pnpm typecheck
```

**Commit:** `git commit -m "all tests passing for schema update"`

---

### Task 6.3: Build iOS

```bash
cd "src/ios/Nylon Impossible"
xcodebuild -scheme "Nylon Impossible" -destination "platform=iOS Simulator,name=iPhone 16" build
```

---

## Summary

| Layer | Changes |
|-------|---------|
| **Schema** | `todos` + description/dueDate/priority, `lists`, `todo_lists`, `todo_urls` |
| **API** | AI extracts URLs + dates, background metadata fetch, sync supports new fields, default lists seeded |
| **Web** | Inline expanded edit view with all fields, URL display |
| **iOS** | Updated model, full edit sheet, priority indicator, due date display |
