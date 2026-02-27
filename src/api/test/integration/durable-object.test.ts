import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

describe("UserSync Durable Object", () => {
  it("upgrades to WebSocket", async () => {
    const id = env.USER_SYNC.idFromName("test-upgrade");
    const stub = env.USER_SYNC.get(id);
    const res = await stub.fetch("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(101);
    expect(res.webSocket).toBeTruthy();

    // Clean up
    const ws = res.webSocket!;
    ws.accept();
    ws.close();
  });

  it("returns 404 for non-upgrade request", async () => {
    const id = env.USER_SYNC.idFromName("test-404");
    const stub = env.USER_SYNC.get(id);
    const res = await stub.fetch("http://localhost/other");
    expect(res.status).toBe(404);
  });

  it("POST /notify broadcasts sync to connected clients", async () => {
    const id = env.USER_SYNC.idFromName("test-notify");
    const stub = env.USER_SYNC.get(id);

    // Connect a WebSocket client
    const wsRes = await stub.fetch("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    const ws = wsRes.webSocket!;
    ws.accept();

    const messages: string[] = [];
    ws.addEventListener("message", (e) => {
      messages.push(e.data as string);
    });

    // Trigger notify
    await stub.fetch("http://localhost/notify", { method: "POST" });

    // Give the event loop a tick
    await new Promise((r) => setTimeout(r, 50));

    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({ type: "sync" });

    ws.close();
  });

  it("broadcasts 'changed' message to OTHER connections only", async () => {
    const id = env.USER_SYNC.idFromName("test-broadcast");
    const stub = env.USER_SYNC.get(id);

    // Connect two clients
    const wsRes1 = await stub.fetch("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    const ws1 = wsRes1.webSocket!;
    ws1.accept();

    const wsRes2 = await stub.fetch("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    const ws2 = wsRes2.webSocket!;
    ws2.accept();

    const messages1: string[] = [];
    const messages2: string[] = [];

    ws1.addEventListener("message", (e) => {
      messages1.push(e.data as string);
    });
    ws2.addEventListener("message", (e) => {
      messages2.push(e.data as string);
    });

    // Client 1 sends "changed"
    ws1.send(JSON.stringify({ type: "changed" }));

    // Give the event loop time
    await new Promise((r) => setTimeout(r, 50));

    // Client 1 should NOT receive the broadcast
    expect(messages1).toHaveLength(0);
    // Client 2 SHOULD receive the broadcast
    expect(messages2).toHaveLength(1);
    expect(JSON.parse(messages2[0])).toEqual({ type: "sync" });

    ws1.close();
    ws2.close();
  });
});
