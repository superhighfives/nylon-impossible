import { describe, expect, it, vi } from "vitest";
import { messageFromError, toast, toastManager } from "../toast";

describe("messageFromError", () => {
  it("returns Error.message when present", () => {
    expect(messageFromError(new Error("boom"), "fallback")).toBe("boom");
  });

  it("returns string when err is a non-empty string", () => {
    expect(messageFromError("nope", "fallback")).toBe("nope");
  });

  it("falls back when err is unknown or empty", () => {
    expect(messageFromError(undefined, "fallback")).toBe("fallback");
    expect(messageFromError(null, "fallback")).toBe("fallback");
    expect(messageFromError("", "fallback")).toBe("fallback");
    expect(messageFromError(new Error(), "fallback")).toBe("fallback");
  });
});

describe("toast helpers", () => {
  it("dispatches success toasts via the manager", () => {
    const addSpy = vi.spyOn(toastManager, "add");
    toast.success("saved");
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "saved",
        type: "success",
        data: { type: "success" },
      }),
    );
    addSpy.mockRestore();
  });

  it("dispatches error toasts with high priority by default", () => {
    const addSpy = vi.spyOn(toastManager, "add");
    toast.error("broken");
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "broken",
        type: "error",
        priority: "high",
      }),
    );
    addSpy.mockRestore();
  });

  it("allows overriding options per call", () => {
    const addSpy = vi.spyOn(toastManager, "add");
    toast.info("hi", { timeout: 0 });
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "info", timeout: 0 }),
    );
    addSpy.mockRestore();
  });

  it("forwards dismiss to the manager", () => {
    const closeSpy = vi.spyOn(toastManager, "close");
    toast.dismiss("id-1");
    expect(closeSpy).toHaveBeenCalledWith("id-1");
    closeSpy.mockRestore();
  });
});
