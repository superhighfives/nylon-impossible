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

import { type BoardView, boardUrl, dueLabel } from "@nylon-impossible/shared";

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
  /** Unset is OUTLINED; FILLED is for the card's primary action. */
  type?: "FILLED" | "OUTLINED";
}

interface Section {
  header?: string;
  widgets: Widget[];
  collapsible?: boolean;
  /** Widgets still shown while collapsed; 0 leaves just the header. */
  uncollapsibleWidgetsCount?: number;
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
  undoAdd: "/gmail-addon/actions/undo-add",
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
// week with tick-to-done, then Someday collapsed to a count. Copy follows the
// redesign spec's Vocabulary (todo, Today / This week / Someday, Pin, Done).
// ---------------------------------------------------------------------------

/** Name of the composer text input, referenced by the submit action handlers. */
export const QUICK_ADD_INPUT = "todoText";

/** Name of the composer list dropdown, referenced by the submit action handlers. */
export const QUICK_ADD_LIST_INPUT = "listId";

/** Rows shown per section before the rest collapse to "N more". */
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
  /**
   * Ticked within `ADDON_DONE_WINDOW_MS`: it stays in place, checked and
   * struck through, so it can be unticked. There's no Undo in a card.
   */
  done: boolean;
}

export interface HomepageCardInput {
  /** Every list the user has, in any order: the dropdown sorts them. */
  lists: AddonListOption[];
  /**
   * Open top-level todos across every list, pinned first within a list,
   * plus any ticked in the last `ADDON_DONE_WINDOW_MS`, in their places.
   */
  todos: AddonTodo[];
  /** The web app's base URL; the "Open" links deep-link into its lists. */
  webUrl: string;
  now: Date;
  timeZone: string;
}

const TIME_ORDER: AddonSystemKind[] = ["today", "thisWeek", "someday"];

/** Today, This week, Someday, then your lists in their own order. */
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
      items: orderAddonLists(lists)
        .filter((list, i) => i < ADDON_DROPDOWN_LIMIT || list.id === selectedId)
        .map((list) => ({
          text: list.name,
          value: list.id,
          selected: list.id === selectedId,
        })),
    },
  };
}

/**
 * A row: the title, its meta line, and a checkbox that marks it done. A row
 * ticked in the last few minutes stays checked and struck through, and
 * unticking it marks it not done.
 */
function todoRowWidget(
  baseUrl: string,
  todo: AddonTodo,
  now: Date,
  timeZone: string,
): Widget {
  const meta = addonTodoMeta(todo, now, timeZone);
  const title = escapeCardText(todo.title);
  return {
    decoratedText: {
      text: todo.done ? `<s>${title}</s>` : title,
      ...(meta ? { bottomLabel: meta } : {}),
      wrapText: true,
      switchControl: {
        name: `done_${todo.id}`,
        selected: todo.done,
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

/**
 * Card size budget. Google doesn't publish one hard number for Workspace
 * add-on cards, but the panel gets slow and long cards are clipped well before
 * the documented ceilings (100 widgets per card for card-based UIs, and the
 * response payload limit), so the homepage designs for at most ~60 widgets:
 *
 *   composer                        3
 *   Today + This week               up to 8 rows + 1 overflow each  = 18
 *   Someday + your lists            share ADDON_ROW_BUDGET rows, plus one
 *                                   overflow row per section
 *   list sections                   at most ADDON_MAX_LIST_SECTIONS, then a
 *                                   single "N more lists" row
 *
 * which tops out at 3 + 18 + 24 + 7 + 1 = 53 widgets.
 */
export const ADDON_ROW_BUDGET = 24;
export const ADDON_MAX_LIST_SECTIONS = 6;

/**
 * How long a ticked todo stays on the card, checked, so a mis-tap can be
 * unticked. The card is rebuilt from current data on every action, so after
 * the window the row drops off on the next refresh with nothing to clean up.
 */
export const ADDON_DONE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Google documents 100 widgets and 100 sections per card but no item limit
 * for a dropdown, so the list dropdown is held to the same 100 rather than
 * trusting an unbounded number of lists to render.
 */
export const ADDON_DROPDOWN_LIMIT = 100;

function overflowRow(text: string, url: string): Widget {
  return { decoratedText: { text, button: openNylonButton(url, "Open") } };
}

/**
 * A section of tick rows, headed "Name · N" (N counts the open ones): up to
 * `limit` rows, a written `empty` line when there are none, and "N more in
 * <name>" with an Open link for the rest.
 */
function todoSection(
  baseUrl: string,
  input: HomepageCardInput,
  name: string,
  /** Where "N more in <name>" opens in the web app. */
  view: BoardView,
  rows: AddonTodo[],
  opts: { limit: number; empty?: string; collapsed?: boolean },
): Section {
  const shown = rows.slice(0, Math.max(0, opts.limit));
  const widgets: Widget[] = shown.map((todo) =>
    todoRowWidget(baseUrl, todo, input.now, input.timeZone),
  );
  if (rows.length === 0 && opts.empty) {
    widgets.push({ textParagraph: { text: opts.empty } });
  }
  const hidden = rows.length - shown.length;
  if (hidden > 0) {
    widgets.push(
      overflowRow(`${hidden} more in ${name}`, boardUrl(input.webUrl, view)),
    );
  }
  const header = `${name} · ${rows.filter((todo) => !todo.done).length}`;
  if (!opts.collapsed) return { header, widgets };
  // Collapsed sections show only the header; the rows open on demand.
  return {
    header,
    collapsible: true,
    uncollapsibleWidgetsCount: 0,
    widgets,
  };
}

/**
 * Homepage card: the composer (list dropdown defaulting to Today, a filled
 * Add), Today and This week open with tick-to-done, then Someday and each of your lists as
 * collapsed "Name · N" sections that expand to the same rows. Lists with no
 * open todos are left out. Each "N more in X" opens X in the web app
 * (`/this-week`, `/list/:id`), and "N more lists" opens Lists.
 */
export function buildHomepageCard(
  baseUrl: string,
  input: HomepageCardInput,
): Card {
  const rowsFor = (id: string | undefined) =>
    id ? input.todos.filter((todo) => todo.listId === id) : [];
  const idFor = (kind: AddonSystemKind) =>
    input.lists.find((list) => list.systemKind === kind)?.id;
  const today = rowsFor(idFor("today"));
  const thisWeek = rowsFor(idFor("thisWeek"));
  const someday = rowsFor(idFor("someday"));

  const waiting = thisWeek.filter((todo) => !todo.done).length;
  const todayEmpty =
    waiting > 0
      ? `Nothing today. ${waiting} waiting in This week.`
      : "Nothing today.";

  const sections: Section[] = [
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
                type: "FILLED",
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
    todoSection(baseUrl, input, "Today", { kind: "today" }, today, {
      limit: ADDON_SECTION_LIMIT,
      empty: todayEmpty,
    }),
    todoSection(baseUrl, input, "This week", { kind: "thisWeek" }, thisWeek, {
      limit: ADDON_SECTION_LIMIT,
      empty: "Nothing this week.",
    }),
  ];

  // Someday and your lists draw rows from one shared budget, in order.
  let budget = ADDON_ROW_BUDGET;
  const collapsed = (name: string, view: BoardView, rows: AddonTodo[]) => {
    const limit = Math.min(ADDON_SECTION_LIMIT, budget);
    budget -= Math.min(limit, rows.length);
    return todoSection(baseUrl, input, name, view, rows, {
      limit,
      empty: `Nothing in ${name}.`,
      collapsed: true,
    });
  };

  sections.push(collapsed("Someday", { kind: "someday" }, someday));

  const yourLists = orderAddonLists(input.lists)
    .filter((list) => list.systemKind === null)
    .map((list) => ({ list, rows: rowsFor(list.id) }))
    .filter(({ rows }) => rows.length > 0);
  for (const { list, rows } of yourLists.slice(0, ADDON_MAX_LIST_SECTIONS)) {
    sections.push(
      collapsed(escapeCardText(list.name), { kind: "list", id: list.id }, rows),
    );
  }
  const moreLists = yourLists.length - ADDON_MAX_LIST_SECTIONS;
  if (moreLists > 0) {
    sections.push({
      widgets: [
        {
          decoratedText: {
            text: plural(moreLists, "more list"),
            button: openNylonButton(
              boardUrl(input.webUrl, { kind: "lists" }),
              "Open",
            ),
          },
        },
      ],
    });
  }

  // No card header: the panel's own header already says Nylon.
  return { sections };
}

export interface AddonMessage {
  subject: string;
  permalink: string | null;
}

/** What add-from-message just made, for the card's confirmation. */
export interface AddonAdded {
  todoId: string;
  title: string;
  listName: string;
  /** Where Open in Nylon goes: the list it went into. */
  url: string;
}

/** The message's subject and permalink, carried on the card's actions. */
function messageParameters(message: AddonMessage) {
  return message.permalink
    ? [
        { key: "permalink", value: message.permalink },
        { key: "subject", value: message.subject },
      ]
    : [];
}

/**
 * Contextual card shown with a message open: "Add to Nylon", titled from the
 * subject, with the same list dropdown (default Today). The open email shows
 * as a row ("Attached as a link" over its subject), and the thread permalink
 * rides along as a hidden parameter so the todo gets the email as a link.
 *
 * After Add, an "Added to <list>" section leads the card, with Open in Nylon
 * and Undo (which deletes the todo it just made); the composer stays below
 * it for another.
 */
export function buildContextualCard(
  baseUrl: string,
  message: AddonMessage,
  lists: AddonListOption[],
  added?: AddonAdded,
): Card {
  const sections: Section[] = [];
  if (added) {
    sections.push({
      header: `Added to ${escapeCardText(added.listName)}`,
      widgets: [
        {
          decoratedText: { text: escapeCardText(added.title), wrapText: true },
        },
        {
          buttonList: {
            buttons: [
              openNylonButton(added.url, "Open in Nylon"),
              {
                text: "Undo",
                onClick: {
                  action: {
                    function: actionUrl(baseUrl, ADDON_ACTIONS.undoAdd),
                    parameters: [
                      { key: "todoId", value: added.todoId },
                      ...messageParameters(message),
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
    });
  }
  sections.push({
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
              decoratedText: {
                topLabel: "Attached as a link",
                text: escapeCardText(message.subject),
                wrapText: true,
              },
            } satisfies Widget,
          ]
        : []),
      {
        buttonList: {
          buttons: [
            {
              text: "Add",
              type: "FILLED",
              onClick: {
                action: {
                  function: actionUrl(baseUrl, ADDON_ACTIONS.addFromMessage),
                  parameters: messageParameters(message),
                },
              },
            },
          ],
        },
      },
    ],
  });
  return { header: { title: "Add to Nylon" }, sections };
}

/**
 * "Connect Nylon" card shown when the Google identity isn't linked to any Nylon
 * account. "Connect Nylon" opens the web connect flow (Clerk auth + link) in the
 * browser; since the panel can't refresh itself once linking completes there,
 * "I’ve connected" re-invokes the add-on so it re-resolves the identity and
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
              text: "Connect your Nylon account to add todos from Gmail and mark them done. After connecting in the browser, tap “I’ve connected” to refresh.",
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
                  text: "I’ve connected",
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
