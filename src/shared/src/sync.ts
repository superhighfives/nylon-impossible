/**
 * Most changes one `POST /todos/sync` accepts. The apps send a longer queue
 * in batches of this many, top-level todos before subtasks.
 */
export const SYNC_CHANGES_MAX = 500;
