/**
 * Optional integration tests for research execution with real AI.
 *
 * These tests are skipped by default to avoid costs and flakiness in CI.
 * Run with: RUN_AI_TESTS=true pnpm api:test
 *
 * Requirements:
 * - CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set
 * - Valid Cloudflare credentials with AI Gateway access
 *
 * These tests call executeResearch directly (bypassing the queue) since
 * queue consumers are not invoked in the vitest-pool-workers environment.
 */

import { env } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoResearch, todoUrls, todos } from "../../src/lib/db";
import { executeResearch } from "../../src/lib/research";
import { cleanDb, seedUser } from "../helpers";

const RUN_AI_TESTS = process.env.RUN_AI_TESTS === "true";

const DEFAULT_TIMEOUT_MS =
  Number(process.env.AI_TEST_TIMEOUT_MS ?? "") || 30_000;

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

describe.skipIf(!RUN_AI_TESTS)("Research execution with real AI", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  it(
    "completes general research and stores a summary with sources",
    async () => {
      const db = getDb(env.DB);
      const now = new Date();
      const todoId = crypto.randomUUID();
      const researchId = crypto.randomUUID();

      await db.insert(todos).values({
        id: todoId,
        userId: "user_test_123",
        title: "How does OAuth work",
        position: "a0",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(todoResearch).values({
        id: researchId,
        todoId,
        status: "pending",
        researchType: "general",
        createdAt: now,
        updatedAt: now,
      });

      await executeResearch(
        db,
        env.AI,
        env,
        todoId,
        "user_test_123",
        "How does OAuth work",
        "general",
        researchId,
      );

      const [research] = await db
        .select()
        .from(todoResearch)
        .where(eq(todoResearch.id, researchId));

      expect(research.status).toBe("completed");
      expect(research.summary).toBeTruthy();
      expect(research.summary!.length).toBeGreaterThan(20);
      expect(research.researchedAt).toBeTruthy();

      // At least one source URL should be stored
      const urls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.researchId, researchId));
      expect(urls.length).toBeGreaterThan(0);
      expect(urls[0].url).toMatch(/^https?:\/\//);
    },
    DEFAULT_TIMEOUT_MS,
  );

  it(
    "completes location research for a venue query",
    async () => {
      const db = getDb(env.DB);
      const now = new Date();
      const todoId = crypto.randomUUID();
      const researchId = crypto.randomUUID();

      await db.insert(todos).values({
        id: todoId,
        userId: "user_test_123",
        title: "Book dinner at Nobu",
        position: "a0",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(todoResearch).values({
        id: researchId,
        todoId,
        status: "pending",
        researchType: "location",
        createdAt: now,
        updatedAt: now,
      });

      await executeResearch(
        db,
        env.AI,
        env,
        todoId,
        "user_test_123",
        "Book dinner at Nobu",
        "location",
        researchId,
        "Los Angeles, CA",
      );

      const [research] = await db
        .select()
        .from(todoResearch)
        .where(eq(todoResearch.id, researchId));

      expect(research.status).toBe("completed");
      expect(research.summary).toBeTruthy();
      expect(research.summary!.length).toBeGreaterThan(20);
    },
    DEFAULT_TIMEOUT_MS,
  );

  it(
    "marks research as failed when the AI returns an unparseable response",
    async () => {
      const db = getDb(env.DB);
      const now = new Date();
      const todoId = crypto.randomUUID();
      const researchId = crypto.randomUUID();

      await db.insert(todos).values({
        id: todoId,
        userId: "user_test_123",
        title: "",
        position: "a0",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(todoResearch).values({
        id: researchId,
        todoId,
        status: "pending",
        researchType: "general",
        createdAt: now,
        updatedAt: now,
      });

      // Pass a broken AI stub that rejects to force the failure path
      const brokenAi = {
        run: () => Promise.reject(new Error("simulated AI failure")),
      } as unknown as Ai;

      await executeResearch(
        db,
        brokenAi,
        env,
        todoId,
        "user_test_123",
        "",
        "general",
        researchId,
      );

      const [research] = await db
        .select()
        .from(todoResearch)
        .where(eq(todoResearch.id, researchId));

      expect(research.status).toBe("failed");
    },
    DEFAULT_TIMEOUT_MS,
  );
});
