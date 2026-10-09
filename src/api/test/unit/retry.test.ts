import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../../src/lib/retry";

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { delayMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and returns the eventual success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("D1_ERROR: Network connection lost"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { delayMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(2);
  });

  it("rethrows the last error once every attempt fails", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockRejectedValueOnce(new Error("third"));
    await expect(withRetry(fn, { attempts: 3, delayMs: 0 })).rejects.toThrow(
      "third",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
