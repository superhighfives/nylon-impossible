import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// Users table
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    aiEnabled: integer("ai_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    location: text("location"), // Used to bias location research queries
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
    description: text("description"),
    dueDate: integer("due_date", { mode: "timestamp" }),
    priority: text("priority", { enum: ["high", "low"] }),
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
  },
  (table) => [
    index("idx_todos_user_id").on(table.userId),
    index("idx_todos_user_position").on(table.userId, table.position),
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
