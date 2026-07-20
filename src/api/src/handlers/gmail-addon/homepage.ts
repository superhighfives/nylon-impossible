import type { Context } from "hono";
import { resolveNylonUser } from "../../lib/addon-auth";
import { buildHomepageCard } from "../../lib/addon-cards";
import { getDb } from "../../lib/db";
import { listOpenTodos } from "../../lib/todos-core";
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

  const open = await listOpenTodos(db, resolved.userId);
  const card = buildHomepageCard(
    requestBaseUrl(c),
    open.slice(0, HOMEPAGE_TODO_LIMIT).map((t) => ({
      id: t.id.toLowerCase(),
      title: t.title,
    })),
  );
  return cardResponse(c, card);
}
