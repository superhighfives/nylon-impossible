import { normalizeLink } from "@nylon-impossible/shared";
import { describe, expect, it } from "vitest";

describe("normalizeLink", () => {
  it.each([
    ["visitlisboa.com", "https://visitlisboa.com/"],
    ["  visitlisboa.com/en  ", "https://visitlisboa.com/en"],
    ["http://example.com", "http://example.com/"],
    ["HTTPS://Example.COM/Path", "https://example.com/Path"],
    ["a.b", "https://a.b/"],
    ["localhost", "https://localhost/"],
    ["localhost:3000/x", "https://localhost:3000/x"],
    ["example.com:8080", "https://example.com:8080/"],
    ["https://例え.jp", "https://xn--r8jz45g.jp/"],
  ])("%j → %s", (raw, href) => {
    expect(normalizeLink(raw)).toBe(href);
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["hello", "no dot in the host"],
    ["http://x", "no dot in the host, with a scheme"],
    ["example.com.", "a trailing dot"],
    [".example.com", "a leading dot"],
    ["not a link", "spaces"],
    ["javascript:alert(1)", "a script"],
    ["ftp://example.com", "not the web"],
    ["mailto:hi@example.com", "an address"],
    ["https://user:pass@example.com", "credentials"],
    ["https://google.com@evil.example", "a disguised host"],
  ])("rejects %j (%s)", (raw) => {
    expect(normalizeLink(raw)).toBeNull();
  });
});
