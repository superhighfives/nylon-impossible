#!/usr/bin/env tsx
/**
 * Accessibility and layout audit for the web app (the redesign's Phase 6
 * quality pass). Runs against a dev server that's already up and seeded —
 * `generate.ts --capture-web` does both, or start `vite dev` yourself after
 * `bun run db:migrate` and the demo seed.
 *
 *   MARKETING_WEB_URL=http://127.0.0.1:3000 npx tsx audit.ts [--out dir]
 *
 * For every screen at phone (390) and wide (1440), light and dark, it runs
 * axe (WCAG 2.1 A/AA) and records the violations. It also measures the
 * things axe can't: row movement when a todo is completed, touch targets
 * under 44px, keyboard focus order and visibility, Escape on overlays,
 * horizontal overflow at 200% zoom and with large text, and that reduced
 * motion leaves only opacity transitions. Results go to `<out>/audit.json`
 * with a screenshot per screen.
 *
 * Environment: VITE_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY and
 * CLERK_MARKETING_USER_EMAIL, as for generate.ts.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import dotenv from "dotenv";
import type { Browser, BrowserContext, Page } from "playwright";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(SCRIPT_DIR, ".dev.vars") });

const BASE = process.env.MARKETING_WEB_URL ?? "http://127.0.0.1:3000";
const outArg = process.argv.indexOf("--out");
const OUT =
  outArg > 0
    ? (process.argv[outArg + 1] as string)
    : join(SCRIPT_DIR, "output", "audit");
const EMAIL = process.env.CLERK_MARKETING_USER_EMAIL as string;
const TZ = "America/Los_Angeles";
const READY = "Review PR for the sync engine";

type Mode = "light" | "dark";
type Layout = "phone" | "wide";

const VIEWPORTS: Record<Layout, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  wide: { width: 1440, height: 900 },
};

interface Violation {
  id: string;
  impact: string | null | undefined;
  help: string;
  nodes: { target: string; summary: string }[];
}

interface ScreenResult {
  screen: string;
  layout: Layout | "signed-out";
  mode: Mode;
  violations: Violation[];
}

const results: ScreenResult[] = [];
const checks: Record<string, unknown> = {};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function axe(
  page: Page,
  screen: string,
  layout: ScreenResult["layout"],
  mode: Mode,
) {
  await sleep(350);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // The TanStack devtools launcher is dev-only.
    .exclude(".tsqd-parent-container")
    .exclude("[class*='tsd-']")
    .analyze();
  results.push({
    screen,
    layout,
    mode,
    violations: violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 6).map((n) => ({
        target: n.target.join(" "),
        summary: (n.failureSummary ?? "").split("\n").slice(0, 3).join(" "),
      })),
    })),
  });
  const name = `${layout}-${mode}-${screen}`.replace(/[^a-z0-9-]+/gi, "-");
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  const serious = violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  console.log(
    `  ${name}: ${violations.length} violations (${serious.length} serious/critical)${
      serious.length ? ` — ${serious.map((v) => v.id).join(", ")}` : ""
    }`,
  );
}

async function signedIn(
  browser: Browser,
  layout: Layout,
  mode: Mode,
  extra: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const { clerk } = await import("@clerk/testing/playwright");
  const context = await browser.newContext({
    viewport: VIEWPORTS[layout],
    deviceScaleFactor: 1,
    isMobile: layout === "phone",
    hasTouch: layout === "phone",
    colorScheme: mode,
    timezoneId: TZ,
    locale: "en-US",
    ...extra,
  });
  const page = await context.newPage();
  await page.goto(BASE);
  await clerk.signIn({ page, emailAddress: EMAIL });
  await page.goto(BASE);
  await page.getByText(READY).first().waitFor({ timeout: 60_000 });
  await hideDevtools(page);
  return { context, page };
}

async function hideDevtools(page: Page) {
  await page.addStyleTag({
    content: ".tsqd-parent-container, [class*='tsd-'] { display: none !important; }",
  });
}

const layoutRoot = (layout: Layout) => `[data-layout="${layout}"]`;

async function firstRow(page: Page, layout: Layout) {
  return page.locator(`${layoutRoot(layout)} [data-phone-row] button[aria-haspopup]`).first();
}

async function escapeCloses(page: Page, label: string, selector: string) {
  await page.keyboard.press("Escape");
  await sleep(450);
  const open = await page.locator(selector).count();
  (checks.escape as Record<string, boolean>)[label] = open === 0;
}

// ---------------------------------------------------------------------------

async function auditPhone(browser: Browser, mode: Mode) {
  const L: Layout = "phone";
  const { context, page } = await signedIn(browser, L, mode);
  await axe(page, "today", L, mode);
  for (const [path, name] of [
    ["/this-week", "this-week"],
    ["/someday", "someday"],
    ["/lists", "lists"],
  ]) {
    await page.goto(`${BASE}${path}`);
    await page.getByText(READY).first().waitFor({ state: "attached" });
    await hideDevtools(page);
    await sleep(500);
    await axe(page, name, L, mode);
  }
  // A list, pushed.
  await page.getByRole("button", { name: "Groceries", exact: true }).click();
  await sleep(500);
  checks[`phone-${mode}-list-url`] = page.url();
  await axe(page, "list", L, mode);

  await page.goto(`${BASE}/today`);
  await page.getByText(READY).first().waitFor();
  await hideDevtools(page);
  // Composer focused.
  await page.getByRole("textbox", { name: "New todo" }).focus();
  await sleep(300);
  await axe(page, "composer", L, mode);
  await page.keyboard.press("Escape");

  // Detail.
  await (await firstRow(page, L)).click();
  await page.getByRole("dialog").waitFor();
  await axe(page, "detail", L, mode);
  await page.getByRole("dialog").getByRole("button", { name: /^Due/ }).click();
  await page.getByRole("button", { name: "Pick a date…" }).click();
  await axe(page, "detail-calendar", L, mode);
  await escapeCloses(page, `phone-${mode}-detail`, "[role=dialog]");

  // Context menu (keyboard route to the long-press menu).
  await (await firstRow(page, L)).focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("dialog").waitFor();
  await axe(page, "context-menu", L, mode);
  await escapeCloses(page, `phone-${mode}-menu`, "[role=dialog]");

  // Account sheet, then Done and Settings.
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("dialog").waitFor();
  await axe(page, "account", L, mode);
  await page.getByRole("menuitem", { name: /^Done/ }).click();
  await sleep(500);
  await axe(page, "done", L, mode);
  await escapeCloses(page, `phone-${mode}-done`, "[role=dialog]");
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await sleep(500);
  await axe(page, "settings", L, mode);
  await escapeCloses(page, `phone-${mode}-settings`, "[role=dialog]");

  if (mode === "light") {
    await touchTargets(page);
    await layoutShift(page, L);
    await toastSemantics(page);
  }

  // Offline.
  await context.setOffline(true);
  await sleep(600);
  await axe(page, "offline", L, mode);
  checks[`phone-${mode}-offline-overlap`] = await page.evaluate(() => {
    const banner = document.querySelector("output[aria-live]");
    const nav = document.querySelector('[data-layout="phone"] nav');
    if (!banner || !nav) return null;
    const a = banner.getBoundingClientRect();
    const b = nav.getBoundingClientRect();
    return a.bottom > b.top && a.top < b.bottom;
  });
  await context.setOffline(false);
  await context.close();
}

async function auditWide(browser: Browser, mode: Mode) {
  const L: Layout = "wide";
  const { context, page } = await signedIn(browser, L, mode);
  await axe(page, "board", L, mode);

  await page
    .getByRole("navigation", { name: "Lists" })
    .getByRole("button", { name: "Groceries", exact: true })
    .click();
  await sleep(600);
  checks[`wide-${mode}-list-url`] = page.url();
  await axe(page, "list-column", L, mode);

  // One click selects, a second opens the detail in the fourth column.
  await (await firstRow(page, L)).dblclick();
  await page.locator("[data-detail-column]").waitFor();
  await axe(page, "detail", L, mode);
  await escapeCloses(page, `wide-${mode}-detail`, "[data-detail-column]");

  const row = await firstRow(page, L);
  await row.click({ button: "right" });
  await page.getByRole("dialog").waitFor();
  await axe(page, "context-menu", L, mode);
  await escapeCloses(page, `wide-${mode}-menu`, "[role=dialog]");

  // Composer focused.
  await page.locator("[data-composer] textarea").first().focus();
  await sleep(300);
  await axe(page, "composer", L, mode);
  await page.keyboard.press("Escape");

  await page.locator("body").click({ position: { x: 700, y: 60 } });
  await page.keyboard.press("?");
  await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor();
  await axe(page, "shortcuts", L, mode);
  await escapeCloses(page, `wide-${mode}-shortcuts`, "[role=dialog]");

  // The palette, Move to and quick add act on the selection. Focusing a row
  // selects it; a click could be a second click on the selection, which
  // opens the detail.
  await (await firstRow(page, L)).focus();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("dialog", { name: "Search and commands" }).waitFor();
  await axe(page, "palette", L, mode);
  await escapeCloses(page, `wide-${mode}-palette`, "[role=dialog]");
  await page.keyboard.press("m");
  await page.getByRole("combobox", { name: "Move to a list…" }).waitFor();
  await axe(page, "move-to", L, mode);
  await escapeCloses(page, `wide-${mode}-move-to`, "[role=dialog]");
  await page.getByRole("button", { name: "New todo" }).click();
  await page.getByRole("dialog", { name: "Quick add" }).waitFor();
  await axe(page, "quick-add", L, mode);
  await escapeCloses(page, `wide-${mode}-quick-add`, "[role=dialog]");

  // Done is the fourth column's resting state, not a dialog.
  await page
    .getByRole("navigation", { name: "More" })
    .getByRole("button", { name: "Done" })
    .click();
  await page.locator('[data-column="done"]').waitFor();
  await axe(page, "done", L, mode);
  await page.getByRole("button", { name: "Settings" }).click();
  await sleep(500);
  await axe(page, "settings", L, mode);
  await escapeCloses(page, `wide-${mode}-settings`, "[role=dialog]");

  if (mode === "light") {
    await keyboardWalk(page);
    await layoutShift(page, L);
  }
  await context.close();
}

async function auditStates(browser: Browser, mode: Mode) {
  // Loading and error: hold or fail the server functions.
  for (const layout of ["phone", "wide"] as Layout[]) {
    const { context, page } = await signedIn(browser, layout, mode);
    await page.route("**/_serverFn/**", (route) => route.abort());
    await page.reload();
    await hideDevtools(page);
    await page.getByText("Couldn’t load your todos.").first().waitFor({ timeout: 60_000 }).catch(() => {});
    await axe(page, "error-state", layout, mode);
    await page.unroute("**/_serverFn/**");
    await page.route("**/_serverFn/**", async (route) => {
      await sleep(8000);
      await route.continue().catch(() => {});
    });
    await page.reload();
    await hideDevtools(page);
    await sleep(1200);
    await axe(page, "loading", layout, mode);
    await context.close();
  }

  // Signed-out pages.
  const context = await browser.newContext({
    viewport: VIEWPORTS.phone,
    colorScheme: mode,
    timezoneId: TZ,
  });
  const page = await context.newPage();
  for (const [path, name] of [
    ["/", "landing"],
    ["/privacy", "privacy"],
    ["/terms", "terms"],
    ["/connect/gmail-addon", "gmail-connect"],
    ["/nope-not-here", "not-found"],
  ]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await hideDevtools(page);
    await axe(page, name, "signed-out", mode);
  }
  await page.setViewportSize(VIEWPORTS.wide);
  await page.goto(BASE);
  await page.waitForLoadState("networkidle").catch(() => {});
  await hideDevtools(page);
  await axe(page, "landing-wide", "signed-out", mode);
  await context.close();
}

// ---------------------------------------------------------------------------
// Measurements axe doesn't make

async function touchTargets(page: Page) {
  checks.touchTargets = await page.evaluate(() => {
    const small: string[] = [];
    const els = document.querySelectorAll<HTMLElement>(
      '[data-layout="phone"] button, [data-layout="phone"] a, [data-layout="phone"] input, [data-layout="phone"] textarea, [data-layout="phone"] select, form button',
    );
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest("[inert]")) continue;
      // n-hit grows the target with an invisible ::before.
      const hit = el.classList.contains("n-hit");
      if (!hit && (r.width < 44 || r.height < 44)) {
        small.push(
          `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(r.width)}×${Math.round(r.height)}`,
        );
      }
    }
    return small;
  });
}

async function layoutShift(page: Page, layout: Layout) {
  await page.goto(`${BASE}/today`);
  await page.getByText(READY).first().waitFor();
  await hideDevtools(page);
  await sleep(600);
  const rows = page.locator(`${layoutRoot(layout)} [data-phone-row]`);
  const n = await rows.count();
  if (n < 3) {
    checks[`layoutShift-${layout}`] = `only ${n} rows`;
    return;
  }
  const tops = async () =>
    page.evaluate((sel) => {
      return Array.from(document.querySelectorAll(sel))
        .slice(0, 2)
        .map((el) => Math.round(el.getBoundingClientRect().top * 10) / 10);
    }, `${layoutRoot(layout)} [data-phone-row]`);
  const before = await tops();
  await rows.nth(2).locator("button[aria-pressed]").first().click();
  let maxDelta = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(60);
    const now = await tops();
    for (let j = 0; j < before.length; j++) {
      maxDelta = Math.max(maxDelta, Math.abs((now[j] ?? 0) - (before[j] ?? 0)));
    }
  }
  checks[`layoutShift-${layout}`] = { rowsAboveMaxMovePx: maxDelta };
  // Put it back.
  await page.getByRole("button", { name: "Undo" }).click().catch(() => {});
  await sleep(600);
}

async function toastSemantics(page: Page) {
  await page.goto(`${BASE}/today`);
  await page.getByText(READY).first().waitFor();
  await sleep(400);
  await page
    .locator('[data-layout="phone"] [data-phone-row] button[aria-pressed]')
    .first()
    .click();
  await sleep(700);
  checks.toast = await page.evaluate(() => {
    const viewport = document.querySelector("[data-base-ui-toast-viewport], [role=region][aria-live], [aria-live]");
    const toast = document.querySelector('[role="alertdialog"], [role="dialog"][aria-modal="false"], [data-type], [role="status"]');
    const live = Array.from(document.querySelectorAll("[aria-live]")).map(
      (el) => ({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        live: el.getAttribute("aria-live"),
        label: el.getAttribute("aria-label"),
        text: el.textContent?.trim().slice(0, 80),
      }),
    );
    return {
      viewport: viewport?.outerHTML.slice(0, 200),
      toast: toast?.outerHTML.slice(0, 300),
      live,
      undo: !!Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Undo",
      ),
    };
  });
  await page.getByRole("button", { name: "Undo" }).click().catch(() => {});
  await sleep(500);
}

async function keyboardWalk(page: Page) {
  await page.goto(BASE);
  await page.getByText(READY).first().waitFor();
  await hideDevtools(page);
  // Settled styles, so focused and blurred can be compared straight away.
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; }",
  });
  await sleep(500);
  const stops: { name: string; visible: boolean }[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return { name: "(body)", visible: false };
        // Focus is visible when something changes with it: an outline (the
        // yellow ring), a box-shadow (a row's selection ring, on its
        // container) or a background (the wide board's soft focus), on the
        // element or one of its near ancestors. Compare focused with blurred.
        const chain: HTMLElement[] = [];
        for (let n: HTMLElement | null = el; n && chain.length < 5; n = n.parentElement) {
          chain.push(n);
        }
        // No named functions in here: tsx would wrap them in a `__name`
        // helper that doesn't exist in the page.
        const looks: string[][] = [];
        for (let phase = 0; phase < 2; phase++) {
          if (phase === 1) el.blur();
          looks.push(
            chain.map((n) => {
              const cs = getComputedStyle(n);
              const outline =
                cs.outlineStyle !== "none" && cs.outlineWidth !== "0px"
                  ? `${cs.outlineStyle} ${cs.outlineColor}`
                  : "";
              return `${outline}|${cs.boxShadow}|${cs.backgroundColor}`;
            }),
          );
        }
        el.focus({ focusVisible: true } as FocusOptions);
        const [focused, blurred] = looks;
        // A board row's indicator is the selection ring on its container,
        // which stays after blur because the selection does.
        const row = el.closest<HTMLElement>("[data-row-container]");
        const visible =
          focused.some((s, i) => s !== blurred[i]) ||
          (!!row && getComputedStyle(row).boxShadow !== "none");
        const name =
          el.getAttribute("aria-label") ??
          (el.textContent ?? "").trim().slice(0, 30) ??
          el.tagName;
        return { name: `${el.tagName.toLowerCase()}:${name}`, visible };
      }),
    );
  }
  checks.keyboardWalk = stops;
  checks.keyboardInvisibleFocus = stops.filter((s) => !s.visible).map((s) => s.name);
}

async function zoomAndText(browser: Browser) {
  const out: Record<string, unknown> = {};
  // 200% zoom on a 1440×900 window is a 720×450 CSS viewport at 2x.
  for (const [label, viewport, scale] of [
    ["zoom200-wide", { width: 720, height: 450 }, 2],
    ["zoom200-phone", { width: 390, height: 844 }, 2],
  ] as const) {
    const { context, page } = await signedIn(browser, "phone", "light", {
      viewport,
      deviceScaleFactor: scale,
    });
    await page.screenshot({ path: join(OUT, `${label}.png`) });
    out[label] = await overflow(page);
    await context.close();
  }
  // Large text: the browser's default font size doubled (rem scales).
  for (const layout of ["phone", "wide"] as Layout[]) {
    const { context, page } = await signedIn(browser, layout, "light");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await sleep(500);
    await page.screenshot({ path: join(OUT, `largetext-${layout}.png`) });
    out[`largetext-${layout}`] = await overflow(page);
    await (await firstRow(page, layout)).click();
    await sleep(600);
    await page.screenshot({ path: join(OUT, `largetext-${layout}-detail.png`) });
    await context.close();
  }
  checks.zoom = out;
}

async function overflow(page: Page) {
  return page.evaluate(() => ({
    horizontalScroll:
      document.documentElement.scrollWidth > window.innerWidth + 1,
    // Text that runs out of its box without being an intentional truncate.
    clipped: Array.from(document.querySelectorAll<HTMLElement>("h1, h2, p, button, label"))
      .filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none") return false;
        if (el.closest("[inert], [aria-hidden=true], [class*='tsd-'], .tsqd-parent-container")) return false;
        if (el.textContent?.includes("pick this pane")) return false;
        return el.scrollWidth > el.clientWidth + 2 && cs.overflow !== "visible";
      })
      .slice(0, 10)
      .map((el) => `${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 30)}"`),
  }));
}

async function reducedMotion(browser: Browser) {
  const { context, page } = await signedIn(browser, "phone", "light", {
    reducedMotion: "reduce",
  });
  await page.reload();
  await page.getByText(READY).first().waitFor();
  checks.reducedMotion = await page.evaluate(() => {
    const html = document.documentElement;
    const row = document.querySelector<HTMLElement>('[data-layout="phone"] [data-phone-row]');
    const pager = document.querySelector<HTMLElement>('[data-layout="phone"] [data-phone-ready]');
    const moving = /transform|translate|scale|grid-template-rows|height|bottom|padding|all/;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("*")) {
      const cs = getComputedStyle(el);
      const t = cs.transitionProperty;
      const timed = cs.transitionDuration
        .split(",")
        .some((d) => Number.parseFloat(d) > 0);
      if (timed && t && t !== "none" && moving.test(t)) {
        offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}: ${t}`);
      }
    }
    return {
      attr: html.dataset.reducedMotion,
      rowTransition: row ? getComputedStyle(row).transitionProperty : null,
      pagerScrollBehavior: pager ? getComputedStyle(pager).scrollBehavior : null,
      movingTransitions: offenders.slice(0, 10),
    };
  });
  await context.close();
}

// ---------------------------------------------------------------------------

(async () => {
  mkdirSync(OUT, { recursive: true });
  checks.escape = {};
  const { chromium } = await import("playwright");
  const { clerkSetup } = await import("@clerk/testing/playwright");
  await clerkSetup({ publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY });
  const browser = await chromium.launch();
  const only = process.env.AUDIT_ONLY?.split(",");
  const run = (name: string) => !only || only.includes(name);
  for (const mode of ["light", "dark"] as Mode[]) {
    if (run("phone")) await auditPhone(browser, mode);
    if (run("wide")) await auditWide(browser, mode);
    if (run("states")) await auditStates(browser, mode);
  }
  if (run("zoom")) await zoomAndText(browser);
  if (run("motion")) await reducedMotion(browser);
  await browser.close();

  const all = results.flatMap((r) => r.violations.map((v) => ({ ...v, at: `${r.layout}/${r.mode}/${r.screen}` })));
  const serious = all.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = {
    screens: results.length,
    violations: all.length,
    seriousOrCritical: serious.length,
    byRule: Object.fromEntries(
      [...new Set(all.map((v) => v.id))].map((id) => [
        id,
        {
          impact: all.find((v) => v.id === id)?.impact,
          screens: all.filter((v) => v.id === id).map((v) => v.at),
        },
      ]),
    ),
  };
  writeFileSync(
    join(OUT, "audit.json"),
    `${JSON.stringify({ summary, checks, results }, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(checks, null, 2));
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
