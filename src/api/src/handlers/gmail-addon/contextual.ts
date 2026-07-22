import type { Context } from "hono";
import { resolveNylonUser } from "../../lib/addon-auth";
import { buildContextualCard } from "../../lib/addon-cards";
import { getDb } from "../../lib/db";
import type { Env } from "../../types";
import {
  cardResponse,
  connectResponse,
  extractMessageContext,
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

  const event = await readAddonEvent(c);
  const message = extractMessageContext(event);
  const card = buildContextualCard(requestBaseUrl(c), message);
  return cardResponse(c, card);
}
