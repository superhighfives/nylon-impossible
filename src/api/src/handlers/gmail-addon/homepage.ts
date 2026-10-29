import type { Context } from "hono";
import { resolveNylonUser } from "../../lib/addon-auth";
import {
  ADDON_DONE_WINDOW_MS,
  type AddonListOption,
  type AddonTodo,
  buildHomepageCard,
  type Card,
} from "../../lib/addon-cards";
import { getDb } from "../../lib/db";
import { listListsForUser, listOpenTodos } from "../../lib/todos-core";
import { getUserTimezone } from "../../lib/user-timezone";
import type { Env } from "../../types";
import {
  cardResponse,
  connectResponse,
  requestBaseUrl,
  webBaseUrl,
} from "./shared";

type Db = ReturnType<typeof getDb>;

// POST /gmail-addon/homepage — panel opened with no message in context.
export async function gmailAddonHomepage(c: Context<Env>) {
  const claims = c.get("googleClaims");
  const db = getDb(c.env.DB);

  const resolved = await resolveNylonUser(db, c.env, claims);
  if (resolved.status !== "linked") {
    return connectResponse(c, claims);
  }

  const { card } = await buildRefreshedHomepageCard(c, db, resolved.userId);
  return cardResponse(c, card);
}

export interface HomepageData {
  lists: AddonListOption[];
  todos: AddonTodo[];
  timeZone: string;
}

/**
 * Everything the homepage card and the action toasts read: open todos, and
 * those ticked in the last `ADDON_DONE_WINDOW_MS` so they can be unticked.
 */
export async function loadHomepageData(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<HomepageData> {
  const doneSince = new Date(now.getTime() - ADDON_DONE_WINDOW_MS);
  const [open, lists, timeZone] = await Promise.all([
    listOpenTodos(db, userId, { doneSince }),
    listListsForUser(db, userId),
    getUserTimezone(db, userId),
  ]);
  if (!lists.some((list) => list.systemKind === "today")) {
    throw new Error(`No Today list found for user ${userId}`);
  }
  return {
    lists,
    timeZone,
    todos: open.map((t) => ({
      id: t.id.toLowerCase(),
      title: t.title,
      listId: t.listId,
      dueDate: t.dueDate,
      pinned: t.pinned,
      repeats: t.recurrence != null,
      done: t.completed,
    })),
  };
}

/** Shared by the homepage trigger and every action that redraws it. */
export async function buildRefreshedHomepageCard(
  c: Context<Env>,
  db: Db,
  userId: string,
  now = new Date(),
): Promise<{ card: Card; data: HomepageData }> {
  const data = await loadHomepageData(db, userId, now);
  const card = buildHomepageCard(requestBaseUrl(c), {
    ...data,
    webUrl: webBaseUrl(c),
    now,
  });
  return { card, data };
}
