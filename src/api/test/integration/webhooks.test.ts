import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, getDb, users } from "../../src/lib/db";
import { cleanDb, seedUser } from "../helpers";

const WEBHOOK_SECRET = "whsec_dGVzdC1zZWNyZXQ"; // base64 of "test-secret"

async function sign(body: string, id: string, timestamp: string) {
  const secret = Uint8Array.from(atob(WEBHOOK_SECRET.slice(6)), (c) =>
    c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;
}

async function postWebhook(body: string, signature: string | null) {
  const id = "msg_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "svix-id": id,
    "svix-timestamp": timestamp,
  };
  if (signature) headers["svix-signature"] = signature;
  return SELF.fetch("http://localhost/webhooks/clerk", {
    method: "POST",
    headers,
    body,
  });
}

async function postSignedWebhook(payload: object) {
  const body = JSON.stringify(payload);
  const id = "msg_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = await sign(body, id, timestamp);
  return SELF.fetch("http://localhost/webhooks/clerk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": sig,
    },
    body,
  });
}

describe("Clerk webhook", () => {
  beforeEach(async () => {
    await cleanDb();
    // The webhook reads CLERK_WEBHOOK_SECRET off the env via c.env. The
    // miniflare env is mutable from tests.
    (env as unknown as { CLERK_WEBHOOK_SECRET: string }).CLERK_WEBHOOK_SECRET =
      WEBHOOK_SECRET;
  });

  it("rejects missing signature with 401", async () => {
    const res = await postWebhook(JSON.stringify({ type: "user.deleted" }), null);
    expect(res.status).toBe(401);
  });

  it("rejects forged signature with 401", async () => {
    const res = await postWebhook(
      JSON.stringify({ type: "user.deleted", data: { id: "x" } }),
      "v1,QUFBQUFBQUE=",
    );
    expect(res.status).toBe(401);
  });

  it("deletes the user on a valid user.deleted event", async () => {
    await seedUser("user_to_delete", "bye@example.com");
    const res = await postSignedWebhook({
      type: "user.deleted",
      data: { id: "user_to_delete" },
    });
    expect(res.status).toBe(200);

    const db = getDb(env.DB);
    const remaining = await db
      .select()
      .from(users)
      .where(eq(users.id, "user_to_delete"));
    expect(remaining).toHaveLength(0);
  });

  it("ignores unknown event types without erroring", async () => {
    const res = await postSignedWebhook({
      type: "user.created",
      data: { id: "user_new" },
    });
    expect(res.status).toBe(200);
  });
});
