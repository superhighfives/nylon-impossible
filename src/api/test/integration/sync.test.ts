import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todos, todoUrls } from "../../src/lib/db";
import { cleanDb, seedMessage, seedTodo, seedUser } from "../helpers";

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
    expect(extractedUrls).toContain(
      "https://quiche.industries/description-url",
    ); // url extracted from notes
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

  describe("conversation messages and needsInput", () => {
    const TODO_ID = "33333333-3333-3333-3333-333333333333";

    it("returns messages and needsInput on todos that have them", async () => {
      await seedTodo(TODO_ID, "user_test_123", { needsInput: true });
      await seedMessage(TODO_ID, {
        role: "assistant",
        content: "Where to, and when?",
        awaitingReply: true,
      });

      const res = await syncRequest({ changes: [] });
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        todos: Array<{
          id: string;
          needsInput: boolean;
          messages: Array<{
            role: string;
            content: string;
            awaitingReply: boolean;
          }>;
        }>;
      };

      const todo = data.todos.find((t) => t.id === TODO_ID);
      expect(todo).toBeDefined();
      expect(todo?.needsInput).toBe(true);
      expect(todo?.messages).toHaveLength(1);
      expect(todo?.messages[0]).toMatchObject({
        role: "assistant",
        content: "Where to, and when?",
        awaitingReply: true,
      });
    });

    it("returns an empty messages array and needsInput=false by default", async () => {
      await seedTodo(TODO_ID, "user_test_123");

      const res = await syncRequest({ changes: [] });
      const data = (await res.json()) as {
        todos: Array<{ id: string; needsInput: boolean; messages: unknown[] }>;
      };
      const todo = data.todos.find((t) => t.id === TODO_ID);
      expect(todo?.needsInput).toBe(false);
      expect(todo?.messages).toEqual([]);
    });

    it("returns messages in chronological order", async () => {
      await seedTodo(TODO_ID, "user_test_123");
      await seedMessage(TODO_ID, {
        role: "assistant",
        content: "first",
        awaitingReply: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      await seedMessage(TODO_ID, {
        role: "user",
        content: "second",
        awaitingReply: false,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      });
      await seedMessage(TODO_ID, {
        role: "assistant",
        content: "third",
        awaitingReply: true,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
      });

      const res = await syncRequest({ changes: [] });
      const data = (await res.json()) as {
        todos: Array<{ id: string; messages: Array<{ content: string }> }>;
      };
      const todo = data.todos.find((t) => t.id === TODO_ID);
      expect(todo?.messages.map((m) => m.content)).toEqual([
        "first",
        "second",
        "third",
      ]);
    });
  });
});

describe("Sync — subtasks", () => {
  const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const CHILD_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const CHILD_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const future = new Date("2099-01-01T00:00:00Z").toISOString();

  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  it("persists parentId on create and round-trips it in serialization", async () => {
    await seedTodo(PARENT, "user_test_123", { title: "Parent" });
    const res = await syncRequest({
      changes: [
        {
          id: CHILD_A,
          parentId: PARENT,
          title: "Child A",
          position: "a0",
          updatedAt: future,
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    const child = body.todos.find((t: any) => t.id === CHILD_A);
    expect(child.parentId).toBe(PARENT);
  });

  it("creates a parent before its child when both are uploaded in one sync", async () => {
    const res = await syncRequest({
      changes: [
        {
          id: CHILD_A,
          parentId: PARENT,
          title: "Child A",
          updatedAt: future,
        },
        {
          id: PARENT,
          title: "Parent",
          updatedAt: future,
        },
      ],
    });
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const rows = await db.select().from(todos);
    expect(rows.find((row) => row.id === PARENT)).toBeTruthy();
    expect(rows.find((row) => row.id === CHILD_A)?.parentId).toBe(PARENT);
  });

  it("rejects parentId that points at another user's todo", async () => {
    await seedUser("user_other", "other@example.com");
    await seedTodo(PARENT, "user_other", {
      title: "Other parent",
      recurrence: { frequency: "daily" },
      dueDate: new Date(future),
    });

    const res = await syncRequest({
      changes: [
        {
          id: CHILD_A,
          parentId: PARENT,
          title: "Child A",
          updatedAt: future,
        },
      ],
    });
    expect(res.status).toBe(400);

    const body = await res.json<any>();
    expect(body.code).toBe("validation_failed");

    const db = getDb(env.DB);
    const [otherParent] = await db
      .select()
      .from(todos)
      .where(eq(todos.id, PARENT));
    expect(otherParent.recurrence).toEqual({ frequency: "daily" });
    expect(
      (await db.select().from(todos).where(eq(todos.id, CHILD_A))).length,
    ).toBe(0);
  });

  it("rejects parentId that points at another subtask", async () => {
    await seedTodo(PARENT, "user_test_123", { title: "Parent" });
    await seedTodo(CHILD_A, "user_test_123", {
      title: "Child A",
      parentId: PARENT,
    });

    const res = await syncRequest({
      changes: [
        {
          id: CHILD_B,
          parentId: CHILD_A,
          title: "Grandchild",
          updatedAt: future,
        },
      ],
    });
    expect(res.status).toBe(400);

    const body = await res.json<any>();
    expect(body.code).toBe("validation_failed");
    expect(
      body.details.some(
        (detail: { path: unknown[] }) =>
          detail.path.join(".") === "changes.0.parentId",
      ),
    ).toBe(true);
  });

  it("ignores parentId on update (immutable)", async () => {
    await seedTodo(PARENT, "user_test_123", { title: "Parent" });
    await seedTodo(CHILD_A, "user_test_123", {
      title: "Child A",
      parentId: PARENT,
    });
    // Try to reparent CHILD_A to null via an update — should be ignored.
    await syncRequest({
      changes: [
        { id: CHILD_A, parentId: null, title: "Renamed", updatedAt: future },
      ],
    });
    const db = getDb(env.DB);
    const [row] = await db.select().from(todos).where(eq(todos.id, CHILD_A));
    expect(row.parentId).toBe(PARENT);
    expect(row.title).toBe("Renamed");
  });

  it("cascades completion from parent to its subtasks", async () => {
    await seedTodo(PARENT, "user_test_123", { title: "Parent" });
    await seedTodo(CHILD_A, "user_test_123", { parentId: PARENT });
    await seedTodo(CHILD_B, "user_test_123", { parentId: PARENT });

    await syncRequest({
      changes: [{ id: PARENT, completed: true, updatedAt: future }],
    });

    const db = getDb(env.DB);
    const rows = await db.select().from(todos);
    for (const id of [PARENT, CHILD_A, CHILD_B]) {
      expect(rows.find((r) => r.id === id)?.completed).toBe(true);
    }
  });

  it("reopens subtasks when the parent is unchecked", async () => {
    await seedTodo(PARENT, "user_test_123", { title: "Parent", completed: true });
    await seedTodo(CHILD_A, "user_test_123", {
      parentId: PARENT,
      completed: true,
    });

    await syncRequest({
      changes: [{ id: PARENT, completed: false, updatedAt: future }],
    });

    const db = getDb(env.DB);
    const [child] = await db.select().from(todos).where(eq(todos.id, CHILD_A));
    expect(child.completed).toBe(false);
  });

  it("drops a recurrence set on a todo that has subtasks", async () => {
    await seedTodo(PARENT, "user_test_123", { title: "Parent" });
    await seedTodo(CHILD_A, "user_test_123", { parentId: PARENT });

    await syncRequest({
      changes: [
        {
          id: PARENT,
          recurrence: { frequency: "daily" },
          dueDate: future,
          updatedAt: future,
        },
      ],
    });

    const db = getDb(env.DB);
    const [parent] = await db.select().from(todos).where(eq(todos.id, PARENT));
    expect(parent.recurrence).toBeNull();
  });

  it("forces recurrence null on a newly created subtask", async () => {
    await seedTodo(PARENT, "user_test_123", { title: "Parent" });

    await syncRequest({
      changes: [
        {
          id: CHILD_A,
          parentId: PARENT,
          title: "Child A",
          recurrence: { frequency: "weekly" },
          dueDate: future,
          updatedAt: future,
        },
      ],
    });

    const db = getDb(env.DB);
    const [child] = await db.select().from(todos).where(eq(todos.id, CHILD_A));
    expect(child.recurrence).toBeNull();
  });

  it("clears a recurring parent's recurrence when a subtask is added", async () => {
    await seedTodo(PARENT, "user_test_123", {
      title: "Parent",
      recurrence: { frequency: "daily" },
      dueDate: new Date(future),
    });

    await syncRequest({
      changes: [
        {
          id: CHILD_A,
          parentId: PARENT,
          title: "Child A",
          updatedAt: future,
        },
      ],
    });

    const db = getDb(env.DB);
    const [parent] = await db.select().from(todos).where(eq(todos.id, PARENT));
    expect(parent.recurrence).toBeNull();
  });
});
