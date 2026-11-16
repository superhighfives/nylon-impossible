/**
 * The web app's per-list URLs, shared so the Gmail card can deep-link into
 * the same places the app routes:
 *
 *   /today  /this-week  /someday   a time list (phone: that page; wide: its
 *                                  column, focused)
 *   /lists                         the phone's Lists page (wide: the board)
 *   /list/:id                      one list by id (phone: pushed; wide: its
 *                                  column, focused). A time list's id resolves
 *                                  to its own page.
 *   /todo/:id                      one todo by id (phone: its detail over its
 *                                  page; wide: its column, with the todo open
 *                                  in the sheet beside it). The Mac's menu bar
 *                                  hands a todo over this way.
 *   /                              the board, starting at Today
 */

export const BOARD_TIME_KINDS = ["today", "thisWeek", "someday"] as const;

export type BoardTimeKind = (typeof BOARD_TIME_KINDS)[number];

export type BoardView =
  | { kind: BoardTimeKind }
  | { kind: "lists" }
  | { kind: "list"; id: string }
  | { kind: "todo"; id: string };

export const BOARD_TIME_PATHS: Record<BoardTimeKind, string> = {
  today: "/today",
  thisWeek: "/this-week",
  someday: "/someday",
};

/** The path for a view: "/this-week", "/list/abc". */
export function boardPath(view: BoardView): string {
  switch (view.kind) {
    case "lists":
      return "/lists";
    case "list":
      return `/list/${encodeURIComponent(view.id)}`;
    case "todo":
      return `/todo/${encodeURIComponent(view.id)}`;
    default:
      return BOARD_TIME_PATHS[view.kind];
  }
}

/** The view a pathname names, or null for "/" and anything else. */
export function parseBoardPath(pathname: string): BoardView | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const kind of BOARD_TIME_KINDS) {
    if (path === BOARD_TIME_PATHS[kind]) return { kind };
  }
  if (path === "/lists") return { kind: "lists" };
  const match = /^\/(list|todo)\/([^/]+)$/.exec(path);
  if (match?.[1] && match[2]) {
    const kind = match[1] === "todo" ? "todo" : "list";
    try {
      return { kind, id: decodeURIComponent(match[2]) };
    } catch {
      return null;
    }
  }
  return null;
}

/** An absolute link into the web app for a view. */
export function boardUrl(baseUrl: string, view: BoardView): string {
  return `${baseUrl.replace(/\/+$/, "")}${boardPath(view)}`;
}
