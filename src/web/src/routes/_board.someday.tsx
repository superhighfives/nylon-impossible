import { createFileRoute } from "@tanstack/react-router";

/** Someday: its phone page, or its column focused on wide. See `_board`. */
export const Route = createFileRoute("/_board/someday")({
  head: () => ({ meta: [{ title: "Someday · Nylon Impossible" }] }),
});
