import { getUserTimezone } from "@nylon-impossible/shared/queries";
import type { Context } from "hono";
import { buildContextualCard } from "../../lib/addon-cards";
import { listListsForUser } from "../../lib/todos-core";
import type { Env } from "../../types";
import {
  cardResponse,
  loadMessageContext,
  readAddonEvent,
  requestBaseUrl,
  withLinkedUser,
} from "./shared";

// POST /gmail-addon/contextual — panel opened with a message in context.
export async function gmailAddonContextual(c: Context<Env>) {
  const linked = await withLinkedUser(c);
  if (linked.response) return linked.response;
  const { db, userId } = linked;

  const [event, lists, timeZone] = await Promise.all([
    readAddonEvent(c),
    listListsForUser(db, userId),
    getUserTimezone(db, userId),
  ]);
  const message = await loadMessageContext(event, timeZone);
  const card = buildContextualCard(requestBaseUrl(c), message, lists);
  return cardResponse(c, card);
}
