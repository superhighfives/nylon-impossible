import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { Log, LogLevel } from "miniflare";
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

  // Always mock URL metadata fetching to prevent real HTTP requests in tests.
  // (The AI side is mocked via test/setup-mocks.ts using vi.mock — aliases
  // here only fire on literal import-string matches, so they couldn't reach
  // ai-enrich.ts's `./ai` import or the handlers' background enrichment.)
  aliases["../lib/url-metadata"] = path.join(
    __dirname,
    "test",
    "__mocks__",
    "url-metadata.ts",
  );

  // AI Gateway + Tavily bindings for real AI tests (injected from environment)
  const aiBindings = useAI
    ? {
        CF_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ?? "",
        TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? "",
      }
    : {};

  return {
    plugins: [
      cloudflareTest({
        isolatedStorage: false,
        singleWorker: true,
        wrangler: { configPath: wranglerConfig },
        miniflare: {
          // Silence the [vpw:debug]/[vpw:info] compatibility-flag chatter that
          // miniflare prints for every isolate. WARN keeps real problems
          // surfaced; everything below is upstream noise.
          log: new Log(LogLevel.WARN),
          bindings: {
            TEST_MIGRATIONS: migrations,
            CLERK_SECRET_KEY: "sk_test_fake",
            CLERK_PUBLISHABLE_KEY: "pk_test_fake",
            ...aiBindings,
          },
        },
      }),
    ],
    resolve: {
      alias: aliases,
    },
    test: {
      setupFiles: ["./test/setup-mocks.ts", "./test/apply-migrations.ts"],
    },
  };
});
