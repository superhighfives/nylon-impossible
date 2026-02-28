import { describe, expect, it } from "vitest";
import { shouldUseAI } from "../../src/lib/smart-input";

describe("shouldUseAI", () => {
  describe("returns false for simple single-item input", () => {
    it("short task without dates", () => {
      expect(shouldUseAI("Buy milk")).toBe(false);
    });

    it("slightly longer single task", () => {
      expect(shouldUseAI("Call the dentist about appointment")).toBe(false);
    });

    it("empty-ish input", () => {
      expect(shouldUseAI("hello")).toBe(false);
    });
  });

  describe("returns true for newlines", () => {
    it("multi-line text", () => {
      expect(shouldUseAI("Buy milk\nEmail team")).toBe(true);
    });
  });

  describe("returns true for list patterns", () => {
    it("numbered list with dots", () => {
      expect(shouldUseAI("1. Buy milk 2. Email team")).toBe(true);
    });

    it("numbered list with parens", () => {
      expect(shouldUseAI("1) Buy milk")).toBe(true);
    });

    it("bulleted list with dashes", () => {
      expect(shouldUseAI("- Buy milk")).toBe(true);
    });

    it("bulleted list with asterisks", () => {
      expect(shouldUseAI("* Buy milk")).toBe(true);
    });
  });

  describe("returns true for long text", () => {
    it("text longer than 120 characters", () => {
      const longText = "a".repeat(121);
      expect(shouldUseAI(longText)).toBe(true);
    });

    it("text exactly 120 characters is not triggered", () => {
      const text = "a".repeat(120);
      expect(shouldUseAI(text)).toBe(false);
    });
  });

  describe("returns true for relative date patterns", () => {
    it("tomorrow", () => {
      expect(shouldUseAI("Buy milk tomorrow")).toBe(true);
    });

    it("today", () => {
      expect(shouldUseAI("Finish report today")).toBe(true);
    });

    it("next week", () => {
      expect(shouldUseAI("Book flights next week")).toBe(true);
    });

    it("next Friday", () => {
      expect(shouldUseAI("Submit report next friday")).toBe(true);
    });

    it("by Friday", () => {
      expect(shouldUseAI("Finish report by friday")).toBe(true);
    });

    it("due tomorrow", () => {
      expect(shouldUseAI("Report due tomorrow")).toBe(true);
    });

    it("in 3 days", () => {
      expect(shouldUseAI("Call back in 3 days")).toBe(true);
    });

    it("this weekend", () => {
      expect(shouldUseAI("Clean house this weekend")).toBe(true);
    });
  });

  describe("returns true for 'and' clauses", () => {
    it("comma and joining actions", () => {
      expect(shouldUseAI("Buy milk, and email the team")).toBe(true);
    });

    it("plain and joining actions", () => {
      expect(shouldUseAI("Buy milk and email the team")).toBe(true);
    });
  });

  describe("returns true for comma-separated items", () => {
    it("comma followed by lowercase", () => {
      expect(shouldUseAI("Buy milk, email team")).toBe(true);
    });
  });
});
