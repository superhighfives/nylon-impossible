/**
 * Optional integration tests that call real Workers AI.
 *
 * These tests are skipped by default to avoid costs and flakiness in CI.
 * Run with: RUN_AI_TESTS=true pnpm api:test
 *
 * Requirements:
 * - AI binding must be configured in wrangler.test.jsonc
 * - AI_GATEWAY_ID must be set
 * - Valid Cloudflare credentials
 */

import { SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
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

describe.skipIf(!RUN_AI_TESTS)("Smart create with real AI", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  it("extracts multiple todos from natural language", async () => {
    const res = await smartCreate("buy milk and call mom");
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[]; ai: boolean }>();
    expect(body.ai).toBe(true);
    expect(body.todos.length).toBeGreaterThanOrEqual(2);

    const titles = body.todos.map((t) => t.title.toLowerCase());
    expect(titles.some((t) => t.includes("milk"))).toBe(true);
    expect(titles.some((t) => t.includes("mom") || t.includes("call"))).toBe(
      true,
    );
  });

  it("extracts URL and creates clean title", async () => {
    const res = await smartCreate("check https://github.com/user/repo");
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[]; ai: boolean }>();
    expect(body.ai).toBe(true);
    expect(body.todos).toHaveLength(1);

    // AI should create clean title without raw URL
    expect(body.todos[0].title).not.toContain("https://");
    expect(
      body.todos[0].title.toLowerCase().includes("github") ||
        body.todos[0].title.toLowerCase().includes("repo") ||
        body.todos[0].title.toLowerCase().includes("check"),
    ).toBe(true);
  });

  it("extracts todos from numbered list", async () => {
    const res = await smartCreate(
      "1. Buy groceries\n2. Call dentist\n3. Finish report",
    );
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[]; ai: boolean }>();
    expect(body.ai).toBe(true);
    expect(body.todos.length).toBe(3);
  });

  it("handles mixed actionable and non-actionable content", async () => {
    const res = await smartCreate(
      "The weather is nice today. Also I need to call the dentist about my appointment.",
    );
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[]; ai: boolean }>();
    expect(body.ai).toBe(true);
    // Should extract the actionable item, not the weather comment
    expect(body.todos.length).toBeGreaterThanOrEqual(1);
    const titles = body.todos.map((t) => t.title.toLowerCase());
    expect(
      titles.some((t) => t.includes("dentist") || t.includes("call")),
    ).toBe(true);
  });

  it("converts relative date to ISO format", async () => {
    const res = await smartCreate("call mom tomorrow");
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[]; ai: boolean }>();
    expect(body.ai).toBe(true);
    expect(body.todos.length).toBeGreaterThanOrEqual(1);

    // Check if dueDate was set (AI may or may not parse "tomorrow")
    const todoWithDate = body.todos.find((t) => t.dueDate !== null);
    if (todoWithDate) {
      // Should be a valid ISO date string
      expect(new Date(todoWithDate.dueDate).toString()).not.toBe(
        "Invalid Date",
      );
    }
  });

  it("handles comma-separated items", async () => {
    const res = await smartCreate("buy milk, eggs, and bread");
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[]; ai: boolean }>();
    expect(body.ai).toBe(true);
    // AI might create separate todos or one combined todo
    expect(body.todos.length).toBeGreaterThanOrEqual(1);
  });

  it("respects title length limit even with AI", async () => {
    // Very long input that AI might echo back
    const longInput = `This is a very detailed task description that goes on and on: ${"detailed information ".repeat(
      50,
    )}`;
    const res = await smartCreate(longInput);
    expect(res.status).toBe(200);

    const body = await res.json<{ todos: any[] }>();
    // All titles should be within the 500 char limit
    for (const todo of body.todos) {
      expect(todo.title.length).toBeLessThanOrEqual(500);
    }
  });
});
