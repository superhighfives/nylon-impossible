import { createFileRoute } from "@tanstack/react-router";

/** The phone's Lists page; wide shows the board. See `_board`. */
export const Route = createFileRoute("/_board/lists")({
  head: () => ({ meta: [{ title: "Lists · Nylon Impossible" }] }),
});
