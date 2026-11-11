import {
  V1_TODOS_DEFAULT_LIMIT,
  V1_TODOS_MAX_LIMIT,
  type V1ListsResponse,
  type V1Todo,
  type V1TodosResponse,
} from "@nylon-impossible/shared/api-v1";
import type { Context } from "hono";
import { z } from "zod/v4";
import {
  and,
  asc,
  desc,
  eq,
  getDb,
  gt,
  isNull,
  lt,
  or,
  todos,
} from "../lib/db";
import { apiError, apiValidationError } from "../lib/errors";
import {
  findV1List,
  listV1Lists,
  toV1List,
  withLinksAndSubtasks,
} from "../lib/v1";
import type { Env } from "../types";

// The read-only `/v1` API, behind tokenMiddleware (personal API tokens only).
// Shapes live in src/shared/src/api-v1.ts.

// A page's position, opaque to clients: base64url JSON. Open todos page by
// (pinned, position, id), done ones by (updatedAt, id), newest first.
const openCursor = z.object({
  o: z.tuple([z.boolean(), z.string(), z.string()]),
});
const doneCursor = z.object({ d: z.tuple([z.number().int(), z.string()]) });

function encodeCursor(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeCursor(cursor: string): unknown {
  try {
    return JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

const todosQuery = z.object({
  done: z
    .enum(["true", "false"], { message: "done must be true or false" })
    .optional()
    .transform((v) => v === "true"),
  limit: z
    .string()
    .regex(/^\d+$/, "limit must be a whole number")
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, "limit must be at least 1")
        .max(
          V1_TODOS_MAX_LIMIT,
          `limit can't be more than ${V1_TODOS_MAX_LIMIT}`,
        ),
    )
    .optional(),
  cursor: z.string().min(1).optional(),
});

// GET /v1/lists
export async function v1Lists(c: Context<Env>) {
  const data = await listV1Lists(getDb(c.env.DB), c.get("userId"));
  return c.json({ data } satisfies V1ListsResponse);
}

// GET /v1/lists/:id (an id, or today / this-week / someday)
export async function v1List(c: Context<Env>) {
  const list = await findV1List(
    getDb(c.env.DB),
    c.get("userId"),
    c.req.param("id") ?? "",
  );
  if (!list) return apiError(c, "list_not_found");
  return c.json(toV1List(list));
}

// GET /v1/lists/:id/todos?done=&limit=&cursor=
export async function v1ListTodos(c: Context<Env>) {
  const parsed = todosQuery.safeParse(c.req.query());
  if (!parsed.success) return apiValidationError(c, parsed.error);
  const { done, cursor } = parsed.data;
  const limit = parsed.data.limit ?? V1_TODOS_DEFAULT_LIMIT;

  let after: ReturnType<typeof and> | undefined;
  if (cursor) {
    const raw = decodeCursor(cursor);
    if (done) {
      const c2 = doneCursor.safeParse(raw);
      if (!c2.success) return badCursor(c);
      const [seconds, id] = c2.data.d;
      const at = new Date(seconds * 1000);
      after = or(
        lt(todos.updatedAt, at),
        and(eq(todos.updatedAt, at), lt(todos.id, id)),
      );
    } else {
      const c2 = openCursor.safeParse(raw);
      if (!c2.success) return badCursor(c);
      const [pinned, position, id] = c2.data.o;
      after = or(
        lt(todos.pinned, pinned),
        and(
          eq(todos.pinned, pinned),
          or(
            gt(todos.position, position),
            and(eq(todos.position, position), gt(todos.id, id)),
          ),
        ),
      );
    }
  }

  const db = getDb(c.env.DB);
  const userId = c.get("userId");
  const list = await findV1List(db, userId, c.req.param("id") ?? "");
  if (!list) return apiError(c, "list_not_found");

  const rows = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.listId, list.id),
        isNull(todos.parentId),
        eq(todos.completed, done),
        after,
      ),
    )
    .orderBy(
      ...(done
        ? [desc(todos.updatedAt), desc(todos.id)]
        : [desc(todos.pinned), asc(todos.position), asc(todos.id)]),
    )
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > limit && last
      ? encodeCursor(
          done
            ? { d: [Math.floor(last.updatedAt.getTime() / 1000), last.id] }
            : { o: [last.pinned, last.position, last.id] },
        )
      : null;

  const data: V1Todo[] = await withLinksAndSubtasks(db, page);
  return c.json({ data, nextCursor } satisfies V1TodosResponse);
}

function badCursor(c: Context<Env>) {
  return apiError(c, "validation_failed", {
    message: "cursor isn't one this route gave out",
  });
}

// GET /v1/todos/:id: a top-level todo, done or not. A subtask's id is a 404;
// subtasks come inside their todo.
export async function v1Todo(c: Context<Env>) {
  const db = getDb(c.env.DB);
  const id = (c.req.param("id") ?? "").toLowerCase();
  const [todo] = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.id, id),
        eq(todos.userId, c.get("userId")),
        isNull(todos.parentId),
      ),
    )
    .limit(1);
  if (!todo) return apiError(c, "todo_not_found");
  const [body] = await withLinksAndSubtasks(db, [todo]);
  return c.json(body);
}
