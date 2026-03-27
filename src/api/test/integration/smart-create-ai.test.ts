/**
 * Optional integration tests that call real AI Gateway.
 *
 * These tests are skipped by default to avoid costs and flakiness in CI.
 * Run with: RUN_AI_TESTS=true pnpm api:test
 *
 * Requirements:
 * - CF_ACCOUNT_ID, AI_GATEWAY_ID, CLOUDFLARE_API_TOKEN must be set
 * - Valid Cloudflare credentials with AI Gateway access
 *
 * Note: With post-creation AI processing, AI enrichment happens asynchronously
 * after the initial response. These tests verify that:
 * 1. Initial todo is created immediately with aiStatus: "pending"
 * 2. AI enrichment updates the todo in the background
 *
 * To test the enrichment, we poll for status changes.
 */

import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todos, users } from "../../src/lib/db";
import { cleanDb, seedUser } from "../helpers";

const RUN_AI_TESTS = process.env.RUN_AI_TESTS === "true";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };

async function smartCreate(text: string) {
  return SELF.fetch("http://localhost/todos/smart", {
    method: "POST",
    headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

async function enableAI() {
  const db = getDb(env.DB);
  await db
    .update(users)
    .set({ aiEnabled: true })
    .where(eq(users.id, "user_test_123"));
}

const DEFAULT_AI_TIMEOUT_MS =
  Number(process.env.AI_TEST_TIMEOUT_MS ?? "") || 30000;

/** Poll for AI processing to complete */
async function waitForAIComplete(
  todoId: string,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS,
): Promise<void> {
  const db = getDb(env.DB);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const [todo] = await db
      .select({ aiStatus: todos.aiStatus })
      .from(todos)
      .where(eq(todos.id, todoId));

    if (todo?.aiStatus === "complete" || todo?.aiStatus === "failed") {
      return;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`AI processing did not complete within ${timeoutMs}ms`);
}

describe.skipIf(!RUN_AI_TESTS)("Smart create with real AI", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
    await enableAI();
  });

  it("creates todo immediately and enriches in background", async () => {
    const res = await smartCreate("buy milk and call mom tomorrow");
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[]; ai: boolean }>();
    expect(body.ai).toBe(true);
    expect(body.todos).toHaveLength(1);
    // Initial response has the raw text
    expect(body.todos[0].title).toBe("buy milk and call mom tomorrow");
    expect(body.todos[0].aiStatus).toBe("pending");

    // Wait for AI to process
    await waitForAIComplete(body.todos[0].id);

    // Check the enriched todo
    const db = getDb(env.DB);
    const [enriched] = await db
      .select()
      .from(todos)
      .where(eq(todos.id, body.todos[0].id));

    expect(enriched.aiStatus).toBe("complete");
    // AI should have improved the title (exact result depends on model)
    expect(enriched.title.length).toBeLessThanOrEqual(500);
  });

  it("extracts URL and creates clean title", async () => {
    const res = await smartCreate("check https://github.com/user/repo");
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[]; ai: boolean }>();
    expect(body.ai).toBe(true);
    expect(body.todos[0].aiStatus).toBe("pending");

    await waitForAIComplete(body.todos[0].id);

    const db = getDb(env.DB);
    const [enriched] = await db
      .select()
      .from(todos)
      .where(eq(todos.id, body.todos[0].id));

    expect(enriched.aiStatus).toBe("complete");
    // AI should create clean title without raw URL
    expect(enriched.title).not.toContain("https://");
  });

  it("extracts due date from natural language", async () => {
    const res = await smartCreate("call mom tomorrow");
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[]; ai: boolean }>();
    expect(body.ai).toBe(true);

    await waitForAIComplete(body.todos[0].id);

    const db = getDb(env.DB);
    const [enriched] = await db
      .select()
      .from(todos)
      .where(eq(todos.id, body.todos[0].id));

    expect(enriched.aiStatus).toBe("complete");
    // AI may or may not extract the date
    if (enriched.dueDate) {
      // Should be a valid date
      expect(enriched.dueDate instanceof Date).toBe(true);
    }
  });

  it("respects title length limit even with AI", async () => {
    // Very long input that AI might echo back
    const longInput = `This is a very detailed task description that goes on and on: ${"detailed information ".repeat(
      50,
    )}`;
    const res = await smartCreate(longInput);
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[] }>();
    // Initial creation truncates
    expect(body.todos[0].title.length).toBeLessThanOrEqual(500);

    await waitForAIComplete(body.todos[0].id);

    const db = getDb(env.DB);
    const [enriched] = await db
      .select()
      .from(todos)
      .where(eq(todos.id, body.todos[0].id));

    // Enriched title should also be within the limit
    expect(enriched.title.length).toBeLessThanOrEqual(500);
  });
});
