// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  checkCase,
  checkString,
  extractGmail,
  extractJsx,
  extractStringCatalog,
  extractSwift,
  loadVocabulary,
  parseVocabulary,
} from "../../../../shared/copy/lint.mjs";

const vocabulary = loadVocabulary();
const rules = (text: string) =>
  checkString(text, vocabulary).map((p) => p.rule);

describe("copy lint", () => {
  it("reads the Not column from PRINCIPLES.md", () => {
    const terms = vocabulary.map((v) => v.term);
    expect(terms).toEqual(
      expect.arrayContaining(["task", "This Week", "Completed", "Sticky"]),
    );
    expect(vocabulary.find((v) => v.term === "task")?.use).toBe("todo");
  });

  it("follows the table, not a copy of it", () => {
    const markdown = [
      "## Vocabulary",
      "",
      "| Concept | Word | Not |",
      "| --- | --- | --- |",
      "| The item | todo | chore, errand |",
      "",
      "## Copy",
    ].join("\n");
    expect(parseVocabulary(markdown)).toEqual([
      { term: "chore", use: "todo" },
      { term: "errand", use: "todo" },
    ]);
  });

  it("flags vocabulary from the Not column", () => {
    expect(rules("Add task")).toEqual(["vocabulary"]);
    expect(rules("3 tasks left")).toEqual(["vocabulary"]);
    expect(rules("Completed")).toEqual(["vocabulary"]);
    expect(rules("Set a deadline")).toEqual(["vocabulary"]);
    expect(rules("Add subtask")).toEqual([]);
    expect(rules("Moved to This week")).toEqual([]);
  });

  it("matches mixed-case terms as written", () => {
    expect(rules("Moved to This Week")).toContain("vocabulary");
    expect(rules("Copy URL")).toEqual([]);
  });

  it("flags capitals that aren't proper nouns", () => {
    expect(checkCase("Keyboard Shortcuts")).toEqual(["Shortcuts"]);
    expect(checkCase("Keyboard shortcuts")).toEqual([]);
    expect(checkCase("New List")).toEqual(["List"]);
  });

  it("lets proper nouns, acronyms and new sentences keep capitals", () => {
    expect(checkCase("Add to Nylon")).toEqual([]);
    expect(checkCase("Nothing today. 4 waiting in This week")).toEqual([]);
    expect(checkCase("Copy API URL from GitHub")).toEqual([]);
    expect(checkCase("Enter adds · Esc closes")).toEqual([]);
    expect(checkCase("Tap “I’ve connected” to refresh")).toEqual([]);
    expect(checkCase("Try “Call Sam tomorrow”")).toEqual([]);
  });

  it("reads JSX text and labels from the web app", () => {
    const found = extractJsx(
      [
        "export const A = () => (",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: source under test
        '  <button aria-label="Mark Done" title={`Open ${name}`}>',
        "    Keyboard Shortcuts",
        "    <span className={x}>{count}</span>",
        "  </button>",
        ");",
      ].join("\n"),
    );
    expect(found.map((f) => [f.text, f.line])).toEqual([
      ["Mark Done", 2],
      ["Open ⁠", 2],
      ["Keyboard Shortcuts", 3],
    ]);
  });

  it("reads Swift literals, interpolations included", () => {
    const found = extractSwift(
      [
        'Text("Keyboard Shortcuts")',
        '  .navigationTitle("New List")',
        'Label("List, \\(list?.name ?? "None")", systemImage: "list")',
        'Text(verbatim: "Raw")',
        'Image(systemName: "Star")',
      ].join("\n"),
    );
    expect(found.map((f) => [f.text, f.line])).toEqual([
      ["Keyboard Shortcuts", 1],
      ["New List", 2],
      ["List, ⁠", 3],
    ]);
  });

  it("reads string catalog keys", () => {
    const catalog = JSON.stringify(
      { sourceLanguage: "en", strings: { "Mark Done": {}, "%lld todos": {} } },
      null,
      2,
    );
    expect(extractStringCatalog(catalog)).toEqual([
      { text: "Mark Done", line: 4 },
      { text: "⁠ todos", line: 5 },
    ]);
  });

  it("reads Gmail card fields, both sides of a ternary", () => {
    const found = extractGmail(
      [
        "const card = {",
        '  header: { title: "Add To Nylon" },',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: source under test
        '  text: done ? `<s>${title}</s>` : "Nothing Yet",',
        '  url: "https://example.com/Path",',
        "};",
      ].join("\n"),
    );
    expect(found.map((f) => f.text)).toEqual(["Add To Nylon", "Nothing Yet"]);
  });
});
