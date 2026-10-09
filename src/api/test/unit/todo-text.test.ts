import {
  splitTodoText,
  TODO_NOTES_MAX,
  TODO_TITLE_MAX,
} from "@nylon-impossible/shared";
import { describe, expect, it } from "vitest";

describe("splitTodoText", () => {
  it("passes short single-line text through", () => {
    expect(splitTodoText("  Buy milk  ")).toEqual({
      title: "Buy milk",
      notes: null,
    });
  });

  it("keeps text at exactly the title limit as the title", () => {
    const text = "a".repeat(TODO_TITLE_MAX);
    expect(splitTodoText(text)).toEqual({ title: text, notes: null });
  });

  it("moves text one over the limit into notes", () => {
    const text = "a".repeat(TODO_TITLE_MAX + 1);
    const { title, notes } = splitTodoText(text);
    expect(Array.from(title).length).toBeLessThanOrEqual(120);
    expect(title.endsWith("…")).toBe(true);
    expect(notes).toBe(text);
  });

  it("clips at a word boundary", () => {
    const text = `${"lorem ipsum ".repeat(60)}end`;
    const { title } = splitTodoText(text);
    expect(title).toMatch(/(lorem|ipsum)…$/);
  });

  it("splits multi-line text into title and notes", () => {
    expect(splitTodoText("Title\n\nBody line\nMore")).toEqual({
      title: "Title",
      notes: "Body line\nMore",
    });
  });

  it("does not split an emoji surrogate pair at the cut", () => {
    const text = "😀".repeat(TODO_TITLE_MAX + 10);
    const { title } = splitTodoText(text);
    expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("titles a long bare URL with its hostname", () => {
    const url = `https://example.cloudflareaccess.com/login?meta=${"x".repeat(2000)}`;
    expect(splitTodoText(url)).toEqual({
      title: "example.cloudflareaccess.com",
      notes: url,
    });
  });

  it("caps notes at the notes limit", () => {
    const { notes } = splitTodoText("a".repeat(TODO_NOTES_MAX + 50));
    expect(notes?.length).toBe(TODO_NOTES_MAX);
  });
});
