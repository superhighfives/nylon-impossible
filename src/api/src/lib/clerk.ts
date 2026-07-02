import { createClerkClient } from "@clerk/backend";
import type { Env } from "../types";

export function clerkClient(env: Env["Bindings"]) {
  return createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
}
