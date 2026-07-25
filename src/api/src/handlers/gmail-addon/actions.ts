import type { Context } from "hono";
import { resolveNylonUser } from "../../lib/addon-auth";
import { buildHomepageCard, QUICK_ADD_INPUT } from "../../lib/addon-cards";
import { createSmartTodo } from "../../lib/create-todo";
import { eq, getDb, users } from "../../lib/db";
import { listOpenTodos, setTodoCompleted } from "../../lib/todos-core";
import type { Env } from "../../types";
import {
  cardResponse,
  connectResponse,
  MAX_ADDON_TODO_TEXT,
  readAddonEvent,
  readFormInput,
  readParameter,
  requestBaseUrl,
} from "./shared";

const HOMEPAGE_TODO_LIMIT = 10;

/** Load the user's AI master switch so card creates mirror POST /todos/smart. */
async function loadAiEnabled(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<boolean> {
  const [user] = await db
    .select({ aiEnabled: users.aiEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.aiEnabled ?? true;
}

/** Rebuild the homepage card from the current open-todos list, with a toast. */
async function refreshedHomepage(
  c: Context<Env>,
  userId: string,
  notification: string,
) {
  const open = await listOpenTodos(getDb(c.env.DB), userId);
  const card = buildHomepageCard(
    requestBaseUrl(c),
    open.slice(0, HOMEPAGE_TODO_LIMIT).map((t) => ({
      id: t.id.toLowerCase(),
      title: t.title,
    })),
  );
  return cardResponse(c, card, { asAction: true, notification });
}

// POST /gmail-addon/actions/quick-add — submit the homepage quick-add box.
export async function gmailAddonQuickAdd(c: Context<Env>) {
  const claims = c.get("googleClaims");
  const db = getDb(c.env.DB);

  const resolved = await resolveNylonUser(db, c.env, claims);
  if (resolved.status !== "linked") {
    return connectResponse(c, claims, { asAction: true });
  }

  const event = await readAddonEvent(c);
  const text = readFormInput(event, QUICK_ADD_INPUT);
  if (!text) {
    return refreshedHomepage(c, resolved.userId, "Type a todo first");
  }
  if (text.length > MAX_ADDON_TODO_TEXT) {
    return refreshedHomepage(c, resolved.userId, "That todo is too long");
  }

  await createSmartTodo(db, c.env, resolved.userId, text, {
    aiEnabled: await loadAiEnabled(db, resolved.userId),
    enrich: true,
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  });

  return refreshedHomepage(c, resolved.userId, "Added to Nylon");
}

// POST /gmail-addon/actions/add-from-message — add the open message as a todo.
export async function gmailAddonAddFromMessage(c: Context<Env>) {
  const claims = c.get("googleClaims");
  const db = getDb(c.env.DB);

  const resolved = await resolveNylonUser(db, c.env, claims);
  if (resolved.status !== "linked") {
    return connectResponse(c, claims, { asAction: true });
  }

  const event = await readAddonEvent(c);
  const text = readFormInput(event, QUICK_ADD_INPUT);
  if (!text) {
    return refreshedHomepage(c, resolved.userId, "Add a title first");
  }
  if (text.length > MAX_ADDON_TODO_TEXT) {
    return refreshedHomepage(c, resolved.userId, "That todo is too long");
  }
  const permalink = readParameter(event, "permalink");

  await createSmartTodo(db, c.env, resolved.userId, text, {
    aiEnabled: await loadAiEnabled(db, resolved.userId),
    enrich: true,
    extraUrls: permalink ? [permalink] : undefined,
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  });

  return refreshedHomepage(c, resolved.userId, "Added to Nylon");
}

// POST /gmail-addon/actions/toggle — tick an open todo complete.
export async function gmailAddonToggle(c: Context<Env>) {
  const claims = c.get("googleClaims");
  const db = getDb(c.env.DB);

  const resolved = await resolveNylonUser(db, c.env, claims);
  if (resolved.status !== "linked") {
    return connectResponse(c, claims, { asAction: true });
  }

  const event = await readAddonEvent(c);
  const todoId = readParameter(event, "todoId");
  if (todoId) {
    await setTodoCompleted(db, c.env, resolved.userId, todoId, true);
  }

  return refreshedHomepage(c, resolved.userId, "Marked done");
}
