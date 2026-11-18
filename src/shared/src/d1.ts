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
 *
 * For a multi-row insert, pass the parameters each row binds (its column
 * count is a safe ceiling) and each batch fits in one `values(...)`.
 */
export function chunkForD1<T>(ids: readonly T[], paramsPerItem = 1): T[][] {
  const size = Math.max(1, Math.floor(D1_MAX_BOUND_PARAMS / paramsPerItem));
  const batches: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size));
  }
  return batches;
}
