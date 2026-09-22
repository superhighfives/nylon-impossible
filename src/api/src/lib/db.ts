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
  ne,
  or,
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
  type NewTodoUrl,
  type NewUser,
  type Todo,
  type TodoUrl,
  todos,
  todoUrls,
  type User,
  users,
} from "@nylon-impossible/shared/schema";

export function getDb(d1: D1Database) {
  return drizzle(d1);
}

export {
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
  ne,
  or,
  sql,
};
