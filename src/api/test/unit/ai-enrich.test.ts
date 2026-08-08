import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoEnrichment } from "../../src/lib/ai";
import { getDb, todoSuggestions, todos, todoUrls } from "../../src/lib/db";
import { cleanDb, seedTodo, seedUser } from "../helpers";

// setup-mocks.ts globally stubs lib/ai-enrich to a no-op so handler tests
// don't hit Workers AI. Bypass that here with importActual to unit-test the
// real suggestion-generation logic against a mocked Ai binding instead.
const { enrichOrAskWithAI } = await vi.importActual<
  typeof import("../../src/lib/ai-enrich")
>("../../src/lib/ai-enrich");

function createMockAi(toolCallArgs: TodoEnrichment) {
  const run = vi.fn().mockImplementation(async () => ({
    response: null,
    tool_calls: [{ name: "enrich_todo", arguments: toolCallArgs }],
  }));
  return { run } as unknown as Ai;
}

const TODO_ID = "11111111-1111-1111-1111-111111111111";

async function runEnrich(
  args: TodoEnrichment,
  options?: Parameters<typeof enrichOrAskWithAI>[7],
) {
  const db = getDb(env.DB);
  await enrichOrAskWithAI(
    db,
    createMockAi(args),
    env,
    TODO_ID,
    "user_test_123",
    "Book DMV appointment https://dmv.ca.gov",
    undefined,
    options,
  );
}

describe("enrichOrAskWithAI (suggestions)", () => {
  beforeEach(async () => {
    await cleanDb();
    await seedUser();
    await seedTodo(TODO_ID, "user_test_123", {
      title: "Book DMV appointment https://dmv.ca.gov",
    });
  });

  it("does not mutate the todo directly", async () => {
    await runEnrich({
      title: "Book DMV appointment",
      urls: ["https://dmv.ca.gov"],
      dueDate: "2026-07-25",
    });

    const db = getDb(env.DB);
    const [todo] = await db.select().from(todos).where(eq(todos.id, TODO_ID));
    // Title and dueDate are untouched — only suggestions were written.
    expect(todo.title).toBe("Book DMV appointment https://dmv.ca.gov");
    expect(todo.dueDate).toBeNull();
    expect(todo.aiStatus).toBe("complete");
  });

  it("writes pending title and due_date suggestions with rendered labels", async () => {
    await runEnrich({
      title: "Book DMV appointment",
      urls: ["https://dmv.ca.gov"],
      dueDate: "2026-07-25",
    });

    const db = getDb(env.DB);
    const suggestions = await db
      .select()
      .from(todoSuggestions)
      .where(eq(todoSuggestions.todoId, TODO_ID));

    const title = suggestions.find((s) => s.type === "title");
    expect(title?.status).toBe("pending");
    expect(title?.payload).toEqual({ title: "Book DMV appointment" });
    expect(title?.label).toContain("Book DMV appointment");

    const dueDate = suggestions.find((s) => s.type === "due_date");
    expect(dueDate?.status).toBe("pending");
    expect(dueDate?.payload).toEqual({ dueDate: "2026-07-25" });
    expect(dueDate?.label).toContain("Set due date to");
  });

  it("still extracts URLs into todoUrls automatically (not a suggestion)", async () => {
    await runEnrich({
      title: "Book DMV appointment",
      urls: ["https://dmv.ca.gov"],
    });

    const db = getDb(env.DB);
    const urls = await db
      .select()
      .from(todoUrls)
      .where(eq(todoUrls.todoId, TODO_ID));
    expect(urls).toHaveLength(1);
    expect(urls[0].url).toBe("https://dmv.ca.gov");
  });

  it("does not suggest recurrence without an existing due date", async () => {
    await runEnrich(
      { title: "Book DMV appointment", recurrence: { frequency: "weekly" } },
      undefined,
    );

    const db = getDb(env.DB);
    const suggestions = await db
      .select()
      .from(todoSuggestions)
      .where(eq(todoSuggestions.todoId, TODO_ID));
    expect(suggestions.some((s) => s.type === "recurrence")).toBe(false);
  });

  it("suggests recurrence when an existing due date is passed as anchor", async () => {
    await runEnrich(
      { title: "Book DMV appointment", recurrence: { frequency: "weekly" } },
      { existingDueDate: new Date("2026-07-25") },
    );

    const db = getDb(env.DB);
    const suggestions = await db
      .select()
      .from(todoSuggestions)
      .where(eq(todoSuggestions.todoId, TODO_ID));
    const recurrence = suggestions.find((s) => s.type === "recurrence");
    expect(recurrence?.payload).toEqual({
      recurrence: { frequency: "weekly" },
    });
  });

  it("re-running enrich supersedes stale pending suggestions", async () => {
    await runEnrich({ title: "Book DMV appointment" });

    const db = getDb(env.DB);
    const firstRound = await db
      .select()
      .from(todoSuggestions)
      .where(eq(todoSuggestions.todoId, TODO_ID));
    expect(firstRound).toHaveLength(1);
    const staleId = firstRound[0].id;

    // Title stays the same as the (unapplied) suggestion's proposed value, so
    // the second run's enrichment input differs from the raw DB title —
    // simulate a fresh run proposing a different rename instead.
    await runEnrich({ title: "Renew DMV registration" });

    const secondRound = await db
      .select()
      .from(todoSuggestions)
      .where(eq(todoSuggestions.todoId, TODO_ID));
    expect(secondRound.map((s) => s.id)).not.toContain(staleId);
    expect(secondRound).toHaveLength(1);
    expect(secondRound[0].payload).toEqual({
      title: "Renew DMV registration",
    });
  });

  it("does not supersede an already-accepted suggestion", async () => {
    await runEnrich({ title: "Book DMV appointment" });
    const db = getDb(env.DB);
    await db
      .update(todoSuggestions)
      .set({ status: "accepted" })
      .where(eq(todoSuggestions.todoId, TODO_ID));

    await runEnrich({ title: "Renew DMV registration" });

    const suggestions = await db
      .select()
      .from(todoSuggestions)
      .where(eq(todoSuggestions.todoId, TODO_ID));
    expect(suggestions).toHaveLength(2);
    expect(suggestions.filter((s) => s.status === "accepted")).toHaveLength(1);
    expect(suggestions.filter((s) => s.status === "pending")).toHaveLength(1);
  });

  it("marks complete with no suggestions when the model returns nothing useful", async () => {
    // Unchanged title and no other fields — enrichTodo's own "nothing
    // extracted" fallback returns null in this case (see lib/ai.ts).
    await runEnrich({
      title: "Book DMV appointment https://dmv.ca.gov",
    });

    const db = getDb(env.DB);
    const [todo] = await db.select().from(todos).where(eq(todos.id, TODO_ID));
    expect(todo.aiStatus).toBe("complete");
    const suggestions = await db
      .select()
      .from(todoSuggestions)
      .where(eq(todoSuggestions.todoId, TODO_ID));
    expect(suggestions).toHaveLength(0);
  });
});
