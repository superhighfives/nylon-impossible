// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

const WEB_SRC = join(import.meta.dirname, "../..");
const SELF = join(import.meta.dirname, "type-tokens.test.ts");

/**
 * Type set by hand rather than by a `text-n-*` role from tokens.json
 * (PRINCIPLES.md Visual): an arbitrary size, Tailwind's own size scale, or a
 * line height or tracking class beside a role, which its role already sets.
 */
const HARD_CODED = [
  /(?<![\w-])text-\[[^\]]*\]/g,
  /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g,
  /(?<![\w-])leading-[\w[(-]+/g,
  /(?<![\w-])tracking-[\w[(-]+/g,
];

/** Every .ts, .tsx and .css file under src/web/src, tests included. */
function sources(): string[] {
  return readdirSync(WEB_SRC, { recursive: true, encoding: "utf8" })
    .filter((path) => /\.(css|tsx?)$/.test(path))
    .map((path) => join(WEB_SRC, path))
    .filter((path) => path !== SELF);
}

it("sets type on the web only through the text-n-* roles from tokens.json", () => {
  const found: string[] = [];
  for (const path of sources()) {
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const pattern of HARD_CODED) {
        for (const [match] of line.matchAll(pattern)) {
          found.push(`${relative(WEB_SRC, path)}:${i + 1} ${match}`);
        }
      }
    });
  }
  expect(
    found,
    "use a text-n-<density>-<role> class (add the role to tokens.json's type if none fits)",
  ).toEqual([]);
});

it("catches each kind of hard-coded type", () => {
  const caught = (cls: string) =>
    HARD_CODED.some((pattern) => cls.match(pattern) !== null);
  for (const cls of [
    "text-[0.9375rem]",
    "sm:text-[4.5rem]",
    "text-xs",
    "text-base",
    "text-2xl",
    "leading-[1.4]",
    "leading-none",
    "leading-7",
    "tracking-[-0.01em]",
    "tracking-tight",
  ]) {
    expect(caught(`"${cls} text-n-ink"`), cls).toBe(true);
  }
  for (const cls of [
    "text-n-wide-row-title",
    "text-n-ink-muted",
    "text-left",
    "text-inherit",
    "font-semibold",
  ]) {
    expect(caught(`"${cls}"`), cls).toBe(false);
  }
});
