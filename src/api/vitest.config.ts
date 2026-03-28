import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Use AI-enabled config when RUN_AI_TESTS=true
const useAI = process.env.RUN_AI_TESTS === "true";
const wranglerConfig = useAI
  ? "./wrangler.test-ai.jsonc"
  : "./wrangler.test.jsonc";

export default defineConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  // Build aliases - always mock Clerk, optionally mock AI
  const aliases: Record<string, string> = {
    "@clerk/backend": path.join(
      __dirname,
      "test",
      "__mocks__",
      "clerk-backend.ts",
    ),
  };

  // Mock AI and URL metadata modules when not running real AI tests
  if (!useAI) {
    aliases["../lib/ai"] = path.join(__dirname, "test", "__mocks__", "ai.ts");
    aliases["../lib/url-metadata"] = path.join(
      __dirname,
      "test",
      "__mocks__",
      "url-metadata.ts",
    );
  }

  // Always mock URL metadata fetching to prevent real HTTP requests in tests
  aliases["../lib/url-metadata"] = path.join(
    __dirname,
    "test",
    "__mocks__",
    "url-metadata.ts",
  );

  // AI Gateway bindings for real AI tests (injected from environment)
  const aiBindings = useAI
    ? {
        CF_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ?? "",
      }
    : {};

  return {
    plugins: [
      cloudflareTest({
        isolatedStorage: false,
        singleWorker: true,
        wrangler: { configPath: wranglerConfig },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            CLERK_SECRET_KEY: "sk_test_fake",
            CLERK_PUBLISHABLE_KEY: "pk_test_fake",
            RESEARCH_QUEUE: { send: async () => {} },
            ...aiBindings,
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
