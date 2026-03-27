import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

// Re-export schema from shared package
export {
  type List,
  lists,
  type NewList,
  type NewTodo,
  type NewTodoList,
  type NewTodoResearch,
  type NewTodoUrl,
  type NewUser,
  type Todo,
  type TodoList,
  type TodoResearch,
  type TodoUrl,
  todoLists,
  todoResearch,
  todos,
  todoUrls,
  type User,
  users,
} from "@nylon-impossible/shared/schema";

export function getDb(d1: D1Database) {
  return drizzle(d1);
}

export { eq, and, gt, sql, inArray, asc };
