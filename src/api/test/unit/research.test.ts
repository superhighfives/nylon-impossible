import { describe, expect, it } from "vitest";
import { isPlausibleUrl } from "../../src/lib/research";

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
