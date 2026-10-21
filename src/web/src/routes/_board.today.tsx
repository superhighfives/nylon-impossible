import { createFileRoute } from "@tanstack/react-router";

/** Today: the phone's first page, Today's column on wide. See `_board`. */
export const Route = createFileRoute("/_board/today")({
  head: () => ({ meta: [{ title: "Today · Nylon Impossible" }] }),
});
