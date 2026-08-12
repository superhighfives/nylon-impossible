import { relations, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Recurrence rule attached to a todo. v1 supports only a simple frequency; the
// JSON shape leaves room for future fields (interval, byDay, etc.) without a
// migration.
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type Recurrence = { frequency: RecurrenceFrequency };

// Proposed change carried by a todoSuggestions row. Shape depends on `type`.
export type SuggestionType =
  | "due_date"
  | "recurrence"
  | "title"
  | "subtasks"
  | "research";
export type SuggestionPayload =
  | { dueDate: string }
  | { recurrence: Recurrence }
  | { title: string }
  | { titles: string[] }
  | { searchQuery: string | null; researchType: "general" | "location" };

// Users table
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    aiEnabled: integer("ai_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    plan: text("plan", { enum: ["free", "pro"] })
      .notNull()
      .default("free"),
    location: text("location"), // Used to bias location research queries
    // Appearance preference, synced across devices. "system" follows the OS.
    theme: text("theme", { enum: ["light", "dark", "system"] })
      .notNull()
      .default("system"),
    // When true, completed todos are hidden from the list. Synced across devices.
    hideCompleted: integer("hide_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    // IANA identifier (e.g. "America/New_York"). Drives the aging sweep's
    // per-account "local midnight" calculation.
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  // Unique so one email maps to at most one user row. Guards against duplicate
  // accounts if the same email ever arrives under a different auth (Clerk) id.
  (table) => [uniqueIndex("idx_users_email").on(table.email)],
);

// Todos table
export const todos = sqliteTable(
  "todos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Parent todo id for subtasks. Null for top-level todos. Self-referential;
    // one level only (a subtask cannot itself have subtasks). Immutable after
    // creation — subtasks are permanently bound to their parent. Deleting a
    // parent cascades to its children.
    parentId: text("parent_id").references(
      (): AnySQLiteColumn => todos.id,
      { onDelete: "cascade" },
    ),
    // Which list this todo belongs to (Today/This Week/Sometime, or a custom
    // list). A todo belongs to exactly one list. Independent of dueDate —
    // list membership never implies or derives a due date, and vice versa.
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    // When listId last changed (manual drag, creation, or the aging sweep).
    // Drives the "how long has this been in This Week" demotion rule, since
    // listId alone carries no entry timestamp.
    listEnteredAt: integer("list_entered_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    title: text("title").notNull(),
    completed: integer("completed", { mode: "boolean" })
      .notNull()
      .default(false),
    // When a repeating todo is "completed" it isn't persisted as done (the
    // dueDate rolls forward instead); this records the moment it was checked so
    // the UI can show it in the Completed section until the user's local
    // midnight, after which it derives back to active. Null for todos that have
    // never been completed-as-a-repeat.
    completedAt: integer("completed_at", { mode: "timestamp" }),
    position: text("position").notNull().default("a0"),
    notes: text("notes"),
    dueDate: integer("due_date", { mode: "timestamp" }),
    recurrence: text("recurrence", { mode: "json" }).$type<Recurrence>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
    aiStatus: text("ai_status", {
      enum: ["pending", "processing", "complete", "failed"],
    }),
    // Cheap signal for the list view: true when the agent has posted a question
    // awaiting the user's reply. Orthogonal to aiStatus (both can be set at once).
    needsInput: integer("needs_input", { mode: "boolean" })
      .notNull()
      .default(false),
    // Source task id when this todo was imported from Google Tasks. Null for
    // todos created in-app. Used to dedupe on re-import.
    googleTaskId: text("google_task_id"),
    // Sticky todos render above non-sticky ones and are reordered within
    // their own tier only. Clears back to false when the todo is completed.
    sticky: integer("sticky", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("idx_todos_user_id").on(table.userId),
    index("idx_todos_user_position").on(table.userId, table.position),
    // Sibling lookups/ordering for subtasks, scoped per user to match the
    // (user_id, parent_id) grouping.
    index("idx_todos_user_parent_position").on(
      table.userId,
      table.parentId,
      table.position,
    ),
    // List-scoped ordering — the index the drag reorder and per-list fetch
    // actually use.
    index("idx_todos_user_list_position").on(
      table.userId,
      table.listId,
      table.position,
    ),
    // Multiple NULLs are distinct in SQLite, so in-app todos never collide;
    // this guarantees a Google task is imported at most once per user.
    uniqueIndex("idx_todos_user_google_task").on(
      table.userId,
      table.googleTaskId,
    ),
  ],
);

// Links a Google identity (from the Gmail side-panel add-on) to a Nylon Clerk
// user. The add-on runs as a Google identity; card actions need the matching
// Clerk `userId` to reuse the same create/list/update code paths as the REST
// API. Keyed on the Google `sub` (stable per-user), with the verified email
// kept for the auto-link fast path and for support/debugging.
export const gmailAddonLinks = sqliteTable(
  "gmail_addon_links",
  {
    googleSub: text("google_sub").primaryKey(),
    clerkUserId: text("clerk_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("idx_gmail_addon_links_clerk_user").on(table.clerkUserId),
  ],
);

// Conversation thread on a todo. Append-only and immutable except for
// awaitingReply, which clears (to false) when the user replies or dismisses.
export const todoMessages = sqliteTable(
  "todo_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    todoId: text("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["assistant", "user"] }).notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    awaitingReply: integer("awaiting_reply", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    index("idx_todo_messages_todo_id").on(table.todoId, table.createdAt),
  ],
);

// Lists table. Three system lists per user (Today/This Week/Sometime,
// kind = "system", fixed first-three order) plus unlimited user-named
// custom lists (kind = "custom"). A todo belongs to exactly one list via
// todos.listId.
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
    kind: text("kind", { enum: ["system", "custom"] })
      .notNull()
      .default("custom"),
    // Which built-in bucket this is, for system lists only. Null for custom
    // lists — never collides under idx_lists_user_system_kind since SQLite
    // treats multiple NULLs as distinct.
    systemKind: text("system_kind", {
      enum: ["today", "thisWeek", "sometime"],
    }),
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
    uniqueIndex("idx_lists_user_system_kind").on(
      table.userId,
      table.systemKind,
    ),
  ],
);

// Todo research results
export const todoResearch = sqliteTable(
  "todo_research",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    todoId: text("todo_id")
      .notNull()
      .unique()
      .references(() => todos.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    researchType: text("research_type", {
      enum: ["general", "location"],
    })
      .notNull()
      .default("general"),
    summary: text("summary"),
    searchQuery: text("search_query"),
    researchedAt: integer("researched_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_todo_research_todo_id").on(table.todoId),
    index("idx_todo_research_status").on(table.status),
  ],
);

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
    researchId: text("research_id").references(() => todoResearch.id, {
      onDelete: "cascade",
    }), // If set, this URL is a research source
    url: text("url").notNull(),
    title: text("title"),
    description: text("description"),
    siteName: text("site_name"),
    favicon: text("favicon"),
    image: text("image"),
    // Whether to render the fetched preview (page title/description) for this
    // URL. When false, clients show just the raw URL instead. Defaults to true
    // so existing URLs keep their rich preview.
    showPreview: integer("show_preview", { mode: "boolean" })
      .notNull()
      .default(true),
    position: text("position").notNull().default("a0"),
    fetchStatus: text("fetch_status", {
      enum: ["pending", "fetched", "failed"],
    })
      .notNull()
      .default("pending"),
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
    index("idx_todo_urls_research_id").on(table.researchId),
  ],
);

// AI enrichment proposals for a todo. Server-authoritative: enrichment inserts
// pending rows instead of mutating the todo directly; the user accepts or
// dismisses each individually. Accept/dismiss is terminal — a dismissed or
// accepted suggestion never reappears; re-running enrich only replaces rows
// still `pending`.
export const todoSuggestions = sqliteTable(
  "todo_suggestions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    todoId: text("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["due_date", "recurrence", "title", "subtasks", "research"],
    }).$type<SuggestionType>().notNull(),
    // JSON payload of the proposed value, e.g. {"dueDate":"2026-07-25"},
    // {"titles":["...","..."]}. Shape depends on `type`.
    payload: text("payload", { mode: "json" })
      .$type<SuggestionPayload>()
      .notNull(),
    // Pre-rendered human string for the button, e.g. "Set due date to Fri 25 Jul".
    // Server renders this so web and iOS stay identical without duplicating
    // formatting logic.
    label: text("label").notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "dismissed"],
    })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_todo_suggestions_todo_id").on(table.todoId),
    index("idx_todo_suggestions_status").on(table.status),
  ],
);

// Relations (for relational query API)
export const usersRelations = relations(users, ({ many }) => ({
  todos: many(todos),
  lists: many(lists),
}));

export const todosRelations = relations(todos, ({ one, many }) => ({
  user: one(users, {
    fields: [todos.userId],
    references: [users.id],
  }),
  parent: one(todos, {
    fields: [todos.parentId],
    references: [todos.id],
    relationName: "subtasks",
  }),
  subtasks: many(todos, { relationName: "subtasks" }),
  list: one(lists, {
    fields: [todos.listId],
    references: [lists.id],
  }),
  todoUrls: many(todoUrls),
  research: one(todoResearch),
  messages: many(todoMessages),
  suggestions: many(todoSuggestions),
}));

export const todoSuggestionsRelations = relations(
  todoSuggestions,
  ({ one }) => ({
    todo: one(todos, {
      fields: [todoSuggestions.todoId],
      references: [todos.id],
    }),
  }),
);

export const todoMessagesRelations = relations(todoMessages, ({ one }) => ({
  todo: one(todos, {
    fields: [todoMessages.todoId],
    references: [todos.id],
  }),
}));

export const listsRelations = relations(lists, ({ one, many }) => ({
  user: one(users, {
    fields: [lists.userId],
    references: [users.id],
  }),
  todos: many(todos),
}));

export const todoResearchRelations = relations(
  todoResearch,
  ({ one, many }) => ({
    todo: one(todos, {
      fields: [todoResearch.todoId],
      references: [todos.id],
    }),
    urls: many(todoUrls),
  }),
);

export const todoUrlsRelations = relations(todoUrls, ({ one }) => ({
  todo: one(todos, {
    fields: [todoUrls.todoId],
    references: [todos.id],
  }),
  research: one(todoResearch, {
    fields: [todoUrls.researchId],
    references: [todoResearch.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type TodoResearch = typeof todoResearch.$inferSelect;
export type NewTodoResearch = typeof todoResearch.$inferInsert;
export type TodoUrl = typeof todoUrls.$inferSelect;
export type NewTodoUrl = typeof todoUrls.$inferInsert;
export type TodoMessage = typeof todoMessages.$inferSelect;
export type NewTodoMessage = typeof todoMessages.$inferInsert;
export type TodoSuggestion = typeof todoSuggestions.$inferSelect;
export type NewTodoSuggestion = typeof todoSuggestions.$inferInsert;
export type GmailAddonLink = typeof gmailAddonLinks.$inferSelect;
export type NewGmailAddonLink = typeof gmailAddonLinks.$inferInsert;
