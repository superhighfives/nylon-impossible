import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ApiError,
  apiErrorFrom,
  messageFromError,
  toast,
  toastManager,
} from "../toast";

describe("messageFromError", () => {
  it("shows the action's sentence over the server's or browser's message", () => {
    expect(
      messageFromError(
        new Error("Request failed (500)"),
        "Couldn’t add the link",
      ),
    ).toBe("Couldn’t add the link");
    expect(
      messageFromError(
        new TypeError("Failed to fetch"),
        "Couldn’t add the link",
      ),
    ).toBe("Couldn’t add the link");
    expect(
      messageFromError(
        new ApiError("Something went wrong. Try again.", "internal", 500),
        "Couldn’t add the link",
      ),
    ).toBe("Couldn’t add the link");
    expect(messageFromError("nope", "fallback")).toBe("fallback");
    expect(messageFromError(undefined, "fallback")).toBe("fallback");
  });

  it("never shows a zod failure's JSON", () => {
    const result = z
      .object({ notes: z.string().max(1, "Notes are too long") })
      .safeParse({ notes: "ab" });
    if (result.success) throw new Error("expected a failure");
    // As it arrives from a server function: an Error with the issues as JSON.
    expect(
      messageFromError(
        new Error(result.error.message),
        "Couldn’t save changes",
      ),
    ).toBe("Couldn’t save changes");
  });

  it("shows invalid_url's own message, which says what to do", () => {
    expect(
      messageFromError(
        new ApiError("That doesn't look like a link.", "invalid_url", 400),
        "Couldn’t add the link",
      ),
    ).toBe("That doesn't look like a link.");
  });

  it("shows rate_limited's own message, which says what to do", () => {
    expect(
      messageFromError(
        new ApiError(
          "Too many requests. Try again in a minute.",
          "rate_limited",
          429,
        ),
        "Couldn’t add the todo",
      ),
    ).toBe("Too many requests. Try again in a minute.");
  });
});

describe("messageFromError, server functions", () => {
  it("shows a rate-limited server function's message, which says what to do", () => {
    // As it arrives from a server function: the ServerFnError's message on a
    // plain Error (the shallow serializer drops the class and status).
    expect(
      messageFromError(
        new Error("Too many requests. Try again in a minute."),
        "Couldn’t save that change",
      ),
    ).toBe("Too many requests. Try again in a minute.");
  });

  it("keeps the action's sentence for any other server function error", () => {
    expect(
      messageFromError(
        new Error("Something went wrong. Try again."),
        "Couldn’t save that change",
      ),
    ).toBe("Couldn’t save that change");
  });
});

describe("apiErrorFrom", () => {
  it("reads the envelope's message and code", async () => {
    const err = await apiErrorFrom(
      Response.json(
        {
          error: "Too many requests. Try again in a minute.",
          code: "rate_limited",
        },
        { status: 429 },
      ),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Too many requests. Try again in a minute.");
    expect(err.code).toBe("rate_limited");
    expect(err.status).toBe(429);
  });

  it("falls back to the status when the body isn't an envelope", async () => {
    const err = await apiErrorFrom(new Response("oops", { status: 502 }));
    expect(err.message).toBe("Request failed (502)");
    expect(err.code).toBeUndefined();
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
