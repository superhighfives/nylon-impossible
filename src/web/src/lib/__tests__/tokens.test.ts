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
