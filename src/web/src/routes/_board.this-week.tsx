import { createFileRoute } from "@tanstack/react-router";

/** This Week: its phone page, or its column focused on wide. See `_board`. */
export const Route = createFileRoute("/_board/this-week")({
  head: () => ({ meta: [{ title: "This Week · Nylon Impossible" }] }),
});
