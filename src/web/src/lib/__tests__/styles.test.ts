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
    // The tile is the second layer; the first is the cover (below).
    expect(hatch).toMatch(
      /background-size:\s*100% 100%,\s*var\(--n-board-hatch-tile\) var\(--n-board-hatch-tile\);/,
    );
  });

  // The row's own hatch shows a trackpad's bounce past Done, but the bounce
  // before Today stays plain: its left half is covered with canvas. The
  // hatch resets the cover, so the end before Done doesn't inherit it.
  it("covers the board row's left half, and nothing else's", () => {
    expect(utility("n-board-hatch")).toContain("--n-board-hatch-cover: none;");
    const overscroll = utility("n-board-overscroll");
    expect(overscroll).toContain("@apply n-board-hatch;");
    expect(overscroll).toMatch(
      /--n-board-hatch-cover: linear-gradient\(\s*to right,\s*var\(--n-color-canvas\) 50%,\s*transparent 50%\s*\)/,
    );
  });

  it("draws its lines in hairline at the hatch's opacity", () => {
    const hatch = utility("n-board-hatch");
    expect(hatch).toContain("var(--n-color-hairline)");
    expect(hatch).toContain("var(--n-board-hatch-opacity)");
  });
});
