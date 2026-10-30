import type { Context } from "hono";
import { resolveNylonUser } from "../../lib/addon-auth";
import { buildContextualCard } from "../../lib/addon-cards";
import { getDb } from "../../lib/db";
import { listListsForUser } from "../../lib/todos-core";
import { getUserTimezone } from "../../lib/user-timezone";
import type { Env } from "../../types";
import {
  cardResponse,
  connectResponse,
  loadMessageContext,
  readAddonEvent,
  requestBaseUrl,
} from "./shared";

// POST /gmail-addon/contextual — panel opened with a message in context.
export async function gmailAddonContextual(c: Context<Env>) {
  const claims = c.get("googleClaims");
  const db = getDb(c.env.DB);

  const resolved = await resolveNylonUser(db, c.env, claims);
  if (resolved.status !== "linked") {
    return connectResponse(c, claims);
  }

  const [event, lists, timeZone] = await Promise.all([
    readAddonEvent(c),
    listListsForUser(db, resolved.userId),
    getUserTimezone(db, resolved.userId),
  ]);
  const message = await loadMessageContext(event, timeZone);
  const card = buildContextualCard(requestBaseUrl(c), message, lists);
  return cardResponse(c, card);
}
