import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoResearch, todos, todoUrls, users } from "../../src/lib/db";
import {
  applyLinkTitle,
  finishTodoLinks,
  queueTodoLinks,
} from "../../src/lib/process-todo";
import {
  mockFailedUrlFetch,
  mockFetchUrlMetadata,
  resetUrlMetadataMock,
} from "../__mocks__/url-metadata";
import { cleanDb, seedTodo, seedTodoUrl, seedUser } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const AUTH_HEADER = { Authorization: "Bearer test-token" };
const TWEET_URL = "https://x.com/markphelps/status/2089111740395270615";

async function callProcess(todoId: string) {
  return SELF.fetch(`http://localhost/todos/${todoId}/process`, {
    method: "POST",
    headers: AUTH_HEADER,
  });
}

async function getTodo(todoId: string) {
  const db = getDb(env.DB);
  const [todo] = await db.select().from(todos).where(eq(todos.id, todoId));
  return todo;
}

async function getUrls(todoId: string) {
  const db = getDb(env.DB);
  return db
    .select()
    .from(todoUrls)
    .where(eq(todoUrls.todoId, todoId))
    .orderBy(todoUrls.position);
}

/**
 * Run the whole non-AI pass the way the handler does, but awaited — the handler
 * itself hands the fetch to `waitUntil`, which outlives the response.
 */
async function runProcess(todoId: string, options?: { refetch?: boolean }) {
  const db = getDb(env.DB);
  const todo = await getTodo(todoId);
  const links = await queueTodoLinks(
    db,
    todoId,
    { title: todo.title, notes: todo.notes },
    { refetch: options?.refetch ?? true },
  );
  await finishTodoLinks(db, env, "user_test_123", links);
  return links;
}

describe("Link processing", () => {
  beforeEach(async () => {
    await cleanDb();
    resetUrlMetadataMock();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  describe("POST /todos/:id/process", () => {
    it("queues the links it's going to fetch and reports how many", async () => {
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Check x.com" });
      await seedTodoUrl(id, TWEET_URL);

      const res = await callProcess(id);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        status: "processing",
        links: 1,
      });
    });

    it("attaches a URL the todo's title carries but has no record for", async () => {
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: TWEET_URL });

      const res = await callProcess(id);
      expect(await res.json()).toMatchObject({ links: 1 });

      const urls = await getUrls(id);
      expect(urls).toHaveLength(1);
      expect(urls[0].url).toBe(TWEET_URL);
    });

    it("doesn't duplicate a link already attached", async () => {
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: `Read ${TWEET_URL}` });
      await seedTodoUrl(id, TWEET_URL);

      await callProcess(id);

      expect(await getUrls(id)).toHaveLength(1);
    });

    it("reports idle for a todo with no links at all", async () => {
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Buy milk" });

      const res = await callProcess(id);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: "idle", links: 0 });
    });

    it("runs with AI turned off — it isn't an AI feature", async () => {
      const db = getDb(env.DB);
      await db
        .update(users)
        .set({ aiEnabled: false })
        .where(eq(users.id, "user_test_123"));
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Check x.com" });
      await seedTodoUrl(id, TWEET_URL);

      const res = await callProcess(id);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ links: 1 });
    });

    it("404s for another user's todo", async () => {
      await seedUser("user_other", "other@example.com");
      const id = crypto.randomUUID();
      await seedTodo(id, "user_other", { title: "Check x.com" });

      expect((await callProcess(id)).status).toBe(404);
    });

    it("401s without auth", async () => {
      mockVerifyToken.mockResolvedValue(null);
      expect((await callProcess(crypto.randomUUID())).status).toBe(401);
    });
  });

  describe("queueTodoLinks", () => {
    it("leaves already-fetched links alone unless asked to refetch", async () => {
      const db = getDb(env.DB);
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Check example.com" });
      const seeded = await seedTodoUrl(id, "https://example.com/article");
      await db
        .update(todoUrls)
        .set({ fetchStatus: "fetched" })
        .where(eq(todoUrls.id, seeded.id));

      const todo = await getTodo(id);
      const skipped = await queueTodoLinks(db, id, todo);
      expect(skipped).toHaveLength(0);

      const requeued = await queueTodoLinks(db, id, todo, { refetch: true });
      expect(requeued).toHaveLength(1);
    });

    it("re-queues a link that previously failed, without being asked", async () => {
      const db = getDb(env.DB);
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Check example.com" });
      const seeded = await seedTodoUrl(id, "https://example.com/article");
      await db
        .update(todoUrls)
        .set({ fetchStatus: "failed" })
        .where(eq(todoUrls.id, seeded.id));

      const queued = await queueTodoLinks(db, id, await getTodo(id));
      expect(queued).toHaveLength(1);
      expect((await getUrls(id))[0].fetchStatus).toBe("pending");
    });
  });

  describe("titling a todo after its link", () => {
    it("replaces a 'Check {domain}' placeholder with the tweet's text", async () => {
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Check x.com" });
      await seedTodoUrl(id, TWEET_URL);
      mockFetchUrlMetadata({
        title: "Mark Phelps (@markphelps)",
        description: "A tweet worth keeping",
        siteName: "X",
      });

      await runProcess(id);

      expect((await getTodo(id)).title).toBe("A tweet worth keeping");
    });

    it("replaces a raw-URL title with the page title", async () => {
      const id = crypto.randomUUID();
      const url = "https://github.com/devenjarvis/lathe";
      await seedTodo(id, "user_test_123", { title: url });
      await seedTodoUrl(id, url);
      mockFetchUrlMetadata({
        title: "GitHub - devenjarvis/lathe",
        siteName: "GitHub",
      });

      await runProcess(id);

      expect((await getTodo(id)).title).toBe("GitHub - devenjarvis/lathe");
    });

    it("leaves a title the user wrote alone", async () => {
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Reply to Mark" });
      await seedTodoUrl(id, TWEET_URL);
      mockFetchUrlMetadata({
        description: "A tweet worth keeping",
        siteName: "X",
      });

      await runProcess(id);

      expect((await getTodo(id)).title).toBe("Reply to Mark");
    });

    it("keeps the placeholder when the page offers nothing better", async () => {
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Check example.com" });
      await seedTodoUrl(id, "https://example.com/page");

      await runProcess(id);

      expect((await getTodo(id)).title).toBe("Check example.com");
    });

    it("names the todo after the link its placeholder came from", async () => {
      const id = crypto.randomUUID();
      const db = getDb(env.DB);
      await seedTodo(id, "user_test_123", { title: "Check example.com" });
      const other = await seedTodoUrl(id, "https://other.com/page", "a0");
      const match = await seedTodoUrl(id, "https://example.com/page", "a1");
      await db
        .update(todoUrls)
        .set({ fetchStatus: "fetched", title: "Wrong one" })
        .where(eq(todoUrls.id, other.id));
      await db
        .update(todoUrls)
        .set({ fetchStatus: "fetched", title: "Right one" })
        .where(eq(todoUrls.id, match.id));

      expect(await applyLinkTitle(db, id)).toBe("Right one");
    });

    it("never titles a todo after one of its research sources", async () => {
      const db = getDb(env.DB);
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Check example.com" });
      const researchId = crypto.randomUUID();
      await db
        .insert(todoResearch)
        .values({ id: researchId, todoId: id, status: "completed" });
      const source = await seedTodoUrl(id, "https://example.com/page");
      await db
        .update(todoUrls)
        .set({ fetchStatus: "fetched", title: "A cited source", researchId })
        .where(eq(todoUrls.id, source.id));

      expect(await applyLinkTitle(db, id)).toBeNull();
      expect((await getTodo(id)).title).toBe("Check example.com");
    });
  });

  describe("failed fetches", () => {
    it("marks an unreachable link failed rather than fetched-and-empty", async () => {
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Check example.com" });
      await seedTodoUrl(id, "https://example.com/gone");
      mockFailedUrlFetch();

      await runProcess(id);

      expect((await getUrls(id))[0].fetchStatus).toBe("failed");
      // Nothing came back, so the placeholder stays rather than being cleared.
      expect((await getTodo(id)).title).toBe("Check example.com");
    });

    it("recovers a failed link on a re-process", async () => {
      const id = crypto.randomUUID();
      await seedTodo(id, "user_test_123", { title: "Check example.com" });
      await seedTodoUrl(id, "https://example.com/article");
      mockFailedUrlFetch();
      await runProcess(id);
      expect((await getUrls(id))[0].fetchStatus).toBe("failed");

      mockFetchUrlMetadata({ title: "An article", siteName: "Example" });
      await runProcess(id);

      expect((await getUrls(id))[0].fetchStatus).toBe("fetched");
      expect((await getTodo(id)).title).toBe("An article");
    });
  });
});
