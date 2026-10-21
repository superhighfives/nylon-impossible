/**
 * Pure JSON builders for the Gmail add-on's cards and response envelopes. No
 * I/O here — handlers fetch data, call these to shape the card, and return the
 * result. Keeping the wire format in one module means the (only live-verifiable)
 * envelope shape has a single place to adjust while iterating against a real
 * Google Workspace deployment.
 *
 * Card JSON follows the Google Workspace Add-on "Card-based interfaces" format;
 * action `function` values are absolute HTTPS URLs to our own endpoints (the
 * HTTP-endpoint / alternate-runtime model), not Apps Script function names.
 */

import { dueLabel } from "@nylon-impossible/shared";

// ---------------------------------------------------------------------------
// Card widget types (minimal subset we use)
// ---------------------------------------------------------------------------

interface CardAction {
  function: string;
  parameters?: { key: string; value: string }[];
}

interface OnClick {
  action?: CardAction;
  openLink?: { url: string };
}

interface Widget {
  textParagraph?: { text: string };
  decoratedText?: {
    text: string;
    topLabel?: string;
    bottomLabel?: string;
    wrapText?: boolean;
    button?: Button;
    switchControl?: {
      name: string;
      selected: boolean;
      controlType: "CHECKBOX" | "SWITCH";
      onChangeAction: CardAction;
    };
    onClick?: OnClick;
  };
  textInput?: {
    name: string;
    label?: string;
    value?: string;
    hintText?: string;
  };
  selectionInput?: {
    name: string;
    label?: string;
    type: "DROPDOWN";
    items: { text: string; value: string; selected?: boolean }[];
  };
  buttonList?: { buttons: Button[] };
  divider?: Record<string, never>;
}

interface Button {
  text: string;
  onClick: OnClick;
  disabled?: boolean;
}

interface Section {
  header?: string;
  widgets: Widget[];
  collapsible?: boolean;
}

export interface Card {
  header?: { title: string; subtitle?: string; imageUrl?: string };
  sections: Section[];
}

// ---------------------------------------------------------------------------
// Response envelopes
//
// Homepage / contextual triggers push a fresh card; action callbacks update the
// card in place and may flash a toast notification. These two shapes are the
// only parts that must match Google's runtime exactly — hence the single home.
// ---------------------------------------------------------------------------

/** Render envelope for a homepage/contextual trigger. */
export function renderCard(card: Card) {
  return {
    action: {
      navigations: [{ pushCard: card }],
    },
  };
}

/** Action-callback envelope that replaces the current card, with an optional toast. */
export function updateCard(card: Card, notification?: string) {
  return {
    renderActions: {
      action: {
        navigations: [{ updateCard: card }],
        ...(notification ? { notification: { text: notification } } : {}),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Action URLs
// ---------------------------------------------------------------------------

export const ADDON_ACTIONS = {
  quickAdd: "/gmail-addon/actions/quick-add",
  addFromMessage: "/gmail-addon/actions/add-from-message",
  toggle: "/gmail-addon/actions/toggle",
  refresh: "/gmail-addon/actions/refresh",
} as const;

function actionUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

// ---------------------------------------------------------------------------
// Cards
//
// The card format fixes the look, so the add-on matches the apps on structure
// and words instead: a composer with a list dropdown, then Today and This
// Week with tick-to-done, then Someday collapsed to a count. Copy follows the
// redesign spec's Vocabulary (todo, Today / This Week / Someday, Pin, Done).
// ---------------------------------------------------------------------------

/** Name of the composer text input, referenced by the submit action handlers. */
export const QUICK_ADD_INPUT = "todoText";

/** Name of the composer list dropdown, referenced by the submit action handlers. */
export const QUICK_ADD_LIST_INPUT = "listId";

/** Rows shown per time section before the rest collapse to "N more". */
export const ADDON_SECTION_LIMIT = 8;

export type AddonSystemKind = "today" | "thisWeek" | "someday";

export interface AddonListOption {
  id: string;
  name: string;
  systemKind: AddonSystemKind | null;
}

export interface AddonTodo {
  id: string;
  title: string;
  listId: string;
  dueDate: Date | null;
  pinned: boolean;
  repeats: boolean;
}

export interface HomepageCardInput {
  /** Every list the user has, in any order: the dropdown sorts them. */
  lists: AddonListOption[];
  /** Open top-level todos across every list, pinned first within a list. */
  todos: AddonTodo[];
  /** The web app, for Someday's link and the "N more" overflow row. */
  webUrl: string;
  now: Date;
  timeZone: string;
}

const TIME_ORDER: AddonSystemKind[] = ["today", "thisWeek", "someday"];

/** Today, This Week, Someday, then your lists in their own order. */
export function orderAddonLists(lists: AddonListOption[]): AddonListOption[] {
  const time = TIME_ORDER.flatMap((kind) =>
    lists.filter((list) => list.systemKind === kind),
  );
  return [...time, ...lists.filter((list) => list.systemKind === null)];
}

/** Card text fields accept a little HTML, so a todo title must be escaped. */
export function escapeCardText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * The row's meta line, in the apps' words: Pinned, then the due label
 * ("Today", "Tomorrow", "Fri", "Oct 30", "3 days overdue"), then Repeat.
 * Undefined when there's nothing to say, so the row stays one line.
 */
export function addonTodoMeta(
  todo: Pick<AddonTodo, "dueDate" | "pinned" | "repeats">,
  now: Date,
  timeZone: string,
): string | undefined {
  const parts: string[] = [];
  if (todo.pinned) parts.push("Pinned");
  if (todo.dueDate) parts.push(dueLabel(todo.dueDate, now, timeZone).text);
  if (todo.repeats) parts.push("Repeat");
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** The Today list's id, falling back to the first list if it's missing. */
export function defaultAddonListId(lists: AddonListOption[]): string {
  const today = lists.find((list) => list.systemKind === "today");
  return today?.id ?? orderAddonLists(lists)[0]?.id ?? "";
}

/** The composer's list dropdown: every list, with `selectedId` chosen. */
function listDropdown(lists: AddonListOption[], selectedId: string): Widget {
  return {
    selectionInput: {
      name: QUICK_ADD_LIST_INPUT,
      label: "List",
      type: "DROPDOWN",
      items: orderAddonLists(lists).map((list) => ({
        text: list.name,
        value: list.id,
        selected: list.id === selectedId,
      })),
    },
  };
}

/** A row: the title, its meta line, and a checkbox that marks it done. */
function todoRowWidget(
  baseUrl: string,
  todo: AddonTodo,
  now: Date,
  timeZone: string,
): Widget {
  const meta = addonTodoMeta(todo, now, timeZone);
  return {
    decoratedText: {
      text: escapeCardText(todo.title),
      ...(meta ? { bottomLabel: meta } : {}),
      wrapText: true,
      switchControl: {
        name: `done_${todo.id}`,
        selected: false,
        controlType: "CHECKBOX",
        onChangeAction: {
          function: actionUrl(baseUrl, ADDON_ACTIONS.toggle),
          parameters: [{ key: "todoId", value: todo.id }],
        },
      },
    },
  };
}

function openNylonButton(webUrl: string, text = "Open Nylon"): Button {
  return { text, onClick: { openLink: { url: webUrl } } };
}

/** A time section: its rows or a written empty line, plus any overflow. */
function timeSection(
  baseUrl: string,
  input: HomepageCardInput,
  header: string,
  rows: AddonTodo[],
  empty: string,
): Section {
  const shown = rows.slice(0, ADDON_SECTION_LIMIT);
  const widgets: Widget[] = shown.map((todo) =>
    todoRowWidget(baseUrl, todo, input.now, input.timeZone),
  );
  if (rows.length === 0) {
    widgets.push({ textParagraph: { text: empty } });
  }
  const hidden = rows.length - shown.length;
  if (hidden > 0) {
    widgets.push({
      decoratedText: {
        text: `${hidden} more in ${header}`,
        button: openNylonButton(input.webUrl, "Open"),
      },
    });
  }
  return { header, widgets };
}

/**
 * Homepage card: the composer (list dropdown defaulting to Today), Today and
 * This Week with tick-to-done, and Someday collapsed to a count with a link to
 * the web app. Your lists are reachable from the dropdown, not shown as rows.
 */
export function buildHomepageCard(
  baseUrl: string,
  input: HomepageCardInput,
): Card {
  const rowsIn = (kind: AddonSystemKind) => {
    const id = input.lists.find((list) => list.systemKind === kind)?.id;
    return id ? input.todos.filter((todo) => todo.listId === id) : [];
  };
  const today = rowsIn("today");
  const thisWeek = rowsIn("thisWeek");
  const someday = rowsIn("someday");

  const todayEmpty =
    thisWeek.length > 0
      ? `Nothing today. ${thisWeek.length} waiting in This Week.`
      : "Nothing today.";

  return {
    header: { title: "Nylon" },
    sections: [
      {
        widgets: [
          {
            textInput: {
              name: QUICK_ADD_INPUT,
              label: "Add a todo",
              hintText: "Try “Call Sam tomorrow”",
            },
          },
          listDropdown(input.lists, defaultAddonListId(input.lists)),
          {
            buttonList: {
              buttons: [
                {
                  text: "Add",
                  onClick: {
                    action: {
                      function: actionUrl(baseUrl, ADDON_ACTIONS.quickAdd),
                    },
                  },
                },
              ],
            },
          },
        ],
      },
      timeSection(baseUrl, input, "Today", today, todayEmpty),
      timeSection(baseUrl, input, "This Week", thisWeek, "Nothing this week."),
      {
        header: "Someday",
        widgets: [
          {
            decoratedText: {
              text:
                someday.length > 0
                  ? plural(someday.length, "todo")
                  : "Nothing in Someday.",
              button: openNylonButton(input.webUrl),
            },
          },
        ],
      },
    ],
  };
}

/**
 * Contextual card shown with a message open: "Add to Nylon", titled from the
 * subject, with the same list dropdown (default Today). The thread permalink
 * rides along as a hidden parameter so the todo gets the email as a link.
 */
export function buildContextualCard(
  baseUrl: string,
  message: { subject: string; permalink: string | null },
  lists: AddonListOption[],
): Card {
  return {
    header: { title: "Add to Nylon" },
    sections: [
      {
        widgets: [
          {
            textInput: {
              name: QUICK_ADD_INPUT,
              label: "Todo",
              value: message.subject,
            },
          },
          listDropdown(lists, defaultAddonListId(lists)),
          ...(message.permalink
            ? [
                {
                  textParagraph: { text: "The email is attached as a link." },
                } satisfies Widget,
              ]
            : []),
          {
            buttonList: {
              buttons: [
                {
                  text: "Add",
                  onClick: {
                    action: {
                      function: actionUrl(
                        baseUrl,
                        ADDON_ACTIONS.addFromMessage,
                      ),
                      parameters: message.permalink
                        ? [
                            { key: "permalink", value: message.permalink },
                            { key: "subject", value: message.subject },
                          ]
                        : [],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * "Connect Nylon" card shown when the Google identity isn't linked to any Nylon
 * account. "Connect Nylon" opens the web connect flow (Clerk auth + link) in the
 * browser; since the panel can't refresh itself once linking completes there,
 * "I've connected" re-invokes the add-on so it re-resolves the identity and
 * swaps in the homepage card. `refreshUrl` is the absolute URL of the refresh
 * action endpoint.
 */
export function buildConnectCard(connectUrl: string, refreshUrl: string): Card {
  return {
    header: { title: "Connect Nylon" },
    sections: [
      {
        widgets: [
          {
            textParagraph: {
              text: "Connect your Nylon account to add todos from Gmail and mark them done. After connecting in the browser, tap “I've connected” to refresh.",
            },
          },
          {
            buttonList: {
              buttons: [
                {
                  text: "Connect Nylon",
                  onClick: { openLink: { url: connectUrl } },
                },
                {
                  text: "I've connected",
                  onClick: { action: { function: refreshUrl } },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
