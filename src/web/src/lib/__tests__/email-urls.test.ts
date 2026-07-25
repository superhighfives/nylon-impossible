import { describe, expect, it } from "vitest";
import { getEmailUrlInfo } from "../email-urls";

describe("getEmailUrlInfo", () => {
  it("detects a Gmail thread permalink", () => {
    const info = getEmailUrlInfo(
      "https://mail.google.com/mail/u/0/#all/thread-xyz",
    );
    expect(info).toEqual({ provider: "gmail", hostname: "mail.google.com" });
  });

  it("is case-insensitive on the host", () => {
    expect(getEmailUrlInfo("https://MAIL.GOOGLE.COM/mail/u/0/#inbox")).toEqual({
      provider: "gmail",
      hostname: "mail.google.com",
    });
  });

  it("returns null for non-email Google URLs", () => {
    expect(getEmailUrlInfo("https://www.google.com/search?q=hi")).toBeNull();
    expect(getEmailUrlInfo("https://calendar.google.com/")).toBeNull();
  });

  it("returns null for unrelated and malformed URLs", () => {
    expect(getEmailUrlInfo("https://example.com")).toBeNull();
    expect(getEmailUrlInfo("not a url")).toBeNull();
  });
});
