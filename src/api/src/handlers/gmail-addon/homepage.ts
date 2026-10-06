import type { Context } from "hono";
import { resolveNylonUser } from "../../lib/addon-auth";
import { buildHomepageCard } from "../../lib/addon-cards";
import { getDb } from "../../lib/db";
import { getSystemListId } from "../../lib/lists";
import { listListsForUser, listOpenTodos } from "../../lib/todos-core";
import type { Env } from "../../types";
import { cardResponse, connectResponse, requestBaseUrl } from "./shared";

/**
 * Open todos shown per list on the homepage card, so a long Today list can't
 * push every other list off the card.
 */
const HOMEPAGE_TODOS_PER_LIST = 5;
/** Overall ceiling across all lists, to keep the card a manageable size. */
const HOMEPAGE_TODO_LIMIT = 20;

// POST /gmail-addon/homepage — panel opened with no message in context.
export async function gmailAddonHomepage(c: Context<Env>) {
  const claims = c.get("googleClaims");
  const db = getDb(c.env.DB);

  const resolved = await resolveNylonUser(db, c.env, claims);
  if (resolved.status !== "linked") {
    return connectResponse(c, claims);
  }

  const card = await buildRefreshedHomepageCard(c, db, resolved.userId);
  return cardResponse(c, card);
}

/** Shared by the homepage trigger and every action that redraws it. */
export async function buildRefreshedHomepageCard(
  c: Context<Env>,
  db: ReturnType<typeof getDb>,
  userId: string,
) {
  const [open, userLists, todayListId] = await Promise.all([
    listOpenTodos(db, userId),
    listListsForUser(db, userId),
    getSystemListId(db, userId, "today"),
  ]);
  if (!todayListId) {
    throw new Error(`No Today list found for user ${userId}`);
  }

  // `open` is already in list order, so a per-list count is enough.
  const shownPerList = new Map<string, number>();
  const shown = open
    .filter((t) => {
      const count = shownPerList.get(t.listId) ?? 0;
      if (count >= HOMEPAGE_TODOS_PER_LIST) return false;
      shownPerList.set(t.listId, count + 1);
      return true;
    })
    .slice(0, HOMEPAGE_TODO_LIMIT);

  return buildHomepageCard(
    requestBaseUrl(c),
    shown.map((t) => ({
      id: t.id.toLowerCase(),
      title: t.title,
      listId: t.listId,
      listName: t.listName,
    })),
    userLists,
    todayListId,
  );
}
