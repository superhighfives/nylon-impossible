import { z } from "zod/v4";

/**
 * List ids come in two shapes: dashed UUIDs from `crypto.randomUUID()`
 * (lists created at runtime) and dashless 32-hex from migration 0023's
 * `lower(hex(randomblob(16)))` (every pre-existing user's system lists).
 * A plain `.uuid()` check rejects the latter, which broke every
 * listId-carrying request for migrated accounts.
 *
 * The regex takes either case, and the output is lowercased, because list
 * ids are stored and looked up lowercase (#705).
 */
export const listIdSchema = z
  .string()
  .regex(
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i,
    "Invalid list id",
  )
  .transform((id) => id.toLowerCase());
