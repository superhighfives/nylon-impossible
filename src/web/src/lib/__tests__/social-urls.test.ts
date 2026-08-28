import { describe, expect, it } from "vitest";
import { getSocialUrlInfo, parseSocialAuthor } from "../social-urls";

// Both of these are mirrored in the iOS `SocialPreviewCard.swift` so a tweet
// renders the same on web and in the app. Changing behaviour here means
// changing `socialUrlInfo(for:)` / `parseSocialAuthor(_:)` alongside it.

describe("getSocialUrlInfo", () => {
  it("detects a tweet on both twitter.com and x.com", () => {
    for (const url of [
      "https://x.com/bcherny/status/1234567890",
      "https://twitter.com/bcherny/status/1234567890",
      "https://www.x.com/bcherny/status/1234567890",
    ]) {
      expect(getSocialUrlInfo(url)).toEqual({
        platform: "twitter",
        isPost: true,
        hostname: new URL(url).hostname,
      });
    }
  });

  it("detects the canonical /i tweet forms", () => {
    expect(getSocialUrlInfo("https://x.com/i/status/123")?.isPost).toBe(true);
    expect(getSocialUrlInfo("https://x.com/i/web/status/123")?.isPost).toBe(
      true,
    );
  });

  it("treats a bare profile as not a post", () => {
    expect(getSocialUrlInfo("https://x.com/bcherny")).toEqual({
      platform: "twitter",
      isPost: false,
      hostname: "x.com",
    });
  });

  it("detects Instagram posts and reels but not profiles", () => {
    expect(getSocialUrlInfo("https://instagram.com/p/abc123")?.isPost).toBe(
      true,
    );
    expect(getSocialUrlInfo("https://instagram.com/reel/abc123")?.isPost).toBe(
      true,
    );
    expect(getSocialUrlInfo("https://instagram.com/someone")?.isPost).toBe(
      false,
    );
  });

  it("detects YouTube videos across watch, short-link, and shorts forms", () => {
    expect(
      getSocialUrlInfo("https://www.youtube.com/watch?v=abc123")?.isPost,
    ).toBe(true);
    expect(getSocialUrlInfo("https://youtu.be/abc123")?.isPost).toBe(true);
    expect(getSocialUrlInfo("https://youtube.com/shorts/abc123")?.isPost).toBe(
      true,
    );
    expect(getSocialUrlInfo("https://www.youtube.com/@someone")?.isPost).toBe(
      false,
    );
  });

  it("is case-insensitive on the host", () => {
    expect(getSocialUrlInfo("https://X.COM/bcherny")?.platform).toBe("twitter");
  });

  it("returns null for unrelated and malformed URLs", () => {
    expect(getSocialUrlInfo("https://example.com/x.com/status/1")).toBeNull();
    expect(getSocialUrlInfo("not a url")).toBeNull();
  });
});

describe("parseSocialAuthor", () => {
  it("splits the 'Name (@handle) on X' og:title shape", () => {
    expect(parseSocialAuthor("Boris Cherny (@bcherny) on X")).toEqual({
      name: "Boris Cherny",
      handle: "@bcherny",
    });
  });

  it("handles the profile shape with no trailing ' on X'", () => {
    expect(parseSocialAuthor("Boris Cherny (@bcherny)")).toEqual({
      name: "Boris Cherny",
      handle: "@bcherny",
    });
  });

  it("keeps the whole title as the name when there's no handle", () => {
    expect(parseSocialAuthor("Some Video Title")).toEqual({
      name: "Some Video Title",
      handle: null,
    });
  });

  it("trims surrounding whitespace off the name", () => {
    expect(parseSocialAuthor("  Boris Cherny  (@bcherny) on X")?.name).toBe(
      "Boris Cherny",
    );
  });

  it("returns null for a missing or empty title", () => {
    expect(parseSocialAuthor(null)).toBeNull();
    expect(parseSocialAuthor(undefined)).toBeNull();
    expect(parseSocialAuthor("")).toBeNull();
  });
});
