/**
 * Cloudflare D1 caps a single SQL statement at 100 bound parameters. An
 * `inArray(col, ids)` binds one parameter per id, so any query keyed on a
 * user's full id list overflows the moment they cross 100 rows and D1 rejects
 * the statement. Keeping this cap in one place means the batching only has to
 * be right once, rather than hand-rolled at every call site.
 */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * Split `ids` into batches no larger than D1's bound-parameter cap, so each
 * batch fits in a single `inArray(...)` statement. A given id appears in
 * exactly one batch and order is preserved, so callers that group results by
 * id keep their per-id ordering.
 */
export function chunkForD1<T>(ids: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < ids.length; i += D1_MAX_BOUND_PARAMS) {
    batches.push(ids.slice(i, i + D1_MAX_BOUND_PARAMS));
  }
  return batches;
}
