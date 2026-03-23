import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoUrls } from "../../src/lib/db";
import {
  mockExtractTodos,
  mockExtractTodosEmpty,
  mockExtractTodosError,
  resetAIMock,
} from "../__mocks__/ai";
import { cleanDb, seedUser } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };

// AI calls can take several seconds - use longer timeout for tests that may trigger AI
const AI_TIMEOUT = 15000;

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
    resetAIMock();
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

  describe("AI path (multi-item input)", () => {
    // These tests work whether AI is available or falls back

    it(
      "handles multi-line text",
      async () => {
        // Multi-line text triggers shouldUseAI
        const res = await smartCreate("Buy milk\nCall mom");
        expect(res.status).toBe(200);

        const body = await res.json<{ todos: any[]; ai: boolean }>();
        // AI may split into multiple todos, fallback creates one
        expect(body.todos.length).toBeGreaterThanOrEqual(1);
        // All titles should be under the limit
        for (const todo of body.todos) {
          expect(todo.title.length).toBeLessThanOrEqual(500);
        }
      },
      AI_TIMEOUT,
    );

    it(
      "truncates long text to fit title limit",
      async () => {
        // Text >120 chars triggers AI path
        const longText = "a".repeat(550);
        const res = await smartCreate(longText);
        expect(res.status).toBe(200);

        const body = await res.json<{ todos: any[] }>();
        expect(body.todos.length).toBeGreaterThanOrEqual(1);
        // Title must be truncated to 500 chars max
        expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
      },
      AI_TIMEOUT,
    );
  });

  describe("AI success path (mocked)", () => {
    it("creates multiple todos from AI extraction", async () => {
      mockExtractTodos([
        { title: "Buy milk" },
        { title: "Call mom" },
        { title: "Pick up dry cleaning" },
      ]);

      // Multi-line text triggers AI path
      const res = await smartCreate("Buy milk, call mom, pick up dry cleaning");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[]; ai: boolean }>();
      expect(body.ai).toBe(true);
      expect(body.todos).toHaveLength(3);
      expect(body.todos[0].title).toBe("Buy milk");
      expect(body.todos[1].title).toBe("Call mom");
      expect(body.todos[2].title).toBe("Pick up dry cleaning");
    });

    it("creates todo with AI-extracted URL", async () => {
      mockExtractTodos([
        {
          title: "Review pull request",
          urls: ["https://github.com/user/repo/pull/123"],
        },
      ]);

      const res = await smartCreate(
        "Review https://github.com/user/repo/pull/123",
      );
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[]; ai: boolean }>();
      expect(body.ai).toBe(true);
      expect(body.todos).toHaveLength(1);
      expect(body.todos[0].title).toBe("Review pull request");

      // Check URL was stored
      const db = getDb(env.DB);
      const urls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.todoId, body.todos[0].id));
      expect(urls).toHaveLength(1);
      expect(urls[0].url).toBe("https://github.com/user/repo/pull/123");
    });

    it("creates todo with AI-extracted due date", async () => {
      mockExtractTodos([{ title: "Finish report", dueDate: "2026-03-20" }]);

      // Multi-line input triggers AI path
      const res = await smartCreate(
        "Finish the report by Friday\nThis is urgent",
      );
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[]; ai: boolean }>();
      expect(body.ai).toBe(true);
      expect(body.todos).toHaveLength(1);
      expect(body.todos[0].title).toBe("Finish report");
      expect(body.todos[0].dueDate).toBe("2026-03-20T00:00:00.000Z");
    });

    it("truncates long AI-generated title to 500 chars", async () => {
      const longTitle = "a".repeat(600);
      mockExtractTodos([{ title: longTitle }]);

      // Multi-line input triggers AI path
      const res = await smartCreate("Task one\nTask two");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
      expect(body.todos[0].title.endsWith("...")).toBe(true);
    });

    it("falls back to single todo when AI returns empty", async () => {
      mockExtractTodosEmpty();

      const res = await smartCreate("Buy milk\nCall mom");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[]; ai: boolean }>();
      expect(body.ai).toBe(false);
      expect(body.todos).toHaveLength(1);
    });

    it("falls back to single todo when AI throws error", async () => {
      mockExtractTodosError(new Error("AI service unavailable"));

      const res = await smartCreate("Buy milk\nCall mom");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[]; ai: boolean }>();
      expect(body.ai).toBe(false);
      expect(body.todos).toHaveLength(1);
    });

    it("extracts URLs from title when AI misses them", async () => {
      // AI returns title with URL but doesn't extract it to urls array
      mockExtractTodos([{ title: "Check https://example.com for updates" }]);

      const res = await smartCreate("Check https://example.com for updates");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      const todoId = body.todos[0].id;

      // URL should still be extracted and stored
      const db = getDb(env.DB);
      const urls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.todoId, todoId));
      expect(urls).toHaveLength(1);
      expect(urls[0].url).toBe("https://example.com/");
    });

    it("deduplicates URLs between AI extraction and title parsing", async () => {
      // AI extracts URL, and it's also in the title
      mockExtractTodos([
        {
          title: "Check https://example.com",
          urls: ["https://example.com"],
        },
      ]);

      const res = await smartCreate("Check https://example.com");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      const todoId = body.todos[0].id;

      // Should only have one URL record, not duplicated
      const db = getDb(env.DB);
      const urls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.todoId, todoId));
      expect(urls).toHaveLength(1);
    });

    it("handles multiple URLs from AI", async () => {
      mockExtractTodos([
        {
          title: "Review both PRs",
          urls: [
            "https://github.com/user/repo/pull/1",
            "https://github.com/user/repo/pull/2",
          ],
        },
      ]);

      const res = await smartCreate("Review PR #1 and PR #2");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      const todoId = body.todos[0].id;

      const db = getDb(env.DB);
      const urls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.todoId, todoId));
      expect(urls).toHaveLength(2);
    });
  });

  describe("URL handling", () => {
    it(
      "creates todo from short URL input",
      async () => {
        const res = await smartCreate("https://example.com");
        expect(res.status).toBe(200);

        const body = await res.json<{ todos: any[] }>();
        expect(body.todos).toHaveLength(1);
        // Title should be clean (not the raw URL) - AI or fallback may vary
        expect(body.todos[0].title.length).toBeLessThan(100);
        expect(body.todos[0].title).not.toContain("https://");
      },
      AI_TIMEOUT,
    );

    it(
      "stores URL in todoUrls table",
      async () => {
        const res = await smartCreate("https://test.invalid/path?query=value");
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
        expect(urls[0].url).toBe("https://test.invalid/path?query=value");
      },
      AI_TIMEOUT,
    );

    it(
      "handles very long URL (>500 chars) with truncated title",
      async () => {
        // Create a realistic long URL like a Google search result
        const longUrl = `https://www.google.com/search?q=${"a".repeat(600)}`;
        const res = await smartCreate(longUrl);
        expect(res.status).toBe(200);

        const body = await res.json<{ todos: any[] }>();
        expect(body.todos).toHaveLength(1);
        // Title must be under 500 chars (the key fix this PR addresses)
        expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
        // Title should not contain the raw long URL
        expect(body.todos[0].title).not.toContain("a".repeat(50));
      },
      AI_TIMEOUT,
    );

    it(
      "stores full long URL in todoUrls despite truncated title",
      async () => {
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
      },
      AI_TIMEOUT,
    );

    it(
      "handles URL with www prefix",
      async () => {
        const res = await smartCreate("https://www.example.com");
        expect(res.status).toBe(200);

        const body = await res.json<{ todos: any[] }>();
        // Title should be clean, not contain raw URL
        expect(body.todos[0].title.length).toBeLessThan(100);
        expect(body.todos[0].title).not.toContain("https://");
      },
      AI_TIMEOUT,
    );

    it(
      "handles http URL (not just https)",
      async () => {
        const res = await smartCreate("http://example.com");
        expect(res.status).toBe(200);

        const body = await res.json<{ todos: any[] }>();
        // Title should be clean, not contain raw URL
        expect(body.todos[0].title.length).toBeLessThan(100);
        expect(body.todos[0].title).not.toContain("http://");
      },
      AI_TIMEOUT,
    );

    it(
      "handles URL with subdomain",
      async () => {
        const res = await smartCreate("https://api.example.com/v1/users");
        expect(res.status).toBe(200);

        const body = await res.json<{ todos: any[] }>();
        // Title should be clean and under limit
        expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
        expect(body.todos[0].title).not.toContain("https://");
      },
      AI_TIMEOUT,
    );

    it(
      "preserves text when URL is only part of input",
      async () => {
        // When URL is less than 80% of text, treat as regular input
        const res = await smartCreate(
          "Check out this link https://example.com for more info",
        );
        expect(res.status).toBe(200);

        const body = await res.json<{ todos: any[] }>();
        // Should create at least one todo
        expect(body.todos.length).toBeGreaterThanOrEqual(1);
        // Title should be under limit
        expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
      },
      AI_TIMEOUT,
    );
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

    it(
      "accepts text at exactly 10000 chars",
      async () => {
        // This will trigger AI (>120 chars)
        const text = "a".repeat(10000);
        const res = await smartCreate(text);
        expect(res.status).toBe(200);

        const body = await res.json<{ todos: any[] }>();
        expect(body.todos.length).toBeGreaterThanOrEqual(1);
        // Title should be truncated
        expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
      },
      AI_TIMEOUT,
    );

    it("returns 400 for text over 10000 chars", async () => {
      const text = "a".repeat(10001);
      const res = await smartCreate(text);
      expect(res.status).toBe(400);
    });
  });

  describe("edge cases", () => {
    it(
      "handles unicode text",
      async () => {
        const res = await smartCreate("Buy 牛乳 and パン");
        expect(res.status).toBe(200);

        const body = await res.json<{ todos: any[] }>();
        // AI may split into multiple, fallback creates one
        expect(body.todos.length).toBeGreaterThanOrEqual(1);
      },
      AI_TIMEOUT,
    );

    it("handles emoji in text", async () => {
      const res = await smartCreate("🎉 Celebrate!");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos.length).toBeGreaterThanOrEqual(1);
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
