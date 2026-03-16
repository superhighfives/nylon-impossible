import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoUrls } from "../../src/lib/db";
import { cleanDb, seedUser } from "../helpers";

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

describe("Smart create endpoint", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  describe("fast path (no AI)", () => {
    it("creates single todo from simple text", async () => {
      const res = await smartCreate("Buy milk");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[]; ai: boolean }>();
      expect(body.todos).toHaveLength(1);
      expect(body.todos[0].title).toBe("Buy milk");
      expect(body.ai).toBe(false);
    });

    it("creates todo with trimmed text", async () => {
      const res = await smartCreate("  Buy milk  ");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].title).toBe("Buy milk");
    });

    it("creates todo with title at exactly 500 chars", async () => {
      const title = "a".repeat(500);
      const res = await smartCreate(title);
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].title).toBe(title);
      expect(body.todos[0].title.length).toBe(500);
    });
  });

  describe("fallback behavior (AI unavailable)", () => {
    // Note: In test environment, AI binding is not available.
    // The handler catches AI errors and falls back to single todo creation.

    it("falls back to single todo when text triggers AI path", async () => {
      // Multi-line text triggers shouldUseAI but AI is unavailable
      const res = await smartCreate("Buy milk\nCall mom");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[]; ai: boolean }>();
      // Fallback creates single todo with truncated text
      expect(body.todos).toHaveLength(1);
      expect(body.ai).toBe(false);
    });

    it("truncates long text in fallback", async () => {
      // Text >120 chars triggers AI path, but AI is unavailable
      const longText = "a".repeat(550);
      const res = await smartCreate(longText);
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      // Title should be truncated to 500 chars (497 + "...")
      expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
      expect(body.todos[0].title).toContain("...");
    });
  });

  describe("URL handling", () => {
    it("creates todo from short URL input", async () => {
      const res = await smartCreate("https://example.com");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      // Should create a clean title like "Check example.com"
      expect(body.todos[0].title).toBe("Check example.com");
    });

    it("stores URL in todoUrls table", async () => {
      const res = await smartCreate("https://example.com/path?query=value");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      const todoId = body.todos[0].id;

      // Check that URL was stored
      const db = getDb(env.DB);
      const urls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.todoId, todoId));

      expect(urls).toHaveLength(1);
      expect(urls[0].url).toBe("https://example.com/path?query=value");
      expect(urls[0].fetchStatus).toBe("pending");
    });

    it("handles very long URL (>500 chars) with truncated title", async () => {
      // Create a realistic long URL like a Google search result
      const longUrl = `https://www.google.com/search?q=${"a".repeat(600)}`;
      const res = await smartCreate(longUrl);
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      // Title should be the domain, not the full URL
      expect(body.todos[0].title).toBe("Check google.com");
      expect(body.todos[0].title.length).toBeLessThan(500);
    });

    it("stores full long URL in todoUrls despite truncated title", async () => {
      const longUrl = `https://example.com/very/long/path?${"param=value&".repeat(100)}`;
      const res = await smartCreate(longUrl);
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      const todoId = body.todos[0].id;

      const db = getDb(env.DB);
      const urls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.todoId, todoId));

      expect(urls).toHaveLength(1);
      // Full URL should be stored, not truncated
      expect(urls[0].url.length).toBeGreaterThan(500);
    });

    it("handles URL with www prefix", async () => {
      const res = await smartCreate("https://www.example.com");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      // www should be stripped from title
      expect(body.todos[0].title).toBe("Check example.com");
    });

    it("handles http URL (not just https)", async () => {
      const res = await smartCreate("http://example.com");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].title).toBe("Check example.com");
    });

    it("handles URL with subdomain", async () => {
      const res = await smartCreate("https://api.example.com/v1/users");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].title).toBe("Check api.example.com");
    });

    it("preserves text when URL is only part of input", async () => {
      // When URL is less than 80% of text, treat as regular input
      const res = await smartCreate(
        "Check out this link https://example.com for more info",
      );
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      // This triggers AI path (has URL), AI fails, fallback truncates
      expect(body.todos).toHaveLength(1);
      // Title should contain the original text (truncated if needed)
      expect(body.todos[0].title).toContain("Check out");
    });
  });

  describe("validation", () => {
    it("returns 400 for empty text", async () => {
      const res = await smartCreate("");
      expect(res.status).toBe(400);
    });

    it("returns 400 for whitespace-only text", async () => {
      const res = await smartCreate("   ");
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing text field", async () => {
      const res = await SELF.fetch("http://localhost/todos/smart", {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("accepts text at exactly 10000 chars", async () => {
      // This will trigger AI (>120 chars), AI fails, fallback truncates
      const text = "a".repeat(10000);
      const res = await smartCreate(text);
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      // Title should be truncated
      expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
    });

    it("returns 400 for text over 10000 chars", async () => {
      const text = "a".repeat(10001);
      const res = await smartCreate(text);
      expect(res.status).toBe(400);
    });
  });

  describe("edge cases", () => {
    it("handles unicode text", async () => {
      const res = await smartCreate("Buy 牛乳 and パン");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      // Unicode should be preserved
      expect(body.todos[0].title).toContain("牛乳");
    });

    it("handles emoji in text", async () => {
      const res = await smartCreate("🎉 Celebrate!");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].title).toContain("🎉");
    });

    it("creates todos with unique IDs", async () => {
      const res1 = await smartCreate("First todo");
      const res2 = await smartCreate("Second todo");

      const body1 = await res1.json<{ todos: any[] }>();
      const body2 = await res2.json<{ todos: any[] }>();

      expect(body1.todos[0].id).not.toBe(body2.todos[0].id);
    });

    it("assigns position for ordering", async () => {
      const res = await smartCreate("New todo");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].position).toBeTruthy();
    });

    it("prepends new todos before existing ones", async () => {
      // Create first todo
      await smartCreate("First");

      // Create second todo
      const res = await smartCreate("Second");
      const body = await res.json<{ todos: any[] }>();

      // Get all todos to check positions
      const listRes = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      const todos = await listRes.json<any[]>();

      // Second todo should have a lower position (comes first)
      const firstTodo = todos.find((t) => t.title === "First");
      const secondTodo = todos.find((t) => t.title === "Second");

      expect(secondTodo.position < firstTodo.position).toBe(true);
    });
  });
});
