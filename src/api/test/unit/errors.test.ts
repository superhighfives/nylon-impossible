import { Hono } from "hono";
import { z } from "zod/v4";
import { describe, expect, it } from "vitest";
import {
  API_ERRORS,
  apiError,
  apiValidationError,
  readJsonBody,
} from "../../src/lib/errors";

function makeApp(handler: (c: Parameters<Parameters<Hono["get"]>[1]>[0]) => unknown) {
  const app = new Hono();
  // biome-ignore lint/suspicious/noExplicitAny: test shim for handler
  app.get("/test", handler as any);
  return app;
}

function makePostApp(
  handler: (c: Parameters<Parameters<Hono["post"]>[1]>[0]) => unknown,
) {
  const app = new Hono();
  // biome-ignore lint/suspicious/noExplicitAny: test shim for handler
  app.post("/test", handler as any);
  return app;
}

describe("apiError", () => {
  it.each(
    (Object.keys(API_ERRORS) as Array<keyof typeof API_ERRORS>).map(
      (code) => [code, API_ERRORS[code]] as const,
    ),
  )("maps %s to the catalog status + message", async (code, entry) => {
    const app = makeApp((c) => apiError(c, code));
    const res = await app.request("/test");
    expect(res.status).toBe(entry.status);
    expect(await res.json()).toEqual({ error: entry.message, code });
  });

  it("allows overriding the message and attaching details", async () => {
    const app = makeApp((c) =>
      apiError(c, "todo_not_found", {
        message: "That todo vanished",
        details: { id: "abc" },
      }),
    );
    const res = await app.request("/test");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "That todo vanished",
      code: "todo_not_found",
      details: { id: "abc" },
    });
  });
});

describe("apiValidationError", () => {
  const schema = z.object({
    title: z.string().min(1, "Title is required"),
  });

  it("returns a validation_failed envelope with the first issue surfaced", async () => {
    const parsed = schema.safeParse({ title: "" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const app = makeApp((c) => apiValidationError(c, parsed.error));
    const res = await app.request("/test");
    expect(res.status).toBe(400);

    const body = (await res.json()) as {
      error: string;
      code: string;
      details: unknown[];
    };
    expect(body.code).toBe("validation_failed");
    expect(body.error).toBe("Title is required");
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });
});

describe("readJsonBody", () => {
  it("returns the parsed body when the request is valid JSON", async () => {
    const app = makePostApp(async (c) => {
      const result = await readJsonBody(c);
      if (!result.ok) return result.response;
      return c.json({ body: result.body });
    });
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ body: { hello: "world" } });
  });

  it("returns an invalid_json error response for malformed bodies", async () => {
    const app = makePostApp(async (c) => {
      const result = await readJsonBody(c);
      if (!result.ok) return result.response;
      return c.json({ body: result.body });
    });
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: API_ERRORS.invalid_json.message,
      code: "invalid_json",
    });
  });
});
