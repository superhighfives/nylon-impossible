// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  loadTokens,
  OUTPUTS,
  renderAll,
  renderCss,
  renderSwift,
  staleOutputs,
} from "../../../../shared/design/generate.mjs";

describe("design token generator", () => {
  const tokens = loadTokens();

  it("committed tokens.css and Theme.swift match tokens.json", () => {
    expect(staleOutputs()).toEqual([]);
  });

  it("flags both outputs as stale when a token changes", () => {
    const changed = structuredClone(tokens);
    changed.color.brand.light = "#000000";
    expect(staleOutputs(renderAll(changed)).sort()).toEqual(
      [OUTPUTS.css, OUTPUTS.swift].sort(),
    );
  });

  it("marks both files as generated", () => {
    expect(renderCss(tokens)).toMatch(/do not edit/);
    expect(renderSwift(tokens)).toMatch(/do not edit/);
  });

  it("puts dark values under the class-based dark variant", () => {
    const css = renderCss(tokens);
    const dark = css.slice(css.indexOf(".dark {"));
    expect(dark).toContain("--n-color-canvas: #111111;");
    // Brand is identical in both modes, so it isn't repeated under .dark.
    expect(dark).not.toContain("--n-color-brand:");
  });

  it("maps every highContrast colour to prefers-contrast: more, light and dark", () => {
    const css = renderCss(tokens);
    const media = css.slice(css.indexOf("@media (prefers-contrast: more) {"));
    expect(media.length).toBeLessThan(css.length);
    const dark = media.slice(media.indexOf(".dark {"));
    const light = media.slice(0, media.indexOf(".dark {"));
    type HighContrast = { highContrast?: { light: string; dark: string } };
    const high = (
      Object.entries(tokens.color) as [string, HighContrast][]
    ).flatMap(([name, c]) =>
      !name.startsWith("$") && c.highContrast
        ? [[name, c.highContrast] as const]
        : [],
    );
    expect(high.map(([name]) => name)).toContain("hairline");
    for (const [name, c] of high) {
      const prop = `--n-color-${name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
      expect(light, name).toContain(`${prop}: ${c.light.toLowerCase()};`);
      expect(dark, name).toContain(`${prop}: ${c.dark.toLowerCase()};`);
    }
    // After the base rules, so it wins in both modes.
    expect(css.indexOf("@media (prefers-contrast: more)")).toBeGreaterThan(
      css.indexOf(".dark {"),
    );
  });

  it("emits the spec's motion and radius values", () => {
    const css = renderCss(tokens);
    expect(css).toContain("--n-duration-fast: 150ms;");
    expect(css).toContain("--n-duration-base: 220ms;");
    expect(css).toContain("--n-duration-slow: 320ms;");
    expect(css).toContain(
      "--n-ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);",
    );
    expect(css).toContain("--n-radius-chip: 0.375rem;");
    expect(css).toContain("--n-radius-field: 0.625rem;");
  });

  it("emits the board's column widths and hatch, for the web only", () => {
    const css = renderCss(tokens);
    expect(css).toContain("--n-board-column-min-width: 17rem;");
    expect(css).toContain("--n-board-column-max-width: 26rem;");
    expect(css).toContain("--n-board-hatch-spacing: 0.75rem;");
    expect(css).toContain("--n-board-hatch-angle: 45deg;");
    expect(css).toContain("--n-board-hatch-width: 0.0625rem;");
    expect(css).toContain("--n-board-hatch-opacity: 0.4;");
    // 12 × √2 ≈ 17px: a whole pixel, so the tile draws the same every time.
    expect(css).toContain("--n-board-hatch-tile: 1.0625rem;");
    // The web board is the only board (#689): Apple gets no Board or Sheet.
    const swift = renderSwift(tokens);
    expect(swift).not.toContain("enum Board");
    expect(swift).not.toContain("enum Sheet");
  });

  it("emits a drag's tilt and lift, web and Apple", () => {
    const css = renderCss(tokens);
    expect(css).toContain("--n-tilt-max: 1.5deg;");
    expect(css).toContain("--n-tilt-overshoot: 1.33;");
    expect(css).toContain("--n-settle-overshoot: 0.4deg;");
    expect(css).toContain("--n-settle-min-tilt: 0.25deg;");
    expect(css).toContain("--n-lift: 1.02;");
    const swift = renderSwift(tokens);
    expect(swift).toContain("static let tiltMax: Double = 1.5");
    expect(swift).toContain("static let tiltOvershoot: Double = 1.33");
    expect(swift).toContain("static let settleOvershoot: Double = 0.4");
    expect(swift).toContain("static let settleMinTilt: Double = 0.25");
    expect(swift).toContain("static let lift: CGFloat = 1.02");
  });

  it("gives a colour its own alpha per appearance: brandSoft is 22%, 16% in dark", () => {
    const css = renderCss(tokens);
    const dark = css.slice(css.indexOf(".dark {"));
    // 0.22 × 255 ≈ 0x38; 0.16 × 255 ≈ 0x29.
    expect(css.slice(0, css.indexOf(".dark {"))).toContain(
      "--n-color-brand-soft: #ffe62938;",
    );
    expect(dark).toContain("--n-color-brand-soft: #ffe62929;");
    const swift = renderSwift(tokens);
    expect(swift).toContain(
      "static let brandSoft = dynamic(light: 0xFFE629, dark: 0xFFE629, lightAlpha: 0.22, darkAlpha: 0.16)",
    );
    // One alpha for both stays an opacity.
    expect(swift).toContain(".opacity(0.08)");
  });

  it("refuses a hatch angle the web's tile can't draw", () => {
    for (const angle of [30, 90, -45]) {
      const changed = structuredClone(tokens);
      changed.board.hatch.angle = angle;
      expect(() => renderCss(changed), String(angle)).toThrow(
        /board\.hatch\.angle/,
      );
    }
    const turned = structuredClone(tokens);
    turned.board.hatch.angle = 135;
    expect(renderCss(turned)).toContain("--n-board-hatch-angle: 135deg;");
  });

  it("gives every icon both a lucide and an SF Symbol name", () => {
    for (const [name, icon] of Object.entries(tokens.icons)) {
      if (name.startsWith("$")) continue;
      const { lucide, sfSymbol } = icon as { lucide: string; sfSymbol: string };
      expect(lucide, name).toMatch(/^[A-Z][A-Za-z0-9]*$/);
      expect(sfSymbol, name).toMatch(/^[a-z0-9.]+$/);
    }
  });

  it("scales iOS fonts through UIFontMetrics with a system fallback", () => {
    const swift = renderSwift(tokens);
    expect(swift).toContain("UIFontMetrics(forTextStyle: textStyle)");
    expect(swift).toContain(
      "PlatformFont.systemFont(ofSize: size, weight: weight)",
    );
    expect(swift).toContain("typealias PlatformFont = UIFont");
    expect(swift).toContain("UIColor { traits in");
  });

  it("builds the same theme for macOS from AppKit types", () => {
    const swift = renderSwift(tokens);
    expect(swift).toContain("#if os(macOS)");
    expect(swift).toContain("typealias PlatformFont = NSFont");
    expect(swift).toContain("NSColor(name: nil) { appearance in");
  });
});
