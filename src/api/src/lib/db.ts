import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

// Re-export schema from shared package
export {
  type GmailAddonLink,
  gmailAddonLinks,
  type List,
  lists,
  type NewGmailAddonLink,
  type NewList,
  type NewTodo,
  type NewTodoList,
  type NewTodoMessage,
  type NewTodoResearch,
  type NewTodoSuggestion,
  type NewTodoUrl,
  type NewUser,
  type SuggestionPayload,
  type SuggestionType,
  type Todo,
  type TodoList,
  type TodoMessage,
  type TodoResearch,
  type TodoSuggestion,
  type TodoUrl,
  todoLists,
  todoMessages,
  todoResearch,
  todoSuggestions,
  todos,
  todoUrls,
  type User,
  users,
} from "@nylon-impossible/shared/schema";

export function getDb(d1: D1Database) {
  return drizzle(d1);
}

export { eq, and, gt, lt, sql, inArray, isNull, isNotNull, asc, count, desc };
