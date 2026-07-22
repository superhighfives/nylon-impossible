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

// ---------------------------------------------------------------------------
// Card widget types (minimal subset we use)
// ---------------------------------------------------------------------------

interface OnClick {
  action?: {
    function: string;
    parameters?: { key: string; value: string }[];
  };
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
    onClick?: OnClick;
  };
  textInput?: {
    name: string;
    label?: string;
    value?: string;
    hintText?: string;
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
} as const;

function actionUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Name of the quick-add text input, referenced by the submit action handler. */
export const QUICK_ADD_INPUT = "todoText";

export interface OpenTodoCard {
  id: string;
  title: string;
}

/**
 * Homepage card: a quick-add box over the user's open top-level todos, each
 * tickable. `todos` is expected to already be trimmed to a display-friendly
 * count by the caller.
 */
export function buildHomepageCard(
  baseUrl: string,
  todos: OpenTodoCard[],
): Card {
  const sections: Section[] = [
    {
      header: "Quick add",
      widgets: [
        {
          textInput: {
            name: QUICK_ADD_INPUT,
            label: "Add a todo",
            hintText: "e.g. Book dentist appointment",
          },
        },
        {
          buttonList: {
            buttons: [
              {
                text: "Add to Nylon",
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
  ];

  if (todos.length > 0) {
    sections.push({
      header: "Open todos",
      widgets: todos.map((todo) => todoRowWidget(baseUrl, todo)),
    });
  } else {
    sections.push({
      widgets: [
        { textParagraph: { text: "Nothing open — you're all caught up." } },
      ],
    });
  }

  return {
    header: { title: "Nylon" },
    sections,
  };
}

/** A single open-todo row with a "Done" button that toggles completion. */
function todoRowWidget(baseUrl: string, todo: OpenTodoCard): Widget {
  return {
    decoratedText: {
      text: todo.title,
      wrapText: true,
      button: {
        text: "Done",
        onClick: {
          action: {
            function: actionUrl(baseUrl, ADDON_ACTIONS.toggle),
            parameters: [{ key: "todoId", value: todo.id }],
          },
        },
      },
    },
  };
}

/**
 * Contextual card shown with a message open: an "Add to Nylon" card pre-filled
 * from the message subject, with the thread permalink carried through as a
 * hidden parameter so the resulting todo gets the email link attached.
 */
export function buildContextualCard(
  baseUrl: string,
  message: { subject: string; permalink: string | null },
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
          ...(message.permalink
            ? [
                {
                  textParagraph: {
                    text: "The email link will be attached to this todo.",
                  },
                } satisfies Widget,
              ]
            : []),
          {
            buttonList: {
              buttons: [
                {
                  text: "Add to Nylon",
                  onClick: {
                    action: {
                      function: actionUrl(
                        baseUrl,
                        ADDON_ACTIONS.addFromMessage,
                      ),
                      parameters: message.permalink
                        ? [{ key: "permalink", value: message.permalink }]
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
 * account. The button opens the web connect flow, where the user authenticates
 * with Clerk and the link is recorded; they then reload the panel.
 */
export function buildConnectCard(connectUrl: string): Card {
  return {
    header: { title: "Connect Nylon" },
    sections: [
      {
        widgets: [
          {
            textParagraph: {
              text: "Connect your Nylon account to add and manage todos from Gmail.",
            },
          },
          {
            buttonList: {
              buttons: [
                {
                  text: "Connect Nylon",
                  onClick: { openLink: { url: connectUrl } },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
