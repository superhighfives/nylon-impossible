import { DurableObject } from "cloudflare:workers";
import * as Sentry from "@sentry/cloudflare";

export class UserSync extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);

      return new Response(null, { status: 101, webSocket: client });
    }

    // POST /notify — server-to-server broadcast trigger
    if (url.pathname === "/notify" && request.method === "POST") {
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(JSON.stringify({ type: "sync" }));
        } catch {
          // Connection already closed, ignore
        }
      }
      return new Response("OK");
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    try {
      const data = JSON.parse(message);

      if (data.type === "changed") {
        // Broadcast sync to all OTHER connections
        for (const conn of this.ctx.getWebSockets()) {
          if (conn !== ws) {
            try {
              conn.send(JSON.stringify({ type: "sync" }));
            } catch {
              // Connection already closed, ignore
            }
          }
        }
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { area: "websocket", event: "malformed-message" },
      });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    Sentry.captureException(error, {
      tags: { area: "websocket", event: "connection-error" },
    });
    try {
      ws.close(1011, "WebSocket error");
    } catch {
      // Already closed
    }
  }
}
