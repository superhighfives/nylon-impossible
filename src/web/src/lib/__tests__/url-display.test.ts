import { describe, expect, it } from "vitest";
import type { SerializedTodoUrl } from "@/types/database";
import { buildFaviconErrorHandler, getUrlDisplay } from "../url-display";

function makeUrl(overrides?: Partial<SerializedTodoUrl>): SerializedTodoUrl {
  return {
    id: "u1",
    todoId: "t1",
    researchId: null,
    url: "https://example.com/post",
    title: null,
    description: null,
    siteName: null,
    favicon: null,
    image: null,
    position: "a0",
    fetchStatus: "fetched",
    fetchedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getUrlDisplay", () => {
  it("prefers the fetched title when fetching succeeded", () => {
    const d = getUrlDisplay(makeUrl({ title: "Nice article" }));
    expect(d.displayTitle).toBe("Nice article");
    expect(d.isPending).toBe(false);
    expect(d.isFailed).toBe(false);
  });

  it("falls back to siteName, then hostname, then raw URL", () => {
    expect(getUrlDisplay(makeUrl({ siteName: "Example" })).displayTitle).toBe(
      "Example",
    );
    expect(getUrlDisplay(makeUrl()).displayTitle).toBe("example.com");
    expect(getUrlDisplay(makeUrl({ url: "not a url" })).displayTitle).toBe(
      "not a url",
    );
  });

  it("shows the hostname while pending or failed, even if a title exists", () => {
    const pending = getUrlDisplay(
      makeUrl({ fetchStatus: "pending", title: "ignored" }),
    );
    expect(pending.displayTitle).toBe("example.com");
    expect(pending.isPending).toBe(true);

    const failed = getUrlDisplay(
      makeUrl({ fetchStatus: "failed", title: "ignored" }),
    );
    expect(failed.displayTitle).toBe("example.com");
    expect(failed.isFailed).toBe(true);
  });

  it("builds the Google favicon URL as a fallback when none is stored", () => {
    const d = getUrlDisplay(makeUrl());
    expect(d.favicon).toBe(d.googleFaviconUrl);
    expect(d.googleFaviconUrl).toContain("example.com");
  });

  it("prefers the stored favicon over the Google fallback", () => {
    const d = getUrlDisplay(
      makeUrl({ favicon: "https://cdn.example.com/fav.ico" }),
    );
    expect(d.favicon).toBe("https://cdn.example.com/fav.ico");
  });

  it("returns null hostname for malformed URLs", () => {
    const d = getUrlDisplay(makeUrl({ url: "not a url" }));
    expect(d.hostname).toBeNull();
    expect(d.googleFaviconUrl).toBeNull();
  });
});

describe("buildFaviconErrorHandler", () => {
  function makeEvent(src: string) {
    const img = document.createElement("img");
    img.src = src;
    const event = { currentTarget: img } as unknown as Parameters<
      ReturnType<typeof buildFaviconErrorHandler>
    >[0];
    return { img, event };
  }

  it("cascades a broken stored favicon to the Google fallback", () => {
    const url = makeUrl({ favicon: "https://cdn.example.com/fav.ico" });
    const googleUrl = "https://www.google.com/s2/favicons?domain=example.com";
    const handler = buildFaviconErrorHandler(url, googleUrl);
    const { img, event } = makeEvent("https://cdn.example.com/fav.ico");

    handler(event);

    expect(img.src).toBe(googleUrl);
  });

  it("hides the image when there's no fallback", () => {
    const url = makeUrl({ favicon: null });
    const handler = buildFaviconErrorHandler(url, null);
    const { img, event } = makeEvent(
      "https://www.google.com/s2/favicons?domain=example.com",
    );

    handler(event);

    expect(img.style.display).toBe("none");
  });

  it("hides the image if the Google fallback also fails", () => {
    const url = makeUrl({ favicon: "https://cdn.example.com/fav.ico" });
    const googleUrl = "https://www.google.com/s2/favicons?domain=example.com";
    const handler = buildFaviconErrorHandler(url, googleUrl);
    const { img, event } = makeEvent(googleUrl);

    handler(event);

    expect(img.style.display).toBe("none");
  });
});
