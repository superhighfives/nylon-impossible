import {
  createInitialTodo,
  normalizeHttpUrl,
  parseTodoDate,
} from "@nylon-impossible/shared";
import {
  getSystemListId,
  getUserTimezone,
} from "@nylon-impossible/shared/queries";
import {
  serializeTodo,
  serializeUrl,
} from "@nylon-impossible/shared/serialize";
import * as Sentry from "@sentry/cloudflare";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { Env } from "../types";
import { and, eq, type getDb, isNull, todos, todoUrls } from "./db";
import { notifySync } from "./notify-sync";
import { finishTodoLinks } from "./process-todo";

type Db = ReturnType<typeof getDb>;
type Bindings = Env["Bindings"];

export interface CreateSmartTodoOptions {
  /**
   * URLs attached with a title already known, which should NOT be fetched for
   * metadata — e.g. a Gmail thread permalink, where the subject is known up
   * front and a fetch would just hit an auth wall. Stored as already-`fetched`
   * so clients render the title (and their email treatment) immediately.
   * Deduped against parsed URLs.
   */
  attachedUrls?: { url: string; title?: string; siteName?: string }[];
  /**
   * Place the new todo in this list instead of the Today default. Callers
   * MUST verify this belongs to `userId` first (e.g. via
   * `verifyListOwnership`) — this function trusts it as already-checked,
   * matching how `handlers/sync.ts` checks an incoming `listId` before
   * writing it.
   */
  listId?: string;
  /**
   * Run the typed-date parser over the title ("Pay rent tomorrow" → "Pay
   * rent", due tomorrow) against the user's timezone. Defaults to true so
   * Siri, Share and Gmail input gets it. Clients that parse locally (to show
   * the "Due Fri ×" chip) pass false along with their own `dueDate`.
   */
  parseDate?: boolean;
  /**
   * An explicit due day (already normalized with `toDueDay`). Wins over
   * anything the parser would find.
   */
  dueDate?: Date | null;
  /**
   * Schedule background work (URL metadata fetch). In a Worker request this
   * is `c.executionCtx.waitUntil`. Callers with no execution context can pass
   * a function that awaits or ignores the promise.
   */
  waitUntil: (promise: Promise<unknown>) => void;
}

export interface CreateSmartTodoResult {
  todo: ReturnType<typeof serializeTodo> & {
    urls: ReturnType<typeof serializeUrl>[];
  };
}

/**
 * Core of the smart-create path, shared by the `POST /todos/smart` REST
 * handler and the Gmail add-on. Given a resolved `userId` and free text, it
 * creates a top-level todo (prepended to its list), extracts + attaches URLs
 * in the background, and pokes connected clients to sync. Keeping this in one place means URL handling, positioning, and
 * `notifySync` behave identically everywhere.
 */
export async function createSmartTodo(
  db: Db,
  env: Bindings,
  userId: string,
  text: string,
  options: CreateSmartTodoOptions,
): Promise<CreateSmartTodoResult> {
  const trimmed = text.trim();

  // The caller-supplied (already-verified) list, or Today by default.
  const listId = options.listId ?? (await getSystemListId(db, userId, "today"));
  if (!listId) {
    throw new Error(`No list found to place todo into for user ${userId}`);
  }

  // Get the lowest top-level position so the new todo is prepended.
  const firstTodo = await db
    .select({ position: todos.position })
    .from(todos)
    .where(and(eq(todos.userId, userId), isNull(todos.parentId)))
    .orderBy(todos.position)
    .limit(1)
    .then((rows) => rows[0]);

  const position = generateKeyBetween(null, firstTodo?.position ?? null);
  const now = new Date();

  const initial = createInitialTodo(trimmed);

  // Typed dates.
  let dueDate: Date | null = options.dueDate ?? null;
  if (
    options.dueDate === undefined &&
    options.parseDate !== false &&
    initial.titleIsTyped
  ) {
    const parsed = parseTodoDate(initial.title, {
      now: new Date(),
      timeZone: await getUserTimezone(db, userId),
    });
    if (parsed.dueDay) {
      initial.title = parsed.title;
      dueDate = parsed.dueDay;
    }
  }

  // URLs parsed from the text, which we fetch metadata for in the background.
  const fetchedUrls = Array.from(new Set(initial.urls));

  // Pre-titled attachments (e.g. a Gmail thread permalink) skip the fetch: the
  // title is already known and the target sits behind auth. Normalize through
  // the same http/https gate as parsed URLs (a caller-supplied
  // value is untrusted input, so a `javascript:`/`data:` string can't slip
  // through to a persisted, clickable link), then dedupe within the group and against the
  // fetched set (via a running `Set`) so a URL never lands in both places.
  const seenUrls = new Set(fetchedUrls);
  const attachedUrls = (options.attachedUrls ?? [])
    .map((a) => {
      const url = normalizeHttpUrl(a.url);
      return url ? { ...a, url } : null;
    })
    .filter(
      (a): a is { url: string; title?: string; siteName?: string } =>
        a !== null,
    )
    .filter((a) => {
      if (seenUrls.has(a.url)) return false;
      seenUrls.add(a.url);
      return true;
    });

  const todoId = crypto.randomUUID();

  // Insert todo immediately - this is the fast path
  await db.insert(todos).values({
    id: todoId,
    userId,
    listId,
    listEnteredAt: now,
    title: initial.title,
    notes: initial.notes,
    completed: false,
    position,
    dueDate,
    createdAt: now,
    updatedAt: now,
  });

  const pendingLinks = fetchedUrls.map((url) => ({
    id: crypto.randomUUID(),
    todoId,
    url,
  }));

  // Insert any URLs — fetched ones start pending, attachments start settled.
  const totalUrls = fetchedUrls.length + attachedUrls.length;
  if (totalUrls > 0) {
    const urlPositions = generateNKeysBetween(null, null, totalUrls);
    await db.insert(todoUrls).values([
      ...pendingLinks.map((link, i) => ({
        ...link,
        position: urlPositions[i],
        fetchStatus: "pending" as const,
        createdAt: now,
        updatedAt: now,
      })),
      ...attachedUrls.map((a, i) => ({
        id: crypto.randomUUID(),
        todoId,
        url: a.url,
        title: a.title ?? null,
        siteName: a.siteName ?? null,
        position: urlPositions[fetchedUrls.length + i],
        fetchStatus: "fetched" as const,
        fetchedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    ]);
  }

  // Fetch the created todo to return
  const created = await db
    .select()
    .from(todos)
    .where(eq(todos.id, todoId))
    .then((rows) => rows[0]);
  // The links just inserted, so a client can show them before its next sync.
  const urls =
    totalUrls > 0
      ? await db
          .select()
          .from(todoUrls)
          .where(eq(todoUrls.todoId, todoId))
          .orderBy(todoUrls.position)
      : [];

  // Fetch metadata for the pending links in the background, then name the todo
  // after what came back if its title is still the "Check {domain}"
  // placeholder. Attachments already carry their title and must not be
  // re-fetched. Started after the read-back above, so the response always
  // shows the links as inserted.
  if (pendingLinks.length > 0) {
    options.waitUntil(finishTodoLinks(db, env, userId, pendingLinks));
  }

  Sentry.addBreadcrumb({
    category: "todo",
    message: "todo.created",
    data: { method: "smart" },
    level: "info",
  });

  await notifySync(env, userId);

  return { todo: { ...serializeTodo(created), urls: urls.map(serializeUrl) } };
}
