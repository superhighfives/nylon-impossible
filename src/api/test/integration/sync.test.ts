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

async function syncRequest(body: object) {
  return SELF.fetch("http://localhost/todos/sync", {
    method: "POST",
    headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Sync endpoint", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  it("returns all todos on first sync (no lastSyncedAt)", async () => {
    // Create a todo first via regular CRUD
    await SELF.fetch("http://localhost/todos", {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Existing todo" }),
    });

    const res = await syncRequest({ changes: [] });
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.todos).toHaveLength(1);
    expect(body.todos[0].title).toBe("Existing todo");
    expect(body.syncedAt).toBeTruthy();
    expect(body.conflicts).toEqual([]);
  });

  it("creates a new todo via sync", async () => {
    const now = new Date().toISOString();
    const res = await syncRequest({
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "Synced todo",
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.todos).toHaveLength(1);
    expect(body.todos[0].title).toBe("Synced todo");
    expect(body.todos[0].id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("updates existing todo when local change is newer", async () => {
    const past = new Date("2025-01-01T00:00:00Z").toISOString();
    const future = new Date("2099-01-01T00:00:00Z").toISOString();

    // Create via sync with past timestamp
    await syncRequest({
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "Original",
          completed: false,
          position: "a0",
          updatedAt: past,
        },
      ],
    });

    // Update via sync with future timestamp
    const res = await syncRequest({
      lastSyncedAt: past,
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "Updated",
          updatedAt: future,
        },
      ],
    });
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.todos[0].title).toBe("Updated");
    expect(body.conflicts).toEqual([]);
  });

  it("reports conflict when local change is older (server wins)", async () => {
    const future = new Date("2099-01-01T00:00:00Z").toISOString();
    const past = new Date("2025-01-01T00:00:00Z").toISOString();

    // Create with future timestamp
    await syncRequest({
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "Server version",
          completed: false,
          position: "a0",
          updatedAt: future,
        },
      ],
    });

    // Try to update with older timestamp
    const res = await syncRequest({
      lastSyncedAt: past,
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "Old client version",
          updatedAt: past,
        },
      ],
    });
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    // Server version should be kept
    expect(body.todos[0].title).toBe("Server version");
    // Conflict should be reported
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0].resolution).toBe("remote");
  });

  it("deletes a todo via sync when newer", async () => {
    const past = new Date("2025-01-01T00:00:00Z").toISOString();
    const future = new Date("2099-01-01T00:00:00Z").toISOString();

    // Create
    await syncRequest({
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "To delete",
          completed: false,
          position: "a0",
          updatedAt: past,
        },
      ],
    });

    // Delete via sync with newer timestamp
    const res = await syncRequest({
      lastSyncedAt: past,
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          deleted: true,
          updatedAt: future,
        },
      ],
    });
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.todos).toHaveLength(0);
  });

  it("normalizes uppercase UUIDs to lowercase", async () => {
    const now = new Date().toISOString();
    const uppercaseId = "550E8400-E29B-41D4-A716-446655440000";

    const res = await syncRequest({
      changes: [
        {
          id: uppercaseId,
          title: "iOS todo",
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.todos[0].id).toBe(uppercaseId.toLowerCase());
  });

  it("auto-creates user via Clerk lookup if not in DB", async () => {
    await cleanDb(); // Remove seeded user

    const now = new Date().toISOString();
    const res = await syncRequest({
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          title: "First sync",
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.todos).toHaveLength(1);
  });

  it("returns 400 for invalid request body", async () => {
    const res = await syncRequest({ invalid: true });
    expect(res.status).toBe(400);
  });

  // --- Long URL title tests (iOS Share Extension bug fix) ---

  it("accepts and truncates a title longer than 500 chars instead of returning 400", async () => {
    // Reproduces the bug: iOS Share Extension sets title to "Check: <full URL>"
    // which can exceed 500 chars for long Google Search URLs.
    const longTitle =
      "Check: https://www.google.com/search?client=safari&q=gore+verbinski+movies" +
      "&hl=en-gb&sxsrf=ANbLn76rl8EWt3s-sRZlDv--tCpL-SRfQ:1773632961047" +
      "&si=AL3DRZHJoCibURVB0Hlwa-VLMfrQPpzwFnTejTFWQtOOMkUhYejHgfrv" +
      "x".repeat(600); // pad well past 500 chars

    const now = new Date().toISOString();
    const res = await syncRequest({
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          title: longTitle,
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });

    // Must not reject with 400 — the server should truncate gracefully
    expect(res.status).toBe(200);

    const body = await res.json<any>();
    expect(body.todos).toHaveLength(1);
    expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
    expect(body.todos[0].title).toMatch(/\.\.\.$/); // truncation marker
  });

  it("stores a truncated title that still starts with the original prefix", async () => {
    const prefix = "Check: https://www.example.com/search?q=";
    const longTitle = prefix + "a".repeat(600);
    const now = new Date().toISOString();

    await syncRequest({
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440002",
          title: longTitle,
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });

    // Fetch back via a fresh sync to confirm what was persisted
    const res = await syncRequest({ changes: [] });
    const body = await res.json<any>();
    const todo = body.todos.find(
      (t: any) => t.id === "550e8400-e29b-41d4-a716-446655440002",
    );
    expect(todo).toBeTruthy();
    expect(todo.title.startsWith(prefix)).toBe(true);
    expect(todo.title.length).toBeLessThanOrEqual(500);
  });

  // --- URL extraction from notes (iOS share sheet) ---

  it("extracts URLs from notes and stores them in todoUrls", async () => {
    const now = new Date().toISOString();
    const todoId = "550e8400-e29b-41d4-a716-446655440010";

    const res = await syncRequest({
      changes: [
        {
          id: todoId,
          title: "Check quiche.industries",
          notes: "URL: https://quiche.industries/browser/",
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const urls = await db
      .select()
      .from(todoUrls)
      .where(eq(todoUrls.todoId, todoId));

    expect(urls).toHaveLength(1);
    expect(urls[0].url).toBe("https://quiche.industries/browser/");
  });

  it("clears the URL from notes after extraction", async () => {
    const now = new Date().toISOString();
    const todoId = "550e8400-e29b-41d4-a716-446655440011";

    await syncRequest({
      changes: [
        {
          id: todoId,
          title: "Check quiche.industries",
          notes: "URL: https://quiche.industries/browser/",
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });

    // The notes should be cleared since it only contained the URL
    const res = await syncRequest({ changes: [] });
    const body = await res.json<any>();
    const todo = body.todos.find((t: any) => t.id === todoId);
    expect(todo).toBeTruthy();
    expect(todo.notes).toBeNull();
  });

  it("does not duplicate URLs already in todoUrls on re-sync", async () => {
    const now = new Date().toISOString();
    const later = new Date(Date.now() + 1000).toISOString();
    const todoId = "550e8400-e29b-41d4-a716-446655440012";

    // First sync — creates the todo and extracts the URL
    await syncRequest({
      changes: [
        {
          id: todoId,
          title: "Check quiche.industries",
          notes: "URL: https://quiche.industries/browser/",
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });

    // Second sync — update with same URL in notes again
    await syncRequest({
      changes: [
        {
          id: todoId,
          title: "Check quiche.industries",
          notes: "URL: https://quiche.industries/browser/",
          completed: false,
          position: "a0",
          updatedAt: later,
        },
      ],
    });

    const db = getDb(env.DB);
    const urls = await db
      .select()
      .from(todoUrls)
      .where(eq(todoUrls.todoId, todoId));

    expect(urls).toHaveLength(1);
  });

  it("stores URLs sent explicitly in the urls field without touching notes", async () => {
    const now = new Date().toISOString();
    const todoId = "550e8400-e29b-41d4-a716-446655440015";

    const res = await syncRequest({
      changes: [
        {
          id: todoId,
          title: "Check quiche.industries",
          notes: "A plain note with no URL",
          completed: false,
          position: "a0",
          updatedAt: now,
          urls: [{ url: "https://quiche.industries/explicit" }],
        },
      ],
    });
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const urls = await db
      .select()
      .from(todoUrls)
      .where(eq(todoUrls.todoId, todoId));

    expect(urls).toHaveLength(1);
    expect(urls[0].url).toBe("https://quiche.industries/explicit");

    // Notes should be untouched — no regex cleaning on the explicit path
    const body = await syncRequest({ changes: [] }).then((r) => r.json<any>());
    const todo = body.todos.find((t: any) => t.id === todoId);
    expect(todo.notes).toBe("A plain note with no URL");
  });

  it("extracts URLs from both title and notes when both contain URLs", async () => {
    const now = new Date().toISOString();
    const todoId = "550e8400-e29b-41d4-a716-446655440013";

    const res = await syncRequest({
      changes: [
        {
          id: todoId,
          title: "Check https://quiche.industries/title-url",
          notes: "URL: https://quiche.industries/description-url",
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const urls = await db
      .select()
      .from(todoUrls)
      .where(eq(todoUrls.todoId, todoId));

    const extractedUrls = urls.map((u) => u.url).sort();
    expect(extractedUrls).toHaveLength(2);
    expect(extractedUrls).toContain("https://quiche.industries/title-url");
    expect(extractedUrls).toContain("https://quiche.industries/description-url"); // url extracted from notes
  });

  it("extracts URLs from title when only the title contains a URL", async () => {
    const now = new Date().toISOString();
    const todoId = "550e8400-e29b-41d4-a716-446655440014";

    const res = await syncRequest({
      changes: [
        {
          id: todoId,
          title: "Check https://quiche.industries/title-only",
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const urls = await db
      .select()
      .from(todoUrls)
      .where(eq(todoUrls.todoId, todoId));

    expect(urls).toHaveLength(1);
    expect(urls[0].url).toBe("https://quiche.industries/title-only");
  });

  it("updates an existing todo with a long title and truncates it", async () => {
    const past = new Date("2025-01-01T00:00:00Z").toISOString();
    const future = new Date("2099-01-01T00:00:00Z").toISOString();

    // Create with a normal title first
    await syncRequest({
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440003",
          title: "Original short title",
          completed: false,
          position: "a0",
          updatedAt: past,
        },
      ],
    });

    // Update with a title that exceeds 500 chars
    const longTitle = "Updated: " + "x".repeat(600);
    const res = await syncRequest({
      lastSyncedAt: past,
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440003",
          title: longTitle,
          updatedAt: future,
        },
      ],
    });

    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.todos[0].title.length).toBeLessThanOrEqual(500);
    expect(body.todos[0].title.startsWith("Updated: ")).toBe(true);
  });

  it("still rejects a title that is an empty string", async () => {
    const now = new Date().toISOString();
    const res = await syncRequest({
      changes: [
        {
          id: "550e8400-e29b-41d4-a716-446655440004",
          title: "",
          completed: false,
          position: "a0",
          updatedAt: now,
        },
      ],
    });
    // min(1) validation should still catch empty titles
    expect(res.status).toBe(400);
  });
});
