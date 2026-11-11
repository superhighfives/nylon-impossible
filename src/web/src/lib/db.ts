import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Database client type
 */
export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Creates a new Drizzle Client instance for D1
 * Must be called per-request in Cloudflare Workers
 * @param db - D1 database binding from env.DB
 */
export function getDbClient(db: D1Database): DbClient {
  if (!db) {
    throw new Error("D1 database binding not found");
  }
  return drizzle(db, { schema });
}
