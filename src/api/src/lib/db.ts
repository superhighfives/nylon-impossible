import { and, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

// Re-export schema from shared package
export {
  users,
  todos,
  lists,
  todoLists,
  todoUrls,
  type User,
  type NewUser,
  type Todo,
  type NewTodo,
  type List,
  type NewList,
  type TodoList,
  type NewTodoList,
  type TodoUrl,
  type NewTodoUrl,
} from "@nylon-impossible/shared/schema";

export function getDb(d1: D1Database) {
  return drizzle(d1);
}

export { eq, and, gt, sql };
