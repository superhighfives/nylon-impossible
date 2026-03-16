import { describe, expect, it } from "vitest";
import {
  createFallbackFromUrl,
  extractDomain,
  truncateTitle,
} from "../../src/lib/url-helpers";

describe("extractDomain", () => {
  it("extracts domain from https URL", () => {
    expect(extractDomain("https://example.com/path")).toBe("example.com");
  });

  it("extracts domain from http URL", () => {
    expect(extractDomain("http://example.com")).toBe("example.com");
  });

  it("strips www prefix", () => {
    expect(extractDomain("https://www.example.com")).toBe("example.com");
  });

  it("preserves subdomain (not www)", () => {
    expect(extractDomain("https://api.example.com")).toBe("api.example.com");
  });

  it("handles complex TLDs", () => {
    expect(extractDomain("http://sub.example.co.uk/page")).toBe(
      "sub.example.co.uk",
    );
  });

  it("handles URL with port", () => {
    // Note: url.hostname excludes port, which is fine for our "Check domain" titles
    expect(extractDomain("https://example.com:8080/path")).toBe("example.com");
  });

  it("handles URL with query params", () => {
    expect(extractDomain("https://example.com?foo=bar")).toBe("example.com");
  });

  it("handles URL with fragment", () => {
    expect(extractDomain("https://example.com#section")).toBe("example.com");
  });

  it("returns null for invalid URL", () => {
    expect(extractDomain("not-a-url")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractDomain("")).toBeNull();
  });

  it("returns null for non-http protocol", () => {
    expect(extractDomain("ftp://example.com")).toBeNull();
    expect(extractDomain("file:///path/to/file")).toBeNull();
  });

  it("returns null for javascript: protocol", () => {
    expect(extractDomain("javascript:alert(1)")).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(extractDomain(null as unknown as string)).toBeNull();
    expect(extractDomain(undefined as unknown as string)).toBeNull();
  });
});

describe("createFallbackFromUrl", () => {
  it("creates title and url from simple URL", () => {
    const result = createFallbackFromUrl("https://example.com");
    expect(result).toEqual({
      title: "Check example.com",
      url: "https://example.com/",
    });
  });

  it("creates title and url from URL with path", () => {
    const result = createFallbackFromUrl("https://example.com/path/to/page");
    expect(result).toEqual({
      title: "Check example.com",
      url: "https://example.com/path/to/page",
    });
  });

  it("preserves query params in URL", () => {
    const result = createFallbackFromUrl(
      "https://example.com/search?q=test&page=1",
    );
    expect(result?.url).toBe("https://example.com/search?q=test&page=1");
    expect(result?.title).toBe("Check example.com");
  });

  it("strips www from title", () => {
    const result = createFallbackFromUrl("https://www.example.com/page");
    expect(result?.title).toBe("Check example.com");
  });

  it("handles URL with subdomain", () => {
    const result = createFallbackFromUrl("https://blog.example.com/post");
    expect(result?.title).toBe("Check blog.example.com");
  });

  it("normalizes URL (adds trailing slash to root)", () => {
    const result = createFallbackFromUrl("https://example.com");
    expect(result?.url).toBe("https://example.com/");
  });

  it("returns null for invalid URL", () => {
    expect(createFallbackFromUrl("not-a-url")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(createFallbackFromUrl("")).toBeNull();
  });

  it("handles very long URL", () => {
    const longUrl = `https://example.com/search?q=${"a".repeat(1000)}`;
    const result = createFallbackFromUrl(longUrl);
    expect(result?.title).toBe("Check example.com");
    expect(result?.url).toBe(longUrl);
  });

  it("handles google.com URL", () => {
    const result = createFallbackFromUrl(
      "https://www.google.com/search?q=test",
    );
    expect(result?.title).toBe("Check google.com");
  });
});

describe("truncateTitle", () => {
  it("returns unchanged text under 500 chars", () => {
    const text = "Short title";
    expect(truncateTitle(text)).toBe(text);
  });

  it("returns unchanged text at exactly 500 chars", () => {
    const text = "a".repeat(500);
    expect(truncateTitle(text)).toBe(text);
  });

  it("truncates text over 500 chars with ellipsis", () => {
    const text = "a".repeat(501);
    const result = truncateTitle(text);
    expect(result.length).toBe(500);
    expect(result.endsWith("...")).toBe(true);
  });

  it("truncates at word boundary when possible", () => {
    // Create text that's just over 500 chars with words
    const words = "word ".repeat(100); // 500 chars exactly
    const text = words + "extra";
    const result = truncateTitle(text);

    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.endsWith("...")).toBe(true);
    // Should not cut in middle of "extra"
    expect(result).not.toContain("extr...");
  });

  it("hard truncates when no good word boundary", () => {
    // Single very long word
    const text = "a".repeat(600);
    const result = truncateTitle(text);

    expect(result.length).toBe(500);
    expect(result).toBe("a".repeat(497) + "...");
  });

  it("handles custom max length", () => {
    const text = "a".repeat(200);
    const result = truncateTitle(text, 100);

    expect(result.length).toBe(100);
    expect(result.endsWith("...")).toBe(true);
  });

  it("returns empty string unchanged", () => {
    expect(truncateTitle("")).toBe("");
  });

  it("handles null/undefined gracefully", () => {
    expect(truncateTitle(null as unknown as string)).toBe(null);
    expect(truncateTitle(undefined as unknown as string)).toBe(undefined);
  });

  it("preserves unicode characters", () => {
    const text = "日本語テスト";
    expect(truncateTitle(text)).toBe(text);
  });

  it("truncates unicode text correctly", () => {
    const text = "日".repeat(501);
    const result = truncateTitle(text);
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles emoji", () => {
    const text = "🎉".repeat(200);
    const result = truncateTitle(text);
    // Emoji are multi-byte but count as single chars in JS
    expect(result.length).toBeLessThanOrEqual(500);
  });
});
