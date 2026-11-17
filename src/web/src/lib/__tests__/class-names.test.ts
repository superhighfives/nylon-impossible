// @vitest-environment node
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the samples are source text with ${…} in it
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Tailwind finds classes by scanning the source for whole words, so a class
 * written against a `${…}` (`whitespace-pre-wrap${gap}`) is never compiled
 * unless another file happens to use it. That's how fenced code in notes
 * lost its wrapping and ran out of the sheet (#702).
 */
function gluedClasses(source: string): string[] {
  const found: string[] = [];
  for (const template of source.matchAll(/className=\{`([^`]*)`\}/g)) {
    for (const glued of template[1].matchAll(
      /[^\s{}]+\$\{[^}]*\}|\$\{[^}]*\}[^\s$`]+/g,
    )) {
      found.push(glued[0]);
    }
  }
  return found;
}

describe("className templates", () => {
  it("finds a class written against an expression", () => {
    expect(gluedClasses("<p className={`m-0${gap}`} />")).toEqual([
      "m-0${gap}",
    ]);
    expect(gluedClasses("<p className={`${tone}px-2 m-0`} />")).toEqual([
      "${tone}px-2",
    ]);
    expect(gluedClasses("<p className={`m-0 ${gap} px-2`} />")).toEqual([]);
  });

  it("keeps every class a whole word, so Tailwind compiles it", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(root, { recursive: true })) {
      const path = String(file);
      if (!/\.tsx?$/.test(path) || path.includes("__tests__")) continue;
      for (const glued of gluedClasses(readFileSync(`${root}/${path}`, "utf8")))
        offenders.push(`${path}: ${glued}`);
    }
    expect(offenders).toEqual([]);
  });
});
