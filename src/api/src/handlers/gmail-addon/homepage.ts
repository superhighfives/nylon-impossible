import type { Context } from "hono";
import { resolveNylonUser } from "../../lib/addon-auth";
import { buildHomepageCard } from "../../lib/addon-cards";
import { getDb } from "../../lib/db";
import { getSystemListId } from "../../lib/lists";
import { listListsForUser, listOpenTodos } from "../../lib/todos-core";
import type { Env } from "../../types";
import { cardResponse, connectResponse, requestBaseUrl } from "./shared";

/** How many open todos to show on the homepage card. */
const HOMEPAGE_TODO_LIMIT = 10;

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

  return buildHomepageCard(
    requestBaseUrl(c),
    open.slice(0, HOMEPAGE_TODO_LIMIT).map((t) => ({
      id: t.id.toLowerCase(),
      title: t.title,
      listId: t.listId,
      listName: t.listName,
    })),
    userLists,
    todayListId,
  );
}
