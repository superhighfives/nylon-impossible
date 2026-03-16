import path from "node:path";
import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

// Use AI-enabled config when RUN_AI_TESTS=true
const useAI = process.env.RUN_AI_TESTS === "true";
const wranglerConfig = useAI
  ? "./wrangler.test-ai.jsonc"
  : "./wrangler.test.jsonc";

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    resolve: {
      alias: {
        "@clerk/backend": path.join(
          __dirname,
          "test",
          "__mocks__",
          "clerk-backend.ts",
        ),
      },
    },
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          isolatedStorage: false,
          singleWorker: true,
          wrangler: { configPath: wranglerConfig },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              CLERK_SECRET_KEY: "sk_test_fake",
              CLERK_PUBLISHABLE_KEY: "pk_test_fake",
            },
          },
        },
      },
    },
  };
});
