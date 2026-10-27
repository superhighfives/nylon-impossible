import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { dayKeyIn, dueDayKey } from "@nylon-impossible/shared";
import { getDb, lists, todoUrls, users } from "../../src/lib/db";
import { cleanDb, getTodayListId, seedUser } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };

async function smartCreate(text: string, listId?: string) {
  return SELF.fetch("http://localhost/todos/smart", {
    method: "POST",
    headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(listId ? { text, listId } : { text }),
  });
}

async function getSomedayListId(userId = "user_test_123") {
  const db = getDb(env.DB);
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.userId, userId),
        eq(lists.kind, "system"),
        eq(lists.systemKind, "someday"),
      ),
    );
  if (!list) throw new Error(`No Someday list seeded for user ${userId}`);
  return list.id;
}

describe("Smart create endpoint", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  describe("immediate creation", () => {
    it("creates single todo from simple text", async () => {
      const res = await smartCreate("Buy milk");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      expect(body.todos[0].title).toBe("Buy milk");
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

    it("truncates long text to fit title limit", async () => {
      const longText = "a".repeat(550);
      const res = await smartCreate(longText);
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      // Title must be truncated to 500 chars max
      expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
      // ...and the full text survives in notes rather than being dropped.
      expect(body.todos[0].notes).toBe(longText);
    });

    it("keeps long prose in notes with a short title", async () => {
      const prose = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
      const res = await smartCreate(prose);
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].title.length).toBeLessThanOrEqual(120);
      expect(body.todos[0].title.endsWith("…")).toBe(true);
      expect(body.todos[0].notes).toBe(prose);
    });

    it("uses the first line as title and the rest as notes", async () => {
      const res = await smartCreate(
        "Call the bank\nAsk about the fee\nRef 1234",
      );
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].title).toBe("Call the bank");
      expect(body.todos[0].notes).toBe("Ask about the fee\nRef 1234");
    });
  });

  describe("URL handling", () => {
    it("creates todo from short URL input", async () => {
      const res = await smartCreate("https://example.com");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      // Title should be clean domain name from fallback
      expect(body.todos[0].title).toBe("Check example.com");
    });

    it("stores URL in todoUrls table", async () => {
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
    });

    it("handles very long URL (>500 chars) with truncated title", async () => {
      // Create a realistic long URL like a Google search result
      const longUrl = `https://www.google.com/search?q=${"a".repeat(600)}`;
      const res = await smartCreate(longUrl);
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      // Title must be under 500 chars
      expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
      // Title should be the domain-based fallback (www. is stripped)
      expect(body.todos[0].title).toBe("Check google.com");
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
      // Title should be clean domain
      expect(body.todos[0].title).toBe("Check example.com");
    });

    it("handles http URL (not just https)", async () => {
      const res = await smartCreate("http://example.com");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      // Title should be clean domain
      expect(body.todos[0].title).toBe("Check example.com");
    });

    it("handles URL with subdomain", async () => {
      const res = await smartCreate("https://api.example.com/v1/users");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      // Title should be clean and under limit
      expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
      expect(body.todos[0].title).toBe("Check api.example.com");
    });

    it("keeps typed words next to a URL that makes up most of the input", async () => {
      const url = "https://x.com/solomonmithra99/status/1980000000000000000";
      const res = await smartCreate(`let's build this ${url}`);
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].title).toBe(`let's build this ${url}`);
    });

    it("preserves text when URL is only part of input", async () => {
      // Words around the URL mean it isn't a bare link, so keep the full text
      const res = await smartCreate(
        "Check out this link https://example.com for more info",
      );
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      // Title should be the full original text (or truncated if too long)
      expect(body.todos[0].title).toBe(
        "Check out this link https://example.com for more info",
      );

      // URL should still be extracted
      const db = getDb(env.DB);
      const urls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.todoId, body.todos[0].id));
      expect(urls).toHaveLength(1);
      expect(urls[0].url).toBe("https://example.com/");
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

  describe("listId", () => {
    it("defaults to the Today list when omitted", async () => {
      const res = await smartCreate("Buy milk");
      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].listId).toBe(await getTodayListId());
    });

    it("places the todo in the given list", async () => {
      const somedayId = await getSomedayListId();
      const res = await smartCreate("Someday maybe", somedayId);
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos[0].listId).toBe(somedayId);
    });

    it("returns 404 for a listId that doesn't exist", async () => {
      const res = await smartCreate("Buy milk", crypto.randomUUID());
      expect(res.status).toBe(404);
    });

    it("returns 404 for another user's list", async () => {
      await seedUser("user_other_456", "other@example.com");
      const otherSomedayId = await getSomedayListId("user_other_456");
      const res = await smartCreate("Buy milk", otherSomedayId);
      expect(res.status).toBe(404);
    });
  });

  describe("edge cases", () => {
    it("handles unicode text", async () => {
      const res = await smartCreate("Buy 牛乳 and パン");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      expect(body.todos[0].title).toBe("Buy 牛乳 and パン");
    });

    it("handles emoji in text", async () => {
      const res = await smartCreate("🎉 Celebrate!");
      expect(res.status).toBe(200);

      const body = await res.json<{ todos: any[] }>();
      expect(body.todos).toHaveLength(1);
      expect(body.todos[0].title).toBe("🎉 Celebrate!");
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
      await smartCreate("Second");

      // Get all todos to check positions
      const listRes = await SELF.fetch("http://localhost/todos", {
        headers: AUTH_HEADER,
      });
      const todosResult = await listRes.json<any[]>();

      // Second todo should have a lower position (comes first)
      const firstTodo = todosResult.find((t) => t.title === "First");
      const secondTodo = todosResult.find((t) => t.title === "Second");

      expect(secondTodo.position < firstTodo.position).toBe(true);
    });
  });

  describe("typed dates", () => {
    function tomorrowIn(timeZone: string) {
      const today = dayKeyIn(new Date(), timeZone);
      const next = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000);
      return next.toISOString().slice(0, 10);
    }

    async function create(body: object) {
      const res = await SELF.fetch("http://localhost/todos/smart", {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(200);
      const json = await res.json<{
        todos: { title: string; dueDate: string | null }[];
      }>();
      return json.todos[0];
    }

    it("strips the date and sets the due day", async () => {
      const todo = await create({ text: "Pay rent tomorrow" });
      expect(todo.title).toBe("Pay rent");
      expect(todo.dueDate && dueDayKey(todo.dueDate)).toBe(tomorrowIn("UTC"));
    });

    it("uses the account's timezone for 'tomorrow'", async () => {
      const zone = "Pacific/Kiritimati";
      await getDb(env.DB)
        .update(users)
        .set({ timezone: zone })
        .where(eq(users.id, "user_test_123"));
      const todo = await create({ text: "Pay rent tomorrow" });
      expect(todo.dueDate && dueDayKey(todo.dueDate)).toBe(tomorrowIn(zone));
    });

    it("leaves a weekday mid-sentence alone", async () => {
      const todo = await create({ text: "Call Mum about Sunday lunch" });
      expect(todo.title).toBe("Call Mum about Sunday lunch");
      expect(todo.dueDate).toBeNull();
    });

    it("never empties the title", async () => {
      const todo = await create({ text: "tomorrow" });
      expect(todo.title).toBe("tomorrow");
      expect(todo.dueDate).toBeNull();
    });

    it("skips parsing when the client already did (parseDate: false)", async () => {
      const todo = await create({
        text: "Pay rent tomorrow",
        parseDate: false,
      });
      expect(todo.title).toBe("Pay rent tomorrow");
      expect(todo.dueDate).toBeNull();
    });

    it("takes an explicit dueDate as-is", async () => {
      const todo = await create({
        text: "Pay rent",
        parseDate: false,
        dueDate: "2026-11-02T00:00:00.000Z",
      });
      expect(todo.title).toBe("Pay rent");
      expect(todo.dueDate).toBe("2026-11-02T00:00:00.000Z");
    });

    it("parses only the title line of multi-line text", async () => {
      const todo = await create({ text: "Pay rent tomorrow\nfrom savings" });
      expect(todo.title).toBe("Pay rent");
      expect(todo.dueDate && dueDayKey(todo.dueDate)).toBe(tomorrowIn("UTC"));
    });
  });
});
