import { dueLabel } from "@nylon-impossible/shared";
import type { Context } from "hono";
import { resolveNylonUser } from "../../lib/addon-auth";
import { QUICK_ADD_INPUT, QUICK_ADD_LIST_INPUT } from "../../lib/addon-cards";
import { createSmartTodo } from "../../lib/create-todo";
import { and, eq, getDb, todos } from "../../lib/db";
import { verifyListOwnership } from "../../lib/lists";
import { setTodoCompleted } from "../../lib/todos-core";
import type { Env } from "../../types";
import { buildRefreshedHomepageCard, type HomepageData } from "./homepage";
import {
  type AddonEvent,
  cardResponse,
  connectResponse,
  MAX_ADDON_TODO_TEXT,
  readAddonEvent,
  readFormInput,
  readParameter,
} from "./shared";

type Db = ReturnType<typeof getDb>;

/**
 * Rebuild the homepage card from the current state, with a toast. The toast
 * can be a function of the reloaded data, so it can name lists and due days
 * in the user's timezone without a second round of queries.
 */
async function refreshedHomepage(
  c: Context<Env>,
  userId: string,
  notification: string | ((data: HomepageData, now: Date) => string),
) {
  const now = new Date();
  const { card, data } = await buildRefreshedHomepageCard(
    c,
    getDb(c.env.DB),
    userId,
    now,
  );
  const text =
    typeof notification === "string" ? notification : notification(data, now);
  return cardResponse(c, card, { asAction: true, notification: text });
}

function listName(data: HomepageData, listId: string): string {
  return data.lists.find((list) => list.id === listId)?.name ?? "Nylon";
}

/** "Added to Today", or "Added to Today · due Fri" when a date was typed. */
function addedToast(created: { listId: string; dueDate: string | null }) {
  return (data: HomepageData, now: Date) => {
    const where = `Added to ${listName(data, created.listId)}`;
    if (!created.dueDate) return where;
    return `${where} · due ${dueLabel(created.dueDate, now, data.timeZone).text}`;
  };
}

/** The composer's list, if it's one of the user's own; otherwise Today. */
async function selectedListId(
  db: Db,
  userId: string,
  event: AddonEvent,
): Promise<string | undefined> {
  const selected = readFormInput(event, QUICK_ADD_LIST_INPUT);
  if (!selected) return undefined;
  return (await verifyListOwnership(db, userId, selected)) ?? undefined;
}

// POST /gmail-addon/actions/refresh — re-resolve the identity after the user
// links in the browser. The connect card can't refresh itself once linking
// finishes on the web side, so this button lets the user pull the linked state
// in: linked → swap in the homepage card; still unlinked → re-show connect.
export async function gmailAddonRefresh(c: Context<Env>) {
  const claims = c.get("googleClaims");
  const db = getDb(c.env.DB);

  const resolved = await resolveNylonUser(db, c.env, claims);
  if (resolved.status !== "linked") {
    return connectResponse(c, claims, { asAction: true });
  }

  return refreshedHomepage(c, resolved.userId, "Connected");
}

// POST /gmail-addon/actions/quick-add — submit the homepage composer. The text
// goes through smart-create, so typed dates ("Call Sam tomorrow") set Due.
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

  const { todo } = await createSmartTodo(db, c.env, resolved.userId, text, {
    listId: await selectedListId(db, resolved.userId, event),
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  });

  return refreshedHomepage(c, resolved.userId, addedToast(todo));
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
  // The original email subject, carried as a hidden parameter so the attached
  // link keeps the subject as its label even if the user edits the todo title.
  const subject = readParameter(event, "subject");

  const { todo } = await createSmartTodo(db, c.env, resolved.userId, text, {
    listId: await selectedListId(db, resolved.userId, event),
    // Attach the thread permalink with the subject as its title so it renders
    // as an email link (subject + Gmail icon) without a doomed metadata fetch.
    attachedUrls: permalink
      ? [{ url: permalink, title: subject ?? text, siteName: "Gmail" }]
      : undefined,
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  });

  return refreshedHomepage(c, resolved.userId, addedToast(todo));
}

// POST /gmail-addon/actions/toggle — tick an open todo's checkbox to mark it
// done. A repeat rolls forward instead, and the toast says when it's next and,
// if it left the list, where it went — the apps' "Done · next Mon, in This
// Week".
export async function gmailAddonToggle(c: Context<Env>) {
  const claims = c.get("googleClaims");
  const db = getDb(c.env.DB);

  const resolved = await resolveNylonUser(db, c.env, claims);
  if (resolved.status !== "linked") {
    return connectResponse(c, claims, { asAction: true });
  }

  const event = await readAddonEvent(c);
  const todoId = readParameter(event, "todoId");
  if (!todoId) return refreshedHomepage(c, resolved.userId, "Done");

  const [before] = await db
    .select({ listId: todos.listId })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, resolved.userId)));
  const updated = await setTodoCompleted(
    db,
    c.env,
    resolved.userId,
    todoId,
    true,
  );

  if (!updated || updated.completed || !updated.dueDate || !before) {
    return refreshedHomepage(c, resolved.userId, "Done");
  }
  const nextDue = updated.dueDate;
  return refreshedHomepage(c, resolved.userId, (data, now) => {
    const next = dueLabel(nextDue, now, data.timeZone).text;
    const where =
      updated.listId === before.listId
        ? ""
        : `, in ${listName(data, updated.listId)}`;
    return `Done · next ${next}${where}`;
  });
}
