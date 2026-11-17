import { createFileRoute } from "@tanstack/react-router";

/**
 * One todo by id: its detail over its page on the phone, its column with the
 * todo open in the sheet beside it on wide. A todo that isn't yours, or is
 * gone, goes to `/`. See `_board`.
 */
export const Route = createFileRoute("/_board/todo/$id")({});
