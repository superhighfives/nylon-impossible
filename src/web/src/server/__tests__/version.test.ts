import { afterEach, describe, expect, it, vi } from "vitest";
import { versionResponse } from "../version";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("versionResponse", () => {
  it("serves the build's commit as uncached JSON", async () => {
    vi.stubEnv("VITE_COMMIT_SHA", "4ac20a8");
    const res = versionResponse(
      new Request("https://nylonimpossible.com/version"),
    );
    expect(res?.status).toBe(200);
    expect(res?.headers.get("Cache-Control")).toBe("no-store");
    expect(res?.headers.get("Content-Type")).toContain("application/json");
    expect(await res?.json()).toEqual({ commit: "4ac20a8" });
  });

  it("serves a null commit when the build has none", async () => {
    vi.stubEnv("VITE_COMMIT_SHA", "");
    const res = versionResponse(new Request("http://localhost:3000/version"));
    expect(await res?.json()).toEqual({ commit: null });
  });

  it("leaves every other request to the app", () => {
    expect(
      versionResponse(new Request("https://nylonimpossible.com/")),
    ).toBeNull();
    expect(
      versionResponse(new Request("https://nylonimpossible.com/version/x")),
    ).toBeNull();
    expect(
      versionResponse(
        new Request("https://nylonimpossible.com/version", { method: "POST" }),
      ),
    ).toBeNull();
  });
});
