/**
 * A list you've just created shows straight away under a `temp-` id, and
 * anything aimed at it before its create returns (an add, a move) would send
 * that id to the API, which refuses it (NYLON-IMPOSSIBLE-WEB-D). So the
 * create registers its temp id here, and a todo mutation waits on it for the
 * real id instead.
 *
 * Entries are kept after they settle: a stale reference (a Redo, a "View"
 * toast) can still turn the temp id into the real one.
 */

const TEMP_PREFIX = "temp-";

/** A todo aimed at a list whose create failed; that create has toasted. */
export class ListNotSavedError extends Error {
  constructor() {
    super("The list wasn't saved");
    this.name = "ListNotSavedError";
  }
}

interface Pending {
  promise: Promise<string>;
  resolve: (id: string) => void;
  reject: (err: unknown) => void;
}

const pending = new Map<string, Pending>();
const saved = new Map<string, string>();

export function isTempListId(id: string | undefined): id is string {
  return id?.startsWith(TEMP_PREFIX) ?? false;
}

/** Called by the list's create as it puts the optimistic row in. */
export function listCreateStarted(tempId: string): void {
  let resolve!: (id: string) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Nothing may be waiting; a failed create shouldn't surface on its own.
  promise.catch(() => {});
  pending.set(tempId, { promise, resolve, reject });
}

export function listCreateSaved(tempId: string, id: string): void {
  saved.set(tempId, id);
  pending.get(tempId)?.resolve(id);
}

export function listCreateFailed(tempId: string): void {
  pending.get(tempId)?.reject(new ListNotSavedError());
}

/** The real id once the list is saved, or the id as given. */
export function savedListId(id: string): string {
  return saved.get(id) ?? id;
}

/**
 * The id to send for `id`: itself when it's already real, otherwise the
 * real one once the list's create returns. Rejects with ListNotSavedError
 * if that create fails, so no `temp-` id ever reaches the API.
 */
export async function resolveListId(id: string): Promise<string>;
export async function resolveListId(
  id: string | undefined,
): Promise<string | undefined>;
export async function resolveListId(
  id: string | undefined,
): Promise<string | undefined> {
  if (!isTempListId(id)) return id;
  const known = saved.get(id);
  if (known) return known;
  const entry = pending.get(id);
  // Not one this page created, so there's no create to wait on; fail like
  // any other refused add rather than send it.
  if (!entry) throw new Error(`No pending create for list ${id}`);
  return entry.promise;
}
