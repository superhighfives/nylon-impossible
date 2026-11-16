// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.join(import.meta.dirname, "../../styles.css"),
  "utf8",
);

// A utility's body, from `@utility name {` to its closing brace.
function utility(name: string): string {
  const start = css.indexOf(`@utility ${name} {`);
  expect(start, name).toBeGreaterThan(-1);
  const end = css.indexOf("\n}\n", start);
  return css.slice(start, end);
}

describe("the board's hatch", () => {
  // A repeating gradient's period never lands on the pixel grid, so its lines
  // band (#684). A whole-pixel tile draws the same every time.
  it("repeats a whole-pixel tile rather than a repeating gradient", () => {
    const hatch = utility("n-board-hatch");
    expect(hatch).not.toContain("repeating-linear-gradient");
    expect(hatch).toContain(
      "background-size: var(--n-board-hatch-tile) var(--n-board-hatch-tile);",
    );
  });

  it("draws its lines in hairline at the hatch's opacity", () => {
    const hatch = utility("n-board-hatch");
    expect(hatch).toContain("var(--n-color-hairline)");
    expect(hatch).toContain("var(--n-board-hatch-opacity)");
  });
});
