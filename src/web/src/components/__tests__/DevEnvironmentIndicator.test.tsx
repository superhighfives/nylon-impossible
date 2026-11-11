import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDevEnvironment } from "../DevEnvironmentIndicator";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ href: "/tasks" }),
}));

vi.mock("../../lib/config", () => ({
  API_URL: "https://api.nylonimpossible.com",
}));

function devEnvironment(origin: string) {
  return renderHook(() => useDevEnvironment(origin)).result.current;
}

describe("useDevEnvironment", () => {
  afterEach(() => {
    import.meta.env.PROD = false;
  });

  it("is non-null in development builds", () => {
    expect(devEnvironment("http://localhost:3000")?.apiUrl).toBe(
      "https://api.nylonimpossible.com",
    );
  });

  it("gives the full current URL", () => {
    expect(devEnvironment("http://localhost:3000")?.currentUrl).toBe(
      "http://localhost:3000/tasks",
    );
  });

  it("is non-null on preview deploy origins in production builds", () => {
    import.meta.env.PROD = true;
    expect(devEnvironment("https://pr-42.nylonimpossible.com")).not.toBeNull();
  });

  it("is null on production non-preview origins", () => {
    import.meta.env.PROD = true;
    expect(devEnvironment("https://nylonimpossible.com")).toBeNull();
  });

  it("matches preview hostname pattern correctly", () => {
    import.meta.env.PROD = true;
    const previewOrigins = [
      "https://pr-1.nylonimpossible.com",
      "https://pr-99.nylonimpossible.com",
      "https://pr-123.nylonimpossible.com",
    ];

    for (const origin of previewOrigins) {
      expect(devEnvironment(origin)).not.toBeNull();
    }
  });

  it("does not match non-preview origins", () => {
    import.meta.env.PROD = true;
    const nonPreviewOrigins = [
      "https://nylonimpossible.com",
      "https://www.nylonimpossible.com",
      "https://api.nylonimpossible.com",
      "https://api-pr-42.nylonimpossible.com",
      "http://localhost:3000",
    ];

    for (const origin of nonPreviewOrigins) {
      expect(devEnvironment(origin)).toBeNull();
    }
  });
});
