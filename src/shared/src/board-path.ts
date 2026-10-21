/**
 * The web app's per-list URLs, shared so the Gmail card can deep-link into
 * the same places the app routes:
 *
 *   /today  /this-week  /someday   a time list (phone: that page; wide: its
 *                                  column, focused)
 *   /lists                         the phone's Lists page (wide: the board)
 *   /list/:id                      one list by id (phone: pushed; wide: the
 *                                  fourth column). A time list's id resolves
 *                                  to its own page.
 *   /                              the board, starting at Today
 */

export const BOARD_TIME_KINDS = ["today", "thisWeek", "someday"] as const;

export type BoardTimeKind = (typeof BOARD_TIME_KINDS)[number];

export type BoardView =
  | { kind: BoardTimeKind }
  | { kind: "lists" }
  | { kind: "list"; id: string };

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
  const match = /^\/list\/([^/]+)$/.exec(path);
  if (match?.[1]) {
    try {
      return { kind: "list", id: decodeURIComponent(match[1]) };
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
