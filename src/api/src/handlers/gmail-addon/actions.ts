import { type BoardView, boardUrl, dueLabel } from "@nylon-impossible/shared";
import type { Context } from "hono";
import { resolveNylonUser } from "../../lib/addon-auth";
import {
  ADDON_DONE_VALUE,
  type AddonAdded,
  type AddonListOption,
  type AddonMessage,
  buildContextualCard,
  doneInputName,
  QUICK_ADD_INPUT,
  QUICK_ADD_LIST_INPUT,
} from "../../lib/addon-cards";
import { createSmartTodo } from "../../lib/create-todo";
import { and, eq, getDb, todos } from "../../lib/db";
import { verifyListOwnership } from "../../lib/lists";
import { notifySync } from "../../lib/notify-sync";
import { listListsForUser, setTodoCompleted } from "../../lib/todos-core";
import type { Env } from "../../types";
import { buildRefreshedHomepageCard, type HomepageData } from "./homepage";
import {
  type AddonEvent,
  cardResponse,
  connectResponse,
  MAX_ADDON_TODO_TEXT,
  messageFromAction,
  readAddonEvent,
  readFormInput,
  readParameter,
  requestBaseUrl,
  webBaseUrl,
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

/**
 * Redraw the contextual card for the open message, optionally leading with
 * what was just added, with an optional toast.
 */
async function refreshedContextual(
  c: Context<Env>,
  userId: string,
  message: AddonMessage,
  opts: { added?: AddonAdded; notification?: string } = {},
) {
  const lists = await listListsForUser(getDb(c.env.DB), userId);
  const card = buildContextualCard(
    requestBaseUrl(c),
    message,
    lists,
    opts.added,
  );
  return cardResponse(c, card, {
    asAction: true,
    notification: opts.notification,
  });
}

/** A list's place in the web app: its own page, or `/list/:id`. */
function listView(list: AddonListOption | undefined, id: string): BoardView {
  return list?.systemKind ? { kind: list.systemKind } : { kind: "list", id };
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
// The card stays on the message and leads with "Added to <list>", with Open in
// Nylon and Undo, rather than only flashing a toast.
export async function gmailAddonAddFromMessage(c: Context<Env>) {
  const claims = c.get("googleClaims");
  const db = getDb(c.env.DB);

  const resolved = await resolveNylonUser(db, c.env, claims);
  if (resolved.status !== "linked") {
    return connectResponse(c, claims, { asAction: true });
  }

  const event = await readAddonEvent(c);
  const message = messageFromAction(event);
  const text = readFormInput(event, QUICK_ADD_INPUT);
  if (!text) {
    return refreshedContextual(c, resolved.userId, message, {
      notification: "Add a title first",
    });
  }
  if (text.length > MAX_ADDON_TODO_TEXT) {
    return refreshedContextual(c, resolved.userId, message, {
      notification: "That todo is too long",
    });
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

  const lists = await listListsForUser(db, resolved.userId);
  const list = lists.find((l) => l.id === todo.listId);
  const card = buildContextualCard(requestBaseUrl(c), message, lists, {
    todoId: todo.id,
    title: todo.title,
    listName: list?.name ?? "Nylon",
    url: boardUrl(webBaseUrl(c), listView(list, todo.listId)),
  });
  return cardResponse(c, card, { asAction: true });
}

// POST /gmail-addon/actions/undo-add — Undo on the contextual card's "Added
// to <list>": delete the todo add-from-message just made, and go back to the
// card for the message.
export async function gmailAddonUndoAdd(c: Context<Env>) {
  const claims = c.get("googleClaims");
  const db = getDb(c.env.DB);

  const resolved = await resolveNylonUser(db, c.env, claims);
  if (resolved.status !== "linked") {
    return connectResponse(c, claims, { asAction: true });
  }

  const event = await readAddonEvent(c);
  const todoId = readParameter(event, "todoId");
  if (todoId) {
    const deleted = await db
      .delete(todos)
      .where(and(eq(todos.id, todoId), eq(todos.userId, resolved.userId)))
      .returning({ id: todos.id });
    if (deleted.length > 0) await notifySync(c.env, resolved.userId);
  }
  return refreshedContextual(c, resolved.userId, messageFromAction(event), {
    notification: "Removed",
  });
}

// POST /gmail-addon/actions/toggle — tick an open todo's checkbox to mark it
// done. A repeat rolls forward instead, and the toast says when it's next and,
// if it left the list, where it went — the apps' "Done · next Mon, in This
// week". A todo ticked in the last few minutes is still on the card, checked;
// unticking it marks it not done ("Back in Today").
//
// A checked box sends its value, so a tick always means done: ticking twice,
// or ticking on an old card something already finished elsewhere, leaves it
// done rather than reopening it. When the box's state doesn't come through
// (unticked, or a host that leaves it out), the toggle flips what's stored.
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
    .select({ listId: todos.listId, completed: todos.completed })
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, resolved.userId)));
  const ticked =
    readFormInput(event, doneInputName(todoId)) === ADDON_DONE_VALUE;
  const done = ticked || !before?.completed;
  const updated = await setTodoCompleted(
    db,
    c.env,
    resolved.userId,
    todoId,
    done,
  );

  if (!done && updated) {
    const listId = updated.listId;
    return refreshedHomepage(
      c,
      resolved.userId,
      (data) => `Back in ${listName(data, listId)}`,
    );
  }

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
