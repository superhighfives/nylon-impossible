import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { Log, LogLevel } from "miniflare";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  // Build aliases - always mock Clerk
  const aliases: Record<string, string> = {
    "@clerk/backend": path.join(
      __dirname,
      "test",
      "__mocks__",
      "clerk-backend.ts",
    ),
  };

  // Always mock URL metadata fetching to prevent real HTTP requests in tests.
  const urlMetadataMock = path.join(
    __dirname,
    "test",
    "__mocks__",
    "url-metadata.ts",
  );
  // Both spellings: handlers import "../lib/url-metadata", lib modules
  // (create-todo, process-todo, url-helpers) import "./url-metadata".
  aliases["../lib/url-metadata"] = urlMetadataMock;
  aliases["./url-metadata"] = urlMetadataMock;

  return {
    plugins: [
      cloudflareTest({
        isolatedStorage: false,
        singleWorker: true,
        wrangler: { configPath: "./wrangler.test.jsonc" },
        miniflare: {
          // Silence the [vpw:debug]/[vpw:info] compatibility-flag chatter that
          // miniflare prints for every isolate. WARN keeps real problems
          // surfaced; everything below is upstream noise.
          log: new Log(LogLevel.WARN),
          bindings: {
            TEST_MIGRATIONS: migrations,
            CLERK_SECRET_KEY: "sk_test_fake",
            CLERK_PUBLISHABLE_KEY: "pk_test_fake",
          },
        },
      }),
    ],
    resolve: {
      alias: aliases,
    },
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
