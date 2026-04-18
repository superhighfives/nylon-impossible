import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Resolves when `ws` receives its next message, or rejects if none arrives
// within `timeoutMs`. Lets tests wait deterministically for a broadcast
// instead of sleeping a fixed duration that's flaky under load.
function nextMessage(ws: WebSocket, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      reject(new Error(`No message received within ${timeoutMs}ms`));
    }, timeoutMs);
    const onMessage = (e: MessageEvent) => {
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      resolve(e.data as string);
    };
    ws.addEventListener("message", onMessage);
  });
}

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

    const received = nextMessage(ws);

    // Trigger notify
    await stub.fetch("http://localhost/notify", { method: "POST" });

    expect(JSON.parse(await received)).toEqual({ type: "sync" });

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

    // Track anything ws1 receives — it should stay empty, since the sender
    // is excluded from their own broadcast.
    const messages1: string[] = [];
    ws1.addEventListener("message", (e) => {
      messages1.push(e.data as string);
    });

    const ws2Received = nextMessage(ws2);

    // Client 1 sends "changed"
    ws1.send(JSON.stringify({ type: "changed" }));

    // Client 2 should receive the broadcast
    expect(JSON.parse(await ws2Received)).toEqual({ type: "sync" });

    // Client 1 should NOT have received it. By the time ws2 got the
    // broadcast, the DO has already delivered to everyone it's going to,
    // so checking ws1 here is deterministic.
    expect(messages1).toHaveLength(0);

    ws1.close();
    ws2.close();
  });
});
