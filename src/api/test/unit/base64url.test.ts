import { describe, expect, it } from "vitest";
import { encodeCursor } from "../../src/handlers/v1";
import { base64url } from "../../src/lib/base64url";

describe("base64url", () => {
  it("encodes known vectors", () => {
    expect(base64url(new Uint8Array([]))).toBe("");
    // Standard base64 is "+/8=": covers both swaps and the padding.
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
    expect(base64url(new TextEncoder().encode("hello"))).toBe("aGVsbG8");
  });

  it("turns 32 random bytes into 43 url-safe characters", () => {
    const encoded = base64url(crypto.getRandomValues(new Uint8Array(32)));
    expect(encoded).toHaveLength(43);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("handles input too long to spread into String.fromCharCode", () => {
    const bytes = new Uint8Array(200_000).fill(0xff);
    expect(base64url(bytes)).toMatch(/^_+8$/);
  });
});

// What encodeCursor did before base64url, so cursors issued then still match.
function oldEncodeCursor(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("encodeCursor", () => {
  it("gives the same cursor as before", () => {
    const value = { o: [true, "a0", "0f8fad5b-d9cb-469f-a165-70867728950e"] };
    expect(encodeCursor(value)).toBe(
      "eyJvIjpbdHJ1ZSwiYTAiLCIwZjhmYWQ1Yi1kOWNiLTQ2OWYtYTE2NS03MDg2NzcyODk1MGUiXX0",
    );
    expect(encodeCursor(value)).toBe(oldEncodeCursor(value));
  });

  it("matches the old encoder for open and done cursors", () => {
    for (let i = 0; i < 50; i++) {
      const id = crypto.randomUUID();
      const open = { o: [i % 2 === 0, `a${i}V~?>`, id] };
      const done = { d: [Date.now() - i * 1000, id] };
      expect(encodeCursor(open)).toBe(oldEncodeCursor(open));
      expect(encodeCursor(done)).toBe(oldEncodeCursor(done));
    }
  });
});
