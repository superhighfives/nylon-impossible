import { dueDayKey } from "@nylon-impossible/shared";
import type {
  V1Link,
  V1List,
  V1ListAlias,
  V1ListKind,
  V1Subtask,
  V1Todo,
} from "@nylon-impossible/shared/api-v1";
import { chunkForD1 } from "@nylon-impossible/shared/d1";
import { loadUrlsByTodoId } from "@nylon-impossible/shared/serialize";
import {
  and,
  asc,
  eq,
  type getDb,
  inArray,
  type List,
  lists,
  type Todo,
  type TodoUrl,
  todos,
} from "./db";

// The `/v1` contract's serializers. Separate from serializeTodo and
// serializeUrl on purpose: those follow the apps, these only ever grow
// (src/shared/src/api-v1.ts). userId, email, position, systemKind and a
// link's fetch state never go out.

type Db = ReturnType<typeof getDb>;

const KIND: Record<NonNullable<List["systemKind"]>, V1ListKind> = {
  today: "today",
  thisWeek: "this_week",
  someday: "someday",
};

const ALIAS: Record<V1ListAlias, NonNullable<List["systemKind"]>> = {
  today: "today",
  "this-week": "thisWeek",
  someday: "someday",
};

const SYSTEM_ORDER: NonNullable<List["systemKind"]>[] = [
  "today",
  "thisWeek",
  "someday",
];

export function toV1List(list: List): V1List {
  return {
    id: list.id,
    name: list.name,
    kind: list.systemKind ? KIND[list.systemKind] : "list",
    updatedAt: list.updatedAt.toISOString(),
  };
}

export function toV1Link(url: TodoUrl): V1Link {
  return {
    id: url.id.toLowerCase(),
    url: url.url,
    title: url.title ?? null,
    siteName: url.siteName ?? null,
    showAsUrl: !url.showPreview,
  };
}

export function toV1Todo(
  todo: Todo,
  links: TodoUrl[],
  subtasks: Todo[],
): V1Todo {
  return {
    id: todo.id.toLowerCase(),
    listId: todo.listId,
    title: todo.title,
    notes: todo.notes || null,
    pinned: todo.pinned,
    done: todo.completed,
    due: todo.dueDate ? dueDayKey(todo.dueDate) : null,
    repeat: todo.recurrence ? { frequency: todo.recurrence.frequency } : null,
    links: links.map(toV1Link),
    subtasks: subtasks.map(
      (s): V1Subtask => ({
        id: s.id.toLowerCase(),
        title: s.title,
        done: s.completed,
      }),
    ),
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

/**
 * The user's lists in the apps' order: Today, This week, Someday, then their
 * own lists by position.
 */
export async function listV1Lists(db: Db, userId: string): Promise<V1List[]> {
  const rows = await db
    .select()
    .from(lists)
    .where(eq(lists.userId, userId))
    .orderBy(asc(lists.position));
  const system = SYSTEM_ORDER.flatMap((kind) =>
    rows.filter((l) => l.systemKind === kind),
  );
  const own = rows.filter((l) => !l.systemKind);
  return [...system, ...own].map(toV1List);
}

/**
 * One of the user's lists by id, or by alias (`today`, `this-week`,
 * `someday`). Null for an unknown id and for another user's list alike.
 */
export async function findV1List(
  db: Db,
  userId: string,
  idOrAlias: string,
): Promise<List | null> {
  const systemKind =
    idOrAlias in ALIAS ? ALIAS[idOrAlias as V1ListAlias] : undefined;
  const [list] = await db
    .select()
    .from(lists)
    .where(
      and(
        eq(lists.userId, userId),
        systemKind ? eq(lists.systemKind, systemKind) : eq(lists.id, idOrAlias),
      ),
    )
    .limit(1);
  return list ?? null;
}

/** Top-level todos with their links and subtasks, both in position order. */
export async function withLinksAndSubtasks(
  db: Db,
  rows: Todo[],
): Promise<V1Todo[]> {
  const ids = rows.map((t) => t.id);
  const urls = await loadUrlsByTodoId(db, ids);
  const subtasks = new Map<string, Todo[]>();
  // The parents are the caller's own, so their subtasks are too.
  for (const batch of chunkForD1(ids)) {
    const children = await db
      .select()
      .from(todos)
      .where(inArray(todos.parentId, batch))
      .orderBy(asc(todos.position));
    for (const child of children) {
      const key = child.parentId?.toLowerCase() ?? "";
      const list = subtasks.get(key);
      if (list) list.push(child);
      else subtasks.set(key, [child]);
    }
  }
  return rows.map((t) => {
    const key = t.id.toLowerCase();
    return toV1Todo(t, urls.get(key) ?? [], subtasks.get(key) ?? []);
  });
}
