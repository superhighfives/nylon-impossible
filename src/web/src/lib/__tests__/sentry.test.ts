import { describe, expect, it } from "vitest";
import { isNetworkFailure } from "../sentry";

describe("isNetworkFailure", () => {
  it.each([
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
  ])("drops the browser's %s", (message) => {
    expect(isNetworkFailure(new TypeError(message))).toBe(true);
  });

  it("keeps other TypeErrors", () => {
    expect(
      isNetworkFailure(new TypeError("Cannot read properties of undefined")),
    ).toBe(false);
  });

  it("keeps a server error that happens to say the same words", () => {
    expect(isNetworkFailure(new Error("Failed to fetch"))).toBe(false);
  });

  it("keeps anything that isn't an error", () => {
    expect(isNetworkFailure("Failed to fetch")).toBe(false);
    expect(isNetworkFailure(undefined)).toBe(false);
  });
});
