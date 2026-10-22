import { SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDb, seedUser } from "../helpers";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const HEADERS = {
  Authorization: "Bearer test-token",
  "Content-Type": "application/json",
};

const VALID = {
  description: "Rows jump when ticked",
  context: { platform: "web", screen: "/today" },
};

function post(body: unknown) {
  return SELF.fetch("http://localhost/feedback", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
}

function mockAs(role: "admin" | null, userId = "user_test_123") {
  mockVerifyToken.mockResolvedValue(
    role ? { sub: userId, public_metadata: { role } } : { sub: userId },
  );
}

// Responses are built inside the mock: a Response created in the test's own
// request context can't be read from the worker's ("Cannot perform I/O on
// behalf of a different request").
describe("POST /feedback", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-admins with 403", async () => {
    mockAs(null);
    const res = await post(VALID);
    expect(res.status).toBe(403);
  });

  it("validates the body for admins", async () => {
    mockAs("admin");
    const res = await post({ ...VALID, description: "" });
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe("validation_failed");
  });

  it("files an issue in the configured repo and returns its number", async () => {
    mockAs("admin");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json(
        {
          number: 12,
          html_url: "https://github.com/superhighfives/nylon-feedback-test/issues/12",
        },
        { status: 201 },
      ),
    );

    const res = await post(VALID);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      issueNumber: 12,
      issueUrl: "https://github.com/superhighfives/nylon-feedback-test/issues/12",
    });
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api.github.com/repos/superhighfives/nylon-feedback-test/issues",
    );
  });

  it("answers feedback_failed when GitHub rejects the issue", async () => {
    mockAs("admin");
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("bad credentials", { status: 401 }),
    );
    const res = await post(VALID);
    expect(res.status).toBe(502);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe("feedback_failed");
  });
});

describe("GET /users/me isAdmin", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
  });

  it("is true only for tokens carrying the admin role", async () => {
    await seedUser("user_test_123");
    for (const [role, expected] of [
      ["admin", true],
      [null, false],
    ] as const) {
      mockAs(role);
      const res = await SELF.fetch("http://localhost/users/me", {
        headers: HEADERS,
      });
      const body = await res.json<{ isAdmin: boolean }>();
      expect(body.isAdmin).toBe(expected);
    }
  });
});
