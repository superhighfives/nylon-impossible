// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadTokens,
  OUTPUTS,
  renderAll,
  renderCss,
  renderSwift,
  staleOutputs,
} from "../../../../shared/design/generate.mjs";

const WEB_SRC = join(import.meta.dirname, "../..");

/** WCAG 2 contrast ratio between two `#RRGGBB` colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every source file under src/web/src, bar tests and tokens.css itself. */
function webSources(): string[] {
  return readdirSync(WEB_SRC, { recursive: true, encoding: "utf8" })
    .filter((path) => /\.(css|tsx?)$/.test(path))
    .filter((path) => !path.split(sep).includes("__tests__"))
    .map((path) => join(WEB_SRC, path))
    .filter((path) => path !== OUTPUTS.css);
}

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
    expect(css).toContain("--n-board-column-max-width: 30rem;");
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

  it("fills the error toast with red-11's light value in every appearance, and both toasts' text passes 4.5:1", () => {
    type Colour = {
      light: string;
      dark: string;
      highContrast?: { light: string; dark: string };
    };
    const colour = (name: string) =>
      (tokens.color as unknown as Record<string, Colour>)[name];
    const solid = colour("destructiveSolid");
    expect(solid.light).toBe("#CE2C31");
    expect(solid.dark).toBe("#CE2C31");
    expect(solid.highContrast).toEqual({ light: "#A11C21", dark: "#A11C21" });
    // Every other red keeps red-11's dark value in dark appearance.
    expect(colour("destructive")).toMatchObject({
      light: "#CE2C31",
      dark: "#FF9592",
      highContrast: { light: "#A11C21", dark: "#FFB8B5" },
    });
    /** The four appearances: light, dark and both with Increase Contrast. */
    const appearances = (c: Colour) => [
      c.light,
      c.dark,
      c.highContrast?.light ?? c.light,
      c.highContrast?.dark ?? c.dark,
    ];
    for (const [ink, fill] of [
      ["brandInk", "brand"],
      ["destructiveSolidInk", "destructiveSolid"],
    ]) {
      const inks = appearances(colour(ink));
      appearances(colour(fill)).forEach((background, i) => {
        expect(
          contrast(inks[i], background),
          `${ink} on ${fill}, appearance ${i}`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  it("draws the web's focus ring in ink, 3:1 against the canvas, surface and fill under it in every appearance (#773)", () => {
    type Colour = {
      light: string;
      dark: string;
      highContrast?: { light: string; dark: string };
    };
    const colour = (name: string) =>
      (tokens.color as unknown as Record<string, Colour>)[name];
    const appearances = (c: Colour) => [
      c.light,
      c.dark,
      c.highContrast?.light ?? c.light,
      c.highContrast?.dark ?? c.dark,
    ];
    const ring = appearances(colour("ink"));
    for (const under of ["canvas", "surface", "fill"]) {
      appearances(colour(under)).forEach((background, i) => {
        expect(
          contrast(ring[i], background),
          `ink ring on ${under}, appearance ${i}`,
        ).toBeGreaterThanOrEqual(3);
      });
    }
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

  it("every generated CSS variable is read by the web", () => {
    const declared = new Set(
      [...renderCss(tokens).matchAll(/^\s*(--n-[a-z0-9-]+):/gm)].map(
        ([, name]) => name,
      ),
    );
    expect(declared.size).toBeGreaterThan(0);
    const sources = webSources().map((path) => readFileSync(path, "utf8"));
    // The literal name covers var(--n-x) and Tailwind's -(--n-x) shorthand.
    const unread = [...declared].filter(
      (name) => !sources.some((source) => source.includes(name)),
    );
    expect(
      unread,
      "tokens.css defines variables nothing under src/web/src reads; drop them from the generator",
    ).toEqual([]);
  });

  it("emits no space for the web, and no space unit or s0 for Apple", () => {
    const css = renderCss(tokens);
    expect(css).not.toContain("--n-space-");
    expect(css).not.toContain("--n-row-min-height");
    const swift = renderSwift(tokens);
    expect(swift).not.toContain("static let unit");
    expect(swift).not.toContain("static let s0");
    expect(swift).toContain("static let s1: CGFloat = 4");
    expect(swift).toContain("static let rowMinHeight: CGFloat = 44");
  });

  it("sizes code in the notes at type.codeScale on both platforms", () => {
    expect(tokens.type.codeScale).toBe(0.85);
    expect(renderSwift(tokens)).toContain(
      "static let codeScale: CGFloat = 0.85",
    );
    expect(renderCss(tokens)).toContain("--n-type-code-scale: 0.85;");
    const styles = readFileSync(join(WEB_SRC, "styles.css"), "utf8");
    const utility = styles.match(/@utility n-code \{([^}]*)\}/)?.[1];
    expect(utility).toContain(
      "font-size: calc(var(--n-type-code-scale) * 1em);",
    );
  });

  describe("type", () => {
    const css = renderCss(tokens);
    const swift = renderSwift(tokens);
    type Style = {
      font: string;
      size: number;
      lineHeight: number;
      weight: number;
      tracking?: number;
      iosTextStyle?: string;
    };
    const groups = Object.entries(tokens.type).filter(
      ([, styles]) => typeof styles === "object",
    ) as [string, Record<string, Style>][];

    // One Tailwind utility per role carries all four values, so
    // `text-n-wide-row-title` is the whole of a row title's type.
    it("emits each role as a Tailwind text utility with its line height, weight and tracking", () => {
      const theme = css.slice(css.indexOf("@theme {"));
      expect(theme.length).toBeLessThan(css.length);
      expect(theme).toContain("--text-n-wide-row-title: 0.9375rem;");
      expect(theme).toContain(
        "--text-n-wide-row-title--line-height: 1.3125rem;",
      );
      expect(theme).toContain("--text-n-wide-row-title--font-weight: 500;");
      expect(theme).toContain(
        "--text-n-wide-row-title--letter-spacing: -0.005em;",
      );
      expect(theme).toContain("--text-n-phone-body: 1.0625rem;");
      expect(theme).toContain("--text-n-phone-body--line-height: 1.375rem;");
      expect(theme).toContain("--text-n-phone-body--letter-spacing: 0em;");
      expect(theme).toContain("--text-n-landing-hero: 3rem;");
    });

    // Both apps were built to these; tokens.json takes what they render
    // (Decisions, 2026-11-19), so nothing moves on any platform.
    it("holds the row titles, masthead, column title and detail title both apps draw", () => {
      const { phone, wide } = tokens.type as Record<
        string,
        Record<string, Style>
      >;
      const box = (s: Style) => [s.size, s.lineHeight, s.weight];
      expect(box(wide.rowTitle)).toEqual([15, 21, 500]);
      expect(box(phone.rowTitle)).toEqual([17, 23, 500]);
      expect(box(phone.display)).toEqual([46, 46, 700]);
      expect(box(wide.display)).toEqual([40, 40, 700]);
      expect(box(phone.sheetTitle)).toEqual([32, 35, 700]);
    });

    it("gives every role whole-pixel values, a known font and a 100–900 weight", () => {
      for (const [group, styles] of groups) {
        for (const [role, s] of Object.entries(styles)) {
          if (role.startsWith("$")) continue;
          const name = `${group}.${role}`;
          expect(Number.isInteger(s.size), name).toBe(true);
          expect(Number.isInteger(s.lineHeight), name).toBe(true);
          expect(s.lineHeight, name).toBeGreaterThanOrEqual(s.size);
          expect(Object.keys(tokens.font), name).toContain(s.font);
          expect([100, 200, 300, 400, 500, 600, 700, 800, 900], name).toContain(
            s.weight,
          );
        }
      }
    });

    // Apple draws the roles with a text style; the rest are the web's own.
    it("gives Apple the roles with an iosTextStyle, tracking included", () => {
      expect(swift).toContain(
        "static let rowTitle = Style(size: 15, lineHeight: 21, weight: .medium, variationWeight: 500, isDisplay: false, textStyle: .subheadline, tracking: -0.005)",
      );
      expect(swift).toContain("let tracking: CGFloat");
      expect(swift).not.toContain("enum Landing");
      expect(swift).not.toMatch(/static let pageTitle = Style/);
    });
  });

  it("builds the same theme for macOS from AppKit types", () => {
    const swift = renderSwift(tokens);
    expect(swift).toContain("#if os(macOS)");
    expect(swift).toContain("typealias PlatformFont = NSFont");
    expect(swift).toContain("NSColor(name: nil) { appearance in");
  });
});
