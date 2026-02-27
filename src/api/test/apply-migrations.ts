import { env, applyD1Migrations } from "cloudflare:test";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    USER_SYNC: DurableObjectNamespace;
    TEST_MIGRATIONS: D1Migration[];
    CLERK_SECRET_KEY: string;
    CLERK_PUBLISHABLE_KEY: string;
  }
}

try {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
} catch {
  // Tables already exist (shared D1 across workers with isolatedStorage: false)
}
