/**
 * Integration tests for research functionality.
 *
 * Tests research record creation, sync response, and re-research endpoint.
 * Note: These tests verify the record/sync flow, not the actual AI research
 * execution (which requires real AI credentials).
 */

import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, todoResearch, todos, todoUrls, users } from "../../src/lib/db";
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

async function reresearchRequest(todoId: string) {
  return SELF.fetch(`http://localhost/todos/${todoId}/research`, {
    method: "POST",
    headers: AUTH_HEADER,
  });
}

describe("Research functionality", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
    await seedUser();
  });

  describe("Research in sync response", () => {
    it("includes research data in sync response when present", async () => {
      const db = getDb(env.DB);
      const now = new Date();
      const todoId = "550e8400-e29b-41d4-a716-446655440020";
      const researchId = "550e8400-e29b-41d4-a716-446655440021";

      // Create a todo directly
      await db.insert(todos).values({
        id: todoId,
        userId: "user_test_123",
        title: "How does OAuth work",
        position: "a0",
        createdAt: now,
        updatedAt: now,
      });

      // Create research record
      await db.insert(todoResearch).values({
        id: researchId,
        todoId,
        status: "completed",
        researchType: "general",
        summary:
          "OAuth is an authorization framework that allows third-party applications to access user data without sharing passwords [1][2].",
        researchedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Create research source URLs
      await db.insert(todoUrls).values([
        {
          id: "550e8400-e29b-41d4-a716-446655440022",
          todoId,
          researchId,
          url: "https://oauth.net/2/",
          position: "a0",
          fetchStatus: "fetched",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440023",
          todoId,
          researchId,
          url: "https://en.wikipedia.org/wiki/OAuth",
          position: "a1",
          fetchStatus: "fetched",
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Sync and check response
      const res = await syncRequest({ changes: [] });
      expect(res.status).toBe(200);

      const body = await res.json<any>();
      expect(body.todos).toHaveLength(1);

      const todo = body.todos[0];
      expect(todo.research).toBeTruthy();
      expect(todo.research.id).toBe(researchId);
      expect(todo.research.status).toBe("completed");
      expect(todo.research.researchType).toBe("general");
      expect(todo.research.summary).toContain("OAuth");
      expect(todo.research.researchedAt).toBeTruthy();
      expect(todo.research.createdAt).toBeTruthy();
      expect(todo.research.updatedAt).toBeTruthy();

      // URLs should include researchId
      expect(todo.urls).toHaveLength(2);
      expect(todo.urls[0].researchId).toBe(researchId);
      expect(todo.urls[1].researchId).toBe(researchId);
    });

    it("returns null research when todo has no research", async () => {
      const db = getDb(env.DB);
      const now = new Date();
      const todoId = "550e8400-e29b-41d4-a716-446655440030";

      // Create a todo without research
      await db.insert(todos).values({
        id: todoId,
        userId: "user_test_123",
        title: "Buy milk",
        position: "a0",
        createdAt: now,
        updatedAt: now,
      });

      const res = await syncRequest({ changes: [] });
      expect(res.status).toBe(200);

      const body = await res.json<any>();
      expect(body.todos[0].research).toBeNull();
    });

    it("includes pending research in sync response", async () => {
      const db = getDb(env.DB);
      const now = new Date();
      const todoId = "550e8400-e29b-41d4-a716-446655440040";
      const researchId = "550e8400-e29b-41d4-a716-446655440041";

      await db.insert(todos).values({
        id: todoId,
        userId: "user_test_123",
        title: "Best practices for React",
        position: "a0",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(todoResearch).values({
        id: researchId,
        todoId,
        status: "pending",
        researchType: "general",
        createdAt: now,
        updatedAt: now,
      });

      const res = await syncRequest({ changes: [] });
      expect(res.status).toBe(200);

      const body = await res.json<any>();
      expect(body.todos[0].research).toBeTruthy();
      expect(body.todos[0].research.status).toBe("pending");
      expect(body.todos[0].research.summary).toBeNull();
      expect(body.todos[0].research.createdAt).toBeTruthy();
      expect(body.todos[0].research.updatedAt).toBeTruthy();
    });
  });

  describe("Re-research endpoint", () => {
    it("creates new research record when none exists", async () => {
      const db = getDb(env.DB);
      const now = new Date();
      const todoId = "550e8400-e29b-41d4-a716-446655440050";

      await db.insert(todos).values({
        id: todoId,
        userId: "user_test_123",
        title: "How does OAuth work",
        position: "a0",
        createdAt: now,
        updatedAt: now,
      });

      const res = await reresearchRequest(todoId);
      expect(res.status).toBe(200);

      const body = await res.json<any>();
      expect(body.id).toBeTruthy();
      // Initial response is always "pending"
      expect(body.status).toBe("pending");
      expect(body.researchType).toBe("general");

      // Verify in database - research record was created.
      // Note: In tests, the background job may already have run and failed
      // (no AI binding), so we just verify the record exists.
      const [research] = await db
        .select()
        .from(todoResearch)
        .where(eq(todoResearch.todoId, todoId));
      expect(research).toBeTruthy();
      expect(research.id).toBe(body.id);
    });

    it("deletes existing research and creates new one", async () => {
      const db = getDb(env.DB);
      const now = new Date();
      const todoId = "550e8400-e29b-41d4-a716-446655440060";
      const oldResearchId = "550e8400-e29b-41d4-a716-446655440061";

      await db.insert(todos).values({
        id: todoId,
        userId: "user_test_123",
        title: "How does OAuth work",
        position: "a0",
        createdAt: now,
        updatedAt: now,
      });

      // Create existing completed research
      await db.insert(todoResearch).values({
        id: oldResearchId,
        todoId,
        status: "completed",
        researchType: "general",
        summary: "Old summary",
        researchedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Create research source URLs
      await db.insert(todoUrls).values({
        id: "550e8400-e29b-41d4-a716-446655440062",
        todoId,
        researchId: oldResearchId,
        url: "https://old-source.com",
        position: "a0",
        fetchStatus: "fetched",
        createdAt: now,
        updatedAt: now,
      });

      const res = await reresearchRequest(todoId);
      expect(res.status).toBe(200);

      const body = await res.json<any>();
      expect(body.id).not.toBe(oldResearchId);
      expect(body.status).toBe("pending");

      // Old research should be deleted
      const oldResearch = await db
        .select()
        .from(todoResearch)
        .where(eq(todoResearch.id, oldResearchId));
      expect(oldResearch).toHaveLength(0);

      // Old URLs with researchId should be deleted
      const oldUrls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.researchId, oldResearchId));
      expect(oldUrls).toHaveLength(0);

      // New research should exist
      const newResearch = await db
        .select()
        .from(todoResearch)
        .where(eq(todoResearch.todoId, todoId));
      expect(newResearch).toHaveLength(1);
      expect(newResearch[0].id).toBe(body.id);
    });

    it("preserves research type from existing record", async () => {
      const db = getDb(env.DB);
      const now = new Date();
      const todoId = "550e8400-e29b-41d4-a716-446655440070";

      await db.insert(todos).values({
        id: todoId,
        userId: "user_test_123",
        title: "Book dinner at San Jalisco",
        position: "a0",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(todoResearch).values({
        id: "550e8400-e29b-41d4-a716-446655440071",
        todoId,
        status: "failed",
        researchType: "location",
        createdAt: now,
        updatedAt: now,
      });

      const res = await reresearchRequest(todoId);
      expect(res.status).toBe(200);

      const body = await res.json<any>();
      expect(body.researchType).toBe("location");
    });

    it("returns 404 for non-existent todo", async () => {
      const res = await reresearchRequest(
        "550e8400-e29b-41d4-a716-446655440099",
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for todo owned by another user", async () => {
      const db = getDb(env.DB);
      const now = new Date();

      // Create a todo owned by another user
      await db.insert(users).values({
        id: "other_user",
        email: "other@example.com",
      });
      await db.insert(todos).values({
        id: "550e8400-e29b-41d4-a716-446655440080",
        userId: "other_user",
        title: "Other user todo",
        position: "a0",
        createdAt: now,
        updatedAt: now,
      });

      const res = await reresearchRequest(
        "550e8400-e29b-41d4-a716-446655440080",
      );
      expect(res.status).toBe(404);
    });
  });

  describe("User location", () => {
    it("PATCH /users/me accepts and persists location", async () => {
      const res = await SELF.fetch("http://localhost/users/me", {
        method: "PATCH",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ location: "Los Angeles, CA" }),
      });
      expect(res.status).toBe(200);

      const body = await res.json<any>();
      expect(body.location).toBe("Los Angeles, CA");

      // Verify in database
      const db = getDb(env.DB);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, "user_test_123"));
      expect(user.location).toBe("Los Angeles, CA");
    });

    it("PATCH /users/me can clear location with null", async () => {
      const db = getDb(env.DB);

      // Set location first
      await db
        .update(users)
        .set({ location: "San Francisco, CA" })
        .where(eq(users.id, "user_test_123"));

      const res = await SELF.fetch("http://localhost/users/me", {
        method: "PATCH",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ location: null }),
      });
      expect(res.status).toBe(200);

      const body = await res.json<any>();
      expect(body.location).toBeNull();
    });

    it("GET /users/me returns location", async () => {
      const db = getDb(env.DB);
      await db
        .update(users)
        .set({ location: "New York, NY" })
        .where(eq(users.id, "user_test_123"));

      const res = await SELF.fetch("http://localhost/users/me", {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);

      const body = await res.json<any>();
      expect(body.location).toBe("New York, NY");
    });
  });
});
