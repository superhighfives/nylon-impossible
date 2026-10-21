import { createFileRoute } from "@tanstack/react-router";

/**
 * One list by id: pushed on the phone, the fourth column on wide. A time
 * list's id opens that time list. See `_board`.
 */
export const Route = createFileRoute("/_board/list/$id")({});
