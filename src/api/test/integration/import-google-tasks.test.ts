import { env, SELF } from "cloudflare:test";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, todos } from "../../src/lib/db";
import { cleanDb, seedTodo, seedUser } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts.
const mockVerifyToken = verifyToken as ReturnType<typeof vi.fn>;
const mockCreateClerkClient = createClerkClient as unknown as ReturnType<
  typeof vi.fn
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };

interface ImportResponse {
  imported: number;
  skipped: number;
  importedIds: string[];
  datedTodos: { id: string; title: string; dueDate: string }[];
}

/** Point the Clerk OAuth token exchange at a fixed token (or none / an error). */
function mockGoogleToken(token: string | null | "error") {
  mockCreateClerkClient.mockReturnValue({
    users: {
      getUserOauthAccessToken:
        token === "error"
          ? vi.fn().mockRejectedValue(new Error("clerk unavailable"))
          : vi.fn().mockResolvedValue({ data: token ? [{ token }] : [] }),
    },
  });
}

/** Stub global fetch so the Google Tasks call returns `items` (or an error). */
function mockGoogleTasksApi(
  items: unknown[],
  opts: { ok?: boolean; status?: number } = {},
) {
  const { ok = true, status = 200 } = opts;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("tasks.googleapis.com")) {
      return new Response(ok ? JSON.stringify({ items }) : "upstream boom", {
        status,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function importRequest() {
  return SELF.fetch("http://localhost/todos/import/google-tasks", {
    method: "POST",
    headers: AUTH_HEADER,
  });
}

describe("Google Tasks import", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    mockCreateClerkClient.mockReset();
    // Free plan keeps the import on the fast (non-AI) path for deterministic tests.
    await seedUser("user_test_123", "test@example.com", { plan: "free" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 when the Google account isn't connected", async () => {
    mockGoogleToken(null);
    const res = await importRequest();
    expect(res.status).toBe(400);
  });

  it("returns 502 when the Clerk token exchange fails", async () => {
    mockGoogleToken("error");
    const res = await importRequest();
    expect(res.status).toBe(502);
  });

  it("returns 502 when the Google Tasks API errors", async () => {
    mockGoogleToken("google-token");
    mockGoogleTasksApi([], { ok: false, status: 500 });
    const res = await importRequest();
    expect(res.status).toBe(502);
  });

  it("excludes completed tasks by requesting showCompleted=false", async () => {
    mockGoogleToken("google-token");
    const fetchMock = mockGoogleTasksApi([]);
    await importRequest();

    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("showCompleted=false");
  });

  it("imports open tasks and returns a consistent shape", async () => {
    mockGoogleToken("google-token");
    mockGoogleTasksApi([
      { id: "gtask-1", title: "Pay rent", due: "2026-08-01T00:00:00.000Z" },
      { id: "gtask-2", title: "Buy milk" },
    ]);

    const res = await importRequest();
    expect(res.status).toBe(200);
    const body = await res.json<ImportResponse>();

    expect(body.imported).toBe(2);
    expect(body.skipped).toBe(0);
    expect(body.importedIds).toHaveLength(2);
    // Only the task with a due date is offered for repeat-schedule review.
    expect(body.datedTodos).toHaveLength(1);
    expect(body.datedTodos[0].title).toBe("Pay rent");

    const db = getDb(env.DB);
    const stored = await db
      .select()
      .from(todos)
      .where(eq(todos.userId, "user_test_123"));
    expect(stored).toHaveLength(2);
    expect(stored.every((t) => !t.completed)).toBe(true);
  });

  it("returns empty arrays when there are no tasks to import", async () => {
    mockGoogleToken("google-token");
    mockGoogleTasksApi([]);

    const res = await importRequest();
    expect(res.status).toBe(200);
    const body = await res.json<ImportResponse>();

    expect(body).toEqual({
      imported: 0,
      skipped: 0,
      importedIds: [],
      datedTodos: [],
    });
  });

  it("skips already-imported tasks and still returns empty arrays", async () => {
    await seedTodo("existing-todo", "user_test_123", {
      googleTaskId: "gtask-1",
    });
    mockGoogleToken("google-token");
    mockGoogleTasksApi([{ id: "gtask-1", title: "Pay rent" }]);

    const res = await importRequest();
    expect(res.status).toBe(200);
    const body = await res.json<ImportResponse>();

    expect(body.imported).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.importedIds).toEqual([]);
    expect(body.datedTodos).toEqual([]);
  });
});
