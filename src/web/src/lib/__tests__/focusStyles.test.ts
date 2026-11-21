// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(import.meta.dirname, "../../styles.css"), "utf8");

/** The body of `@utility <name> { … }`, braces balanced. */
function utility(name: string): string {
  const start = css.indexOf(`@utility ${name} {`);
  expect(start, name).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`${name} isn't closed`);
}

// #773: one calm look for focus. The computed styles in a browser are the
// smoke suite's (e2e/focus.spec.ts); this pins the source.
describe("the web's focus utilities", () => {
  const looks = ["n-focus", "n-focus-within"].map(utility);

  it("draw no yellow and no second line", () => {
    for (const look of [...looks, utility("n-focus-inset")]) {
      expect(look).not.toContain("--n-color-brand");
      expect(look).not.toMatch(/box-shadow/);
    }
  });

  it("draw the soft 20% tint and one 2px ink ring", () => {
    for (const look of looks) {
      expect(look).toMatch(/ 20%, transparent\)/);
      expect(look).toContain("background-image");
      expect(look).toContain("outline: 2px solid var(--n-color-ink);");
      expect(look.match(/outline: 2px/g)).toHaveLength(1);
    }
  });

  it("ring a text field only when focus arrived from the keyboard", () => {
    const [focus, within] = looks;
    // A text field matches :focus-visible on a click, so its ring is keyed
    // to useFocusModality's attribute instead.
    expect(focus).toContain(
      ":where([data-key-focus]) &:is(textarea, select, input):focus",
    );
    expect(within).toContain(":where([data-key-focus]) &:has(textarea:focus");
    expect(within).not.toContain(":focus-visible");
  });

  it("keep n-focus-inset to n-focus, with the ring inside the element", () => {
    const [focus] = looks;
    const inset = utility("n-focus-inset");
    expect(inset.replace("n-focus-inset", "n-focus")).toBe(
      focus.replace("outline-offset: 2px", "outline-offset: -2px"),
    );
  });
});
