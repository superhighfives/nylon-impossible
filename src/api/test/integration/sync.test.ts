import { SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { beforeEach, describe, expect, it } from "vitest";
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
});
