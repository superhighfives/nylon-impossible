import { z } from "zod/v4";

/**
 * Pin used to be called Sticky. The API is mid expand/contract on that rename:
 *
 * - Requests accept `pinned` and the legacy `sticky`. When both are sent,
 *   `pinned` wins.
 * - Responses carry both keys with the same value.
 *
 * TODO(contract): drop `sticky` from request schemas and responses once an iOS
 * build that sends and reads `pinned` is the only one in use (the TestFlight
 * build from before the rename still speaks `sticky` only). The DB column stays
 * `sticky` either way — see `todos.pinned` in the shared schema.
 */
export const pinnedRequestFields = {
  pinned: z.boolean().optional(),
  /** @deprecated legacy spelling of `pinned`; see the contract TODO above. */
  sticky: z.boolean().optional(),
};

/** The effective pinned value from a request carrying either spelling. */
export function resolvePinned(input: {
  pinned?: boolean;
  sticky?: boolean;
}): boolean | undefined {
  return input.pinned ?? input.sticky;
}

/** Fold a parsed request's `sticky` into `pinned` and drop the legacy key. */
export function normalizePinned<
  T extends { pinned?: boolean; sticky?: boolean },
>(input: T): Omit<T, "sticky"> {
  const { sticky: _legacy, ...rest } = input;
  const pinned = resolvePinned(input);
  return pinned === undefined ? rest : { ...rest, pinned };
}

/** Both spellings for a response body. */
export function pinnedResponseFields(pinned: boolean) {
  return { pinned, sticky: pinned };
}
