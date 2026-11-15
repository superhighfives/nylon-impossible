import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "../markdown";

const text = (t: string) => ({ type: "text", text: t });

describe("parseMarkdown", () => {
  it("keeps every newline as a line break, and a blank line as a gap", () => {
    expect(parseMarkdown("one\ntwo\n\n\nthree")).toEqual([
      {
        type: "paragraph",
        children: [text("one"), { type: "br" }, text("two")],
      },
      { type: "paragraph", children: [text("three")], gap: true },
    ]);
  });

  it("reads a lead-in line straight into a list, as the report's notes do", () => {
    const [lead, list] = parseMarkdown(
      "Files touched:\n- src/a_b_c.ts\n- src/d.ts",
    );
    expect(lead).toEqual({
      type: "paragraph",
      children: [text("Files touched:")],
    });
    expect(list).toMatchObject({
      type: "list",
      ordered: false,
      items: [
        { children: [text("src/a_b_c.ts")] },
        { children: [text("src/d.ts")] },
      ],
    });
    expect(list.gap).toBeUndefined();
  });

  it("nests a list one level, and continues an item on an indented line", () => {
    const [list] = parseMarkdown("1. one\n  - inner\n    more\n2. two");
    expect(list).toMatchObject({
      type: "list",
      ordered: true,
      start: 1,
      items: [
        {
          children: [text("one")],
          list: {
            ordered: false,
            items: [
              { children: [text("inner"), { type: "br" }, text("more")] },
            ],
          },
        },
        { children: [text("two")] },
      ],
    });
  });

  it("starts a numbered list at its first number", () => {
    expect(parseMarkdown("3. c\n4. d")[0]).toMatchObject({ start: 3 });
  });

  it("leaves - [ ] as a bullet with the brackets", () => {
    expect(parseMarkdown("- [ ] milk\n- [x] eggs")[0]).toMatchObject({
      items: [
        { children: [text("[ ] milk")] },
        { children: [text("[x] eggs")] },
      ],
    });
  });

  it("draws # to ### as headings, and #### or #tag as text", () => {
    expect(parseMarkdown("# One\n## Two ##\n### Three")).toEqual([
      { type: "heading", level: 1, children: [text("One")] },
      { type: "heading", level: 2, children: [text("Two")] },
      { type: "heading", level: 3, children: [text("Three")] },
    ]);
    expect(parseMarkdown("#### Four")[0].type).toBe("paragraph");
    expect(parseMarkdown("#tag")[0].type).toBe("paragraph");
  });

  it("keeps a fenced block's text exactly, markup and all", () => {
    expect(parseMarkdown("```ts\nconst a = **b**;\n  <i>\n```\nafter")).toEqual(
      [
        { type: "code", text: "const a = **b**;\n  <i>" },
        { type: "paragraph", children: [text("after")] },
      ],
    );
  });

  it("reads > lines as a quote", () => {
    expect(parseMarkdown("> said\n> **this**")).toEqual([
      {
        type: "quote",
        blocks: [
          {
            type: "paragraph",
            children: [
              text("said"),
              { type: "br" },
              { type: "strong", children: [text("this")] },
            ],
          },
        ],
      },
    ]);
  });
});

describe("parseInline", () => {
  it("reads bold, italic and code", () => {
    expect(parseInline("**b** *i* _j_ `c *d*` ***both***")).toEqual([
      { type: "strong", children: [text("b")] },
      text(" "),
      { type: "em", children: [text("i")] },
      text(" "),
      { type: "em", children: [text("j")] },
      text(" "),
      { type: "code", text: "c *d*" },
      text(" "),
      { type: "strong", children: [{ type: "em", children: [text("both")] }] },
    ]);
  });

  it("leaves underscores and stars inside words and paths alone", () => {
    expect(parseInline("snake_case_name src/*.ts 2 * 3")).toEqual([
      text("snake_case_name src/*.ts 2 * 3"),
    ]);
  });

  it("links [text](url), <url> and bare URLs, less a sentence's full stop", () => {
    expect(
      parseInline(
        "[site](https://example.com) <https://a.dev> see https://b.dev/x_(y). or www.c.dev",
      ),
    ).toEqual([
      {
        type: "link",
        href: "https://example.com/",
        children: [text("site")],
      },
      text(" "),
      {
        type: "link",
        href: "https://a.dev/",
        children: [text("https://a.dev")],
      },
      text(" see "),
      {
        type: "link",
        href: "https://b.dev/x_(y)",
        children: [text("https://b.dev/x_(y)")],
      },
      text(". or "),
      {
        type: "link",
        href: "https://www.c.dev/",
        children: [text("www.c.dev")],
      },
    ]);
  });

  it("leaves unsafe links, images and HTML as the text that was typed", () => {
    const typed =
      '[x](javascript:alert(1)) ![pic](https://a.dev/p.png) <img src=x onerror="alert(1)"> [y](/relative)';
    expect(parseInline(typed)).toEqual([text(typed)]);
  });

  it("honours backslash escapes", () => {
    expect(parseInline("\\*not\\*")).toEqual([text("*not*")]);
  });

  it("stays quick and shallow on a run of markers", () => {
    const started = performance.now();
    parseMarkdown("*".repeat(10_000));
    parseMarkdown("[".repeat(5_000) + "](".repeat(2_500));
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe("safeHref", () => {
  it("allows http, https and mailto only", () => {
    expect(safeHref("https://a.dev")).toBe("https://a.dev/");
    expect(safeHref("mailto:me@a.dev")).toBe("mailto:me@a.dev");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("/relative")).toBeNull();
  });
});
