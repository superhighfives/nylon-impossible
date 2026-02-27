import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(__dirname, "..", "web", "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    resolve: {
      alias: {
        "@clerk/backend": path.join(
          __dirname,
          "test",
          "__mocks__",
          "clerk-backend.ts"
        ),
      },
    },
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          isolatedStorage: false,
          singleWorker: true,
          wrangler: { configPath: "./wrangler.jsonc" },
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
