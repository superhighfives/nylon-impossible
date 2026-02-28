import { afterEach, describe, expect, it, vi } from "vitest";

describe("config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses localhost on localhost hostname", async () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });

    const { API_URL, WS_URL } = await import("../config");

    expect(API_URL).toBe("http://localhost:8787");
    expect(WS_URL).toBe("ws://localhost:8787/ws");
  });

  it("uses VITE_API_BASE_URL when set and not localhost", async () => {
    vi.stubGlobal("window", { location: { hostname: "pr-42.nylonimpossible.com" } });
    vi.stubEnv("VITE_API_BASE_URL", "https://api-pr-42.nylonimpossible.com");

    const { API_URL, WS_URL } = await import("../config");

    expect(API_URL).toBe("https://api-pr-42.nylonimpossible.com");
    expect(WS_URL).toBe("wss://api-pr-42.nylonimpossible.com/ws");
  });

  it("falls back to production URL when VITE_API_BASE_URL is not set", async () => {
    vi.stubGlobal("window", { location: { hostname: "nylonimpossible.com" } });

    const { API_URL, WS_URL } = await import("../config");

    expect(API_URL).toBe("https://api.nylonimpossible.com");
    expect(WS_URL).toBe("wss://api.nylonimpossible.com/ws");
  });

  it("converts http to ws in WS_URL", async () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });

    const { WS_URL } = await import("../config");

    expect(WS_URL).toMatch(/^ws:\/\//);
    expect(WS_URL).not.toMatch(/^http/);
  });

  it("converts https to wss in WS_URL", async () => {
    vi.stubGlobal("window", { location: { hostname: "nylonimpossible.com" } });

    const { WS_URL } = await import("../config");

    expect(WS_URL).toMatch(/^wss:\/\//);
  });
});
