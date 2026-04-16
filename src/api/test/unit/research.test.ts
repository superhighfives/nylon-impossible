import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlausibleUrl, isUrlReachable } from "../../src/lib/research";

describe("isPlausibleUrl", () => {
  describe("accepts plausible URLs", () => {
    it("accepts a typical Wikipedia article URL", () => {
      expect(
        isPlausibleUrl("https://en.wikipedia.org/wiki/Long-haired_cat"),
      ).toBe(true);
    });

    it("accepts a simple homepage", () => {
      expect(isPlausibleUrl("https://www.example.org")).toBe(true);
    });

    it("accepts a URL with a path containing hyphens and dots", () => {
      expect(
        isPlausibleUrl("https://www.petsmart.com/learning-center/cat-care.html"),
      ).toBe(true);
    });

    it("accepts Google Maps place URLs", () => {
      expect(
        isPlausibleUrl("https://www.google.com/maps/place/San+Jalisco"),
      ).toBe(true);
    });

    it("accepts Google Maps search URLs", () => {
      expect(
        isPlausibleUrl("https://www.google.com/maps/search/Venue+Name"),
      ).toBe(true);
    });

    it("accepts Google Maps directions URLs", () => {
      expect(
        isPlausibleUrl("https://www.google.com/maps/dir/A/B"),
      ).toBe(true);
    });

    it("accepts maps.google.com URLs", () => {
      expect(isPlausibleUrl("https://maps.google.com/maps/place/Somewhere"))
        .toBe(true);
    });

    it("accepts URLs with '+' in the path (not a fabrication signal)", () => {
      expect(isPlausibleUrl("https://example.com/c++/reference")).toBe(true);
    });

    it("accepts URLs with ordinary query parameters on non-Google hosts", () => {
      expect(
        isPlausibleUrl("https://news.ycombinator.com/item?id=12345"),
      ).toBe(true);
    });
  });

  describe("rejects hallucinated URLs", () => {
    it("rejects URLs with %20 in the pathname", () => {
      expect(
        isPlausibleUrl(
          "https://google.com/kittens%20with%20long%20hair/search",
        ),
      ).toBe(false);
    });

    it("rejects Google search result URLs with fake params", () => {
      expect(
        isPlausibleUrl(
          "https://www.google.com/search?tbm=isch&q=kittens&ved=abc&ei=xyz",
        ),
      ).toBe(false);
    });

    it("rejects google.com image search deep links", () => {
      expect(
        isPlausibleUrl(
          "https://google.com/kittens/search?q=kittens&tbm=isch",
        ),
      ).toBe(false);
    });

    it("rejects malformed URLs", () => {
      expect(isPlausibleUrl("not a url")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isPlausibleUrl("")).toBe(false);
    });
  });
});

describe("isUrlReachable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a URL that returns 200 to HEAD", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await isUrlReachable("https://example.com")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe("HEAD");
  });

  it("accepts redirect chains that resolve to 2xx", async () => {
    // redirect: "follow" means the caller sees only the final response,
    // so a 301→200 chain surfaces as status 200.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await isUrlReachable("https://short.ly/xyz")).toBe(true);
  });

  it("rejects URLs that return 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await isUrlReachable("https://example.com/missing")).toBe(false);
  });

  it("rejects URLs that return 500", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await isUrlReachable("https://example.com")).toBe(false);
  });

  it("falls back to GET when server rejects HEAD with 405", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 405 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await isUrlReachable("https://example.com")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].method).toBe("HEAD");
    expect(fetchMock.mock.calls[1][1].method).toBe("GET");
    expect(fetchMock.mock.calls[1][1].headers.Range).toBe("bytes=0-0");
  });

  it("accepts 206 Partial Content from the GET fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 501 })
      .mockResolvedValueOnce({ ok: false, status: 206 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await isUrlReachable("https://example.com")).toBe(true);
  });

  it("rejects URLs that throw a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    expect(await isUrlReachable("https://does-not-exist.invalid")).toBe(
      false,
    );
  });

  it("rejects URLs that time out", async () => {
    // AbortSignal.timeout surfaces as an AbortError / DOMException.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timeout", "AbortError")),
    );

    expect(await isUrlReachable("https://slow.example.com")).toBe(false);
  });
});
