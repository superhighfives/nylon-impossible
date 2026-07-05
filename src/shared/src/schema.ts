import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Recurrence rule attached to a todo. v1 supports only a simple frequency; the
// JSON shape leaves room for future fields (interval, byDay, etc.) without a
// migration.
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type Recurrence = { frequency: RecurrenceFrequency };

// Users table
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    aiEnabled: integer("ai_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    plan: text("plan", { enum: ["free", "pro"] }).notNull().default("free"),
    location: text("location"), // Used to bias location research queries
    // Appearance preference, synced across devices. "system" follows the OS.
    theme: text("theme", { enum: ["light", "dark", "system"] })
      .notNull()
      .default("system"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_users_email").on(table.email)],
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
    title: text("title").notNull(),
    completed: integer("completed", { mode: "boolean" })
      .notNull()
      .default(false),
    position: text("position").notNull().default("a0"),
    notes: text("notes"),
    dueDate: integer("due_date", { mode: "timestamp" }),
    priority: text("priority", { enum: ["high", "low"] }),
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
  },
  (table) => [
    index("idx_todos_user_id").on(table.userId),
    index("idx_todos_user_position").on(table.userId, table.position),
    // Multiple NULLs are distinct in SQLite, so in-app todos never collide;
    // this guarantees a Google task is imported at most once per user.
    uniqueIndex("idx_todos_user_google_task").on(
      table.userId,
      table.googleTaskId,
    ),
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
  (table) => [index("idx_lists_user_id").on(table.userId)],
);

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
  todoLists: many(todoLists),
  todoUrls: many(todoUrls),
  research: one(todoResearch),
  messages: many(todoMessages),
}));

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
export type TodoList = typeof todoLists.$inferSelect;
export type NewTodoList = typeof todoLists.$inferInsert;
export type TodoResearch = typeof todoResearch.$inferSelect;
export type NewTodoResearch = typeof todoResearch.$inferInsert;
export type TodoUrl = typeof todoUrls.$inferSelect;
export type NewTodoUrl = typeof todoUrls.$inferInsert;
export type TodoMessage = typeof todoMessages.$inferSelect;
export type NewTodoMessage = typeof todoMessages.$inferInsert;
