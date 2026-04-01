import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUrlMetadata } from "../../src/lib/url-metadata";

// Build minimal HTML with requested meta tags
function makeHtml(parts: {
  ogTitle?: string;
  ogDescription?: string;
  ogSiteName?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  description?: string;
  title?: string;
  icon?: string;
  appleIcon?: string;
}): string {
  const tags: string[] = [];
  if (parts.ogTitle)
    tags.push(`<meta property="og:title" content="${parts.ogTitle}">`);
  if (parts.ogDescription)
    tags.push(
      `<meta property="og:description" content="${parts.ogDescription}">`,
    );
  if (parts.ogSiteName)
    tags.push(
      `<meta property="og:site_name" content="${parts.ogSiteName}">`,
    );
  if (parts.twitterTitle)
    tags.push(
      `<meta name="twitter:title" content="${parts.twitterTitle}">`,
    );
  if (parts.twitterDescription)
    tags.push(
      `<meta name="twitter:description" content="${parts.twitterDescription}">`,
    );
  if (parts.description)
    tags.push(`<meta name="description" content="${parts.description}">`);
  if (parts.title) tags.push(`<title>${parts.title}</title>`);
  if (parts.icon)
    tags.push(`<link rel="icon" href="${parts.icon}">`);
  if (parts.appleIcon)
    tags.push(`<link rel="apple-touch-icon" href="${parts.appleIcon}">`);

  return `<html><head>${tags.join("\n")}</head><body></body></html>`;
}

function stubFetchOk(html: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    }),
  );
}

function stubFetchError(err: Error): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
}

function stubFetchStatus(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve(""),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const NULL_METADATA = {
  title: null,
  description: null,
  siteName: null,
  favicon: null,
  image: null,
};

describe("fetchUrlMetadata", () => {
  describe("title extraction", () => {
    it("prefers og:title over other sources", async () => {
      stubFetchOk(
        makeHtml({
          ogTitle: "OG Title",
          twitterTitle: "Twitter Title",
          title: "HTML Title",
        }),
      );
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.title).toBe("OG Title");
    });

    it("falls back to twitter:title when og:title is absent", async () => {
      stubFetchOk(
        makeHtml({ twitterTitle: "Twitter Title", title: "HTML Title" }),
      );
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.title).toBe("Twitter Title");
    });

    it("falls back to <title> tag as last resort", async () => {
      stubFetchOk(makeHtml({ title: "HTML Title" }));
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.title).toBe("HTML Title");
    });

    it("returns null title when no title found", async () => {
      stubFetchOk(makeHtml({}));
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.title).toBeNull();
    });

    it("handles content-before-property attribute order", async () => {
      const html = `<html><head>
        <meta content="Content First Title" property="og:title">
      </head></html>`;
      stubFetchOk(html);
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.title).toBe("Content First Title");
    });

    it("trims whitespace from <title> tag", async () => {
      const html = "<html><head><title>  Trimmed Title  </title></head></html>";
      stubFetchOk(html);
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.title).toBe("Trimmed Title");
    });
  });

  describe("description extraction", () => {
    it("prefers og:description over other sources", async () => {
      stubFetchOk(
        makeHtml({
          ogDescription: "OG Desc",
          twitterDescription: "Twitter Desc",
          description: "Meta Desc",
        }),
      );
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.description).toBe("OG Desc");
    });

    it("falls back to twitter:description", async () => {
      stubFetchOk(
        makeHtml({ twitterDescription: "Twitter Desc", description: "Meta Desc" }),
      );
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.description).toBe("Twitter Desc");
    });

    it("falls back to standard meta description", async () => {
      stubFetchOk(makeHtml({ description: "Meta Desc" }));
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.description).toBe("Meta Desc");
    });

    it("returns null description when none found", async () => {
      stubFetchOk(makeHtml({}));
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.description).toBeNull();
    });
  });

  describe("siteName extraction", () => {
    it("uses og:site_name when present", async () => {
      stubFetchOk(makeHtml({ ogSiteName: "My Site" }));
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.siteName).toBe("My Site");
    });

    it("falls back to hostname (without www) when og:site_name is absent", async () => {
      stubFetchOk(makeHtml({}));
      const meta = await fetchUrlMetadata("https://www.example.com/path");
      expect(meta.siteName).toBe("example.com");
    });

    it("preserves subdomain in hostname fallback", async () => {
      stubFetchOk(makeHtml({}));
      const meta = await fetchUrlMetadata("https://api.example.com");
      expect(meta.siteName).toBe("api.example.com");
    });
  });

  describe("favicon extraction", () => {
    it("extracts favicon from link rel=icon with absolute URL", async () => {
      stubFetchOk(makeHtml({ icon: "https://cdn.example.com/icon.png" }));
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.favicon).toBe("https://cdn.example.com/icon.png");
    });

    it("resolves relative favicon path against base URL", async () => {
      stubFetchOk(makeHtml({ icon: "/images/favicon.png" }));
      const meta = await fetchUrlMetadata("https://example.com/page");
      expect(meta.favicon).toBe("https://example.com/images/favicon.png");
    });

    it("falls back to apple-touch-icon when no icon link", async () => {
      stubFetchOk(makeHtml({ appleIcon: "/apple-icon.png" }));
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.favicon).toBe("https://example.com/apple-icon.png");
    });

    it("falls back to /favicon.ico when no link tags present", async () => {
      stubFetchOk(makeHtml({}));
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.favicon).toBe("https://example.com/favicon.ico");
    });

    it("prefers rel=icon over apple-touch-icon", async () => {
      stubFetchOk(makeHtml({ icon: "/icon.png", appleIcon: "/apple.png" }));
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta.favicon).toBe("https://example.com/icon.png");
    });
  });

  describe("error handling", () => {
    it("returns null metadata on network failure", async () => {
      stubFetchError(new Error("Network error"));
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta).toEqual(NULL_METADATA);
    });

    it("returns null metadata on 404 response", async () => {
      stubFetchStatus(404);
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta).toEqual(NULL_METADATA);
    });

    it("returns null metadata on 500 response", async () => {
      stubFetchStatus(500);
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta).toEqual(NULL_METADATA);
    });

    it("returns null metadata when response.text() throws", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.reject(new Error("body read failed")),
        }),
      );
      const meta = await fetchUrlMetadata("https://example.com");
      expect(meta).toEqual(NULL_METADATA);
    });
  });

  describe("request behaviour", () => {
    it("sends NylonBot User-Agent header", async () => {
      const mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<title>Test</title>"),
      });
      vi.stubGlobal("fetch", mockFetchFn);

      await fetchUrlMetadata("https://example.com");

      expect(mockFetchFn).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({
          headers: { "User-Agent": "NylonBot/1.0" },
        }),
      );
    });

    it("follows redirects", async () => {
      const mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<title>Redirected Page</title>"),
      });
      vi.stubGlobal("fetch", mockFetchFn);

      await fetchUrlMetadata("https://example.com");

      expect(mockFetchFn).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({ redirect: "follow" }),
      );
    });
  });
});
