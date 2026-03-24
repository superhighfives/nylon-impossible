#!/usr/bin/env tsx
/**
 * Nylon Impossible marketing asset generator.
 *
 * Usage:
 *   npx tsx generate.ts [--capture] [--web] [--publish] [--all]
 *
 * Flags:
 *   --capture  Start web dev server + iOS simulator, take screenshots.
 *   --web      Composite source PNGs into website JPGs (@2x + @1x).
 *   --publish  Copy web JPGs to superhighfives.com, commit, and push.
 *   --all      Run capture, web, and publish in sequence.
 *
 * Environment:
 *   VITE_CLERK_PUBLISHABLE_KEY  Required for web capture (Clerk initialisation).
 *   SUPERHIGHFIVES_DIR          Path to superhighfives.com repo root.
 *                               Default: ../../pika-workspace/superhighfives.com
 *                               (relative to nylon-impossible workspace root)
 *
 * Output:
 *   source/   — captured raw PNGs (gitignored)
 *   output/   — composited @2x and @1x JPGs
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import sharp from "sharp";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: join(SCRIPT_DIR, ".dev.vars") });

const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "../..");
const SOURCE_DIR = join(SCRIPT_DIR, "source");
const OUTPUT_DIR = join(SCRIPT_DIR, "output");
const WEBSITE_DIR =
  process.env.SUPERHIGHFIVES_DIR ??
  resolve(WORKSPACE_ROOT, "../pika-workspace/superhighfives.com");

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

interface Manifest {
  ios: {
    scheme: string;
    project: string;
    bundleId: string;
    device: string;
  };
  web: {
    url: string;
    viewport: { width: number; height: number };
  };
  composite: {
    canvas: { width: number; height: number };
    browser: { left: number; top: number };
    phone: { left: number; top: number; width: number };
    png?: boolean;
    backgrounds: {
      light: { r: number; g: number; b: number };
      dark: { r: number; g: number; b: number };
    };
  };
}

const manifest: Manifest = JSON.parse(
  readFileSync(join(SCRIPT_DIR, "manifest.json"), "utf8")
);

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function flag(name: string): boolean {
  return args.includes(name);
}

const runCapture = flag("--capture") || flag("--all");
const runWeb = flag("--web") || flag("--all");
const runPublish = flag("--publish") || flag("--all");

if (!runCapture && !runWeb && !runPublish) {
  console.error(
    "Error: specify at least one of --capture, --web, --publish, or --all"
  );
  process.exit(1);
}

if (runCapture && !process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  console.error(
    "Error: VITE_CLERK_PUBLISHABLE_KEY is required for --capture / --all"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Shadow (same approach as Pika — grayscale blur avoids premultiplied-alpha issues)
// ---------------------------------------------------------------------------

const SHADOW_OFFSET_Y = 15;
const SHADOW_BLUR = 15;
const SHADOW_OPACITY = 0.2;

async function withDropShadow(
  buf: Buffer
): Promise<{ image: Buffer; padLeft: number; padTop: number }> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 960;
  const h = meta.height ?? 600;

  const padLeft = SHADOW_BLUR * 2;
  const padTop = SHADOW_BLUR * 2;
  const padRight = SHADOW_BLUR * 2;
  const padBottom = SHADOW_BLUR * 2 + SHADOW_OFFSET_Y;
  const totalW = w + padLeft + padRight;
  const totalH = h + padTop + padBottom;

  const windowAlpha = await sharp(buf).extractChannel(3).toBuffer();

  const alphaPadded = await sharp(windowAlpha)
    .extend({
      top: padTop + SHADOW_OFFSET_Y,
      bottom: SHADOW_BLUR * 2,
      left: padLeft,
      right: padRight,
      background: { r: 0, g: 0, b: 0 },
    })
    .png()
    .toBuffer();

  const { data: blurredGrey, info: blurInfo } = await sharp(alphaPadded)
    .blur(SHADOW_BLUR)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = blurInfo.channels;
  const shadowData = Buffer.alloc(totalW * totalH * 4, 0);
  for (let i = 0; i < totalW * totalH; i++) {
    shadowData[i * 4 + 3] = Math.round(
      (blurredGrey[i * ch] as number) * SHADOW_OPACITY
    );
  }

  const shadow = await sharp(shadowData, {
    raw: { width: totalW, height: totalH, channels: 4 },
  })
    .png()
    .toBuffer();

  const result = await sharp(shadow)
    .composite([{ input: buf, left: padLeft, top: padTop }])
    .png()
    .toBuffer();

  return { image: result, padLeft, padTop };
}

// ---------------------------------------------------------------------------
// Rounded corners (SVG mask — requires sharp with librsvg, included by default)
// ---------------------------------------------------------------------------

async function applyRoundedCorners(buf: Buffer, radius: number): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="white"/></svg>`
  );
  return sharp(buf)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Browser chrome bar (macOS-style, rendered as SVG)
// ---------------------------------------------------------------------------

// The chrome bar is rendered at the same pixel density as the Playwright screenshot
// (deviceScaleFactor: 2), so its physical height in pixels is 2× the logical 40pt.
const CHROME_BAR_H = 80;

function makeBrowserChromeSvg(
  width: number,
  height: number,
  mode: "light" | "dark"
): string {
  const bg = mode === "light" ? "#fdfdf9" : "#14120b";
  const separator = mode === "light" ? "#e4e4e0" : "#27261a";
  const urlBg = mode === "light" ? "#e8e8e4" : "#201f14";

  const dotY = Math.round(height / 2);
  const cx = Math.round(width / 2);

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${bg}"/>
    <rect x="0" y="${height - 1}" width="${width}" height="1" fill="${separator}"/>
    <circle cx="28" cy="${dotY}" r="8" fill="#FF5F56"/>
    <circle cx="52" cy="${dotY}" r="8" fill="#FEBC2E"/>
    <circle cx="76" cy="${dotY}" r="8" fill="#28C840"/>
    <rect x="${cx - 240}" y="${dotY - 16}" width="480" height="32" rx="16" fill="${urlBg}"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Capture — web
// ---------------------------------------------------------------------------

async function captureWebScreenshots(): Promise<void> {
  console.log("  Starting web dev server…");
  const server = spawn(
    "pnpm",
    ["--filter", "@nylon-impossible/web", "dev"],
    {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  server.stderr?.on("data", () => {}); // suppress noise
  server.stdout?.on("data", () => {});

  try {
    await waitForUrl(manifest.web.url, 60_000);
    console.log(`  Dev server ready at ${manifest.web.url}`);

    const { chromium } = await import("playwright");
    const browser = await chromium.launch();

    for (const mode of ["light", "dark"] as const) {
      const context = await browser.newContext({
        viewport: manifest.web.viewport,
        deviceScaleFactor: 2,
        colorScheme: mode,
      });
      const page = await context.newPage();
      await page.goto(manifest.web.url);
      await page.waitForLoadState("networkidle");
      await sleep(800);

      const dest = join(SOURCE_DIR, `web-${mode}.png`);
      await page.screenshot({ path: dest, fullPage: false });
      console.log(`  → web-${mode}.png`);
      await context.close();
    }

    await browser.close();
  } finally {
    server.kill("SIGTERM");
    await sleep(500);
  }
}

// ---------------------------------------------------------------------------
// Capture — iOS simulator
// ---------------------------------------------------------------------------

async function captureIOSScreenshots(): Promise<void> {
  const { project, scheme, bundleId } = manifest.ios;
  const projectPath = join(WORKSPACE_ROOT, project);
  const derivedDataPath = join("/tmp", "nylon-impossible-marketing-build");

  // Resolve device using xcodebuild's own destination list — this is the
  // source of truth for what's actually buildable for this scheme/SDK.
  // simctl may list simulators whose runtime is below the app's minimum
  // deployment target, which causes install to fail even after a successful build.
  const deviceOverride = process.env.IOS_DEVICE ?? manifest.ios.device;
  const showDestOutput = execSync(
    [
      "xcodebuild -showdestinations",
      `-project "${projectPath}"`,
      `-scheme "${scheme}"`,
    ].join(" "),
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  );
  // Parse lines like: { platform:iOS Simulator, arch:arm64, id:UUID, OS:X.Y, name:Device }
  const destRegex =
    /platform:iOS Simulator[^}]*?id:([0-9A-Fa-f-]{36})[^}]*?name:([^,}]+)/g;
  const iPhoneDestinations: Array<{ udid: string; name: string }> = [];
  for (
    let m = destRegex.exec(showDestOutput);
    m !== null;
    m = destRegex.exec(showDestOutput)
  ) {
    const udid = m[1].trim();
    const name = m[2].trim();
    if (name.includes("iPhone") && !iPhoneDestinations.some((d) => d.udid === udid)) {
      iPhoneDestinations.push({ udid, name });
    }
  }
  if (iPhoneDestinations.length === 0) {
    throw new Error("No iPhone simulator destinations found for this scheme");
  }
  const chosen =
    iPhoneDestinations.find((d) => d.name === deviceOverride) ??
    iPhoneDestinations[0];
  const device = chosen.name;

  console.log(`  Building iOS app (${scheme}) for simulator…`);
  execSync(
    [
      "xcodebuild build",
      `-project "${projectPath}"`,
      `-scheme "${scheme}"`,
      `-configuration Debug`,
      `-destination "platform=iOS Simulator,id=${chosen.udid}"`,
      `-derivedDataPath "${derivedDataPath}"`,
      "-quiet",
    ].join(" "),
    { stdio: "inherit" }
  );

  const appPath = join(
    derivedDataPath,
    "Build",
    "Products",
    "Debug-iphonesimulator",
    `${scheme}.app`
  );
  if (!existsSync(appPath)) {
    throw new Error(`App not found after build: ${appPath}`);
  }
  console.log(`  App built`);

  const udid = chosen.udid;
  if (!udid) throw new Error(`Simulator "${device}" not found`);

  // Simulator.app must be running before the simulator boots so it can attach
  // to the framebuffer and initialise screen surfaces. Opening it after boot
  // means the render pipeline never starts — screenshots time out indefinitely.
  console.log("  Starting Simulator.app…");
  spawnSync("open", ["-a", "Simulator"], { stdio: "pipe" });
  // Poll until the Simulator process is actually running
  for (let i = 0; i < 30; i++) {
    const { status } = spawnSync("pgrep", ["-x", "Simulator"], { stdio: "pipe" });
    if (status === 0) break;
    await sleep(1000);
  }
  await sleep(2000); // extra settle time for the window server connection

  console.log(`  Booting simulator: ${device} (${udid})…`);
  spawnSync("xcrun", ["simctl", "boot", udid], { stdio: "pipe" });
  // bootstatus -b can hang indefinitely in CI — poll simctl list instead
  const bootDeadline = Date.now() + 120_000;
  while (Date.now() < bootDeadline) {
    const raw = execSync("xcrun simctl list devices -j", { encoding: "utf8" });
    const allDevices = Object.values(
      (JSON.parse(raw) as { devices: Record<string, Array<{ udid: string; state: string }>> }).devices
    ).flat();
    if (allDevices.find((d) => d.udid === udid && d.state === "Booted")) break;
    await sleep(2000);
  }

  console.log("  Installing and launching app…");
  execSync(`xcrun simctl install "${udid}" "${appPath}"`, { stdio: "pipe" });
  execSync(`xcrun simctl launch "${udid}" ${bundleId}`, { stdio: "pipe" });
  await sleep(8000);

  for (const mode of ["light", "dark"] as const) {
    execSync(`xcrun simctl ui "${udid}" appearance ${mode}`, { stdio: "pipe" });
    await sleep(2000);
    const dest = join(SOURCE_DIR, `ios-${mode}.png`);
    // Retry screenshot — "Timeout waiting for screen surfaces" can occur in CI
    // while the simulator's render pipeline is still initialising.
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        execSync(`xcrun simctl io "${udid}" screenshot "${dest}"`, { stdio: "pipe" });
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        console.log(`  screenshot attempt ${attempt} failed, retrying…`);
        await sleep(3000);
      }
    }
    if (lastErr) throw lastErr;
    console.log(`  → ios-${mode}.png`);
  }

  console.log("  Shutting down simulator…");
  spawnSync("xcrun", ["simctl", "shutdown", udid], { stdio: "pipe" });
}

async function runCaptureStep(): Promise<void> {
  console.log("\n── Capture ──────────────────────────────────────");
  mkdirSync(SOURCE_DIR, { recursive: true });
  await captureWebScreenshots();
  await captureIOSScreenshots();
}

// ---------------------------------------------------------------------------
// Web composite
// ---------------------------------------------------------------------------

async function compositeMarketing(mode: "light" | "dark"): Promise<void> {
  const { canvas, browser: browserPos, phone: phonePos, backgrounds } =
    manifest.composite;
  const bg = backgrounds[mode];

  // 1. Browser window — Playwright screenshot + chrome bar + rounded corners
  const webSrc = join(SOURCE_DIR, `web-${mode}.png`);
  const webImg = await sharp(webSrc).ensureAlpha().toBuffer();
  const webMeta = await sharp(webImg).metadata();
  const webW = webMeta.width ?? 0;

  const chromeSvg = Buffer.from(
    makeBrowserChromeSvg(webW, CHROME_BAR_H, mode)
  );
  const chromeImg = await sharp(chromeSvg).png().toBuffer();

  // Prepend chrome bar above page content
  const browserWindow = await sharp({
    create: {
      width: webW,
      height: (webMeta.height ?? 0) + CHROME_BAR_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: chromeImg, top: 0, left: 0 },
      { input: webImg, top: CHROME_BAR_H, left: 0 },
    ])
    .png()
    .toBuffer();

  const browserRounded = await applyRoundedCorners(browserWindow, 12);
  const { image: browserShadowed, padLeft: bPadLeft, padTop: bPadTop } =
    await withDropShadow(browserRounded);

  // 2. Phone — resize iOS screenshot, round corners to match device shape
  const iosSrc = join(SOURCE_DIR, `ios-${mode}.png`);
  const phoneImg = await sharp(iosSrc)
    .resize(phonePos.width)
    .ensureAlpha()
    .png()
    .toBuffer();

  const phoneRadius = Math.round(phonePos.width * 0.13);
  const phoneRounded = await applyRoundedCorners(phoneImg, phoneRadius);
  const { image: phoneShadowed, padLeft: pPadLeft, padTop: pPadTop } =
    await withDropShadow(phoneRounded);

  // 3. Composite: browser behind, phone in front
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const composites: Parameters<ReturnType<typeof sharp>["composite"]>[0] = [
    {
      input: browserShadowed,
      left: browserPos.left - bPadLeft,
      top: browserPos.top - bPadTop,
    },
    {
      input: phoneShadowed,
      left: phonePos.left - pPadLeft,
      top: phonePos.top - pPadTop,
    },
  ];

  const composited = await sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 3,
      background: bg,
    },
  })
    .composite(composites)
    .jpeg({ quality: 95 })
    .toBuffer();

  const jpg2x = join(OUTPUT_DIR, `nylon-screenshot-${mode}@2x.jpg`);
  const jpg1x = join(OUTPUT_DIR, `nylon-screenshot-${mode}.jpg`);

  await sharp(composited).toFile(jpg2x);
  console.log(`  → ${jpg2x}`);

  await sharp(composited)
    .resize(Math.round(canvas.width / 2), Math.round(canvas.height / 2))
    .jpeg({ quality: 95 })
    .toFile(jpg1x);
  console.log(`  → ${jpg1x}`);

  if (manifest.composite.png) {
    const transparentComposited = await sharp({
      create: {
        width: canvas.width,
        height: canvas.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();

    const png2x = join(OUTPUT_DIR, `nylon-screenshot-${mode}@2x.png`);
    const png1x = join(OUTPUT_DIR, `nylon-screenshot-${mode}.png`);

    await sharp(transparentComposited).toFile(png2x);
    console.log(`  → ${png2x}`);

    await sharp(transparentComposited)
      .resize(Math.round(canvas.width / 2), Math.round(canvas.height / 2))
      .png()
      .toFile(png1x);
    console.log(`  → ${png1x}`);
  }
}

async function runWebStep(): Promise<void> {
  console.log("\n── Web composites ───────────────────────────────");
  await compositeMarketing("light");
  await compositeMarketing("dark");
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

function runPublishStep(): void {
  console.log("\n── Publish to superhighfives.com ────────────────");

  const assetsDir = join(WEBSITE_DIR, "public", "assets");
  if (!existsSync(assetsDir)) {
    console.error(`  Error: assets dir not found: ${assetsDir}`);
    console.error("  Set SUPERHIGHFIVES_DIR to the path of the superhighfives.com repo.");
    process.exit(1);
  }

  const files = [
    "nylon-screenshot-light@2x.jpg",
    "nylon-screenshot-light.jpg",
    "nylon-screenshot-dark@2x.jpg",
    "nylon-screenshot-dark.jpg",
  ];

  const copied: string[] = [];
  for (const file of files) {
    const src = join(OUTPUT_DIR, file);
    if (existsSync(src)) {
      copyFileSync(src, join(assetsDir, file));
      console.log(`  → ${file}`);
      copied.push(`public/assets/${file}`);
    } else {
      console.warn(`  ⚠ ${file} not found, skipping`);
    }
  }

  if (copied.length === 0) {
    console.warn("  No files to publish.");
    return;
  }

  execSync(
    `git -C "${WEBSITE_DIR}" add ${copied.map((f) => `"${f}"`).join(" ")}`
  );
  try {
    execSync(
      `git -C "${WEBSITE_DIR}" commit -m "Update Nylon Impossible marketing screenshots"`,
      { stdio: "inherit" }
    );
  } catch {
    console.log("  Nothing to commit (files unchanged).");
    return;
  }
  execSync(`git -C "${WEBSITE_DIR}" pull --rebase`, { stdio: "inherit" });
  execSync(`git -C "${WEBSITE_DIR}" push`, { stdio: "inherit" });
  console.log("  Pushed.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const { default: http } = await import("node:http");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve(true);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await sleep(500);
  }
  throw new Error(`${url} did not become available within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  console.log("Nylon Impossible marketing assets");
  console.log(`Output: ${OUTPUT_DIR}`);

  if (runCapture) await runCaptureStep();
  if (runWeb) await runWebStep();
  if (runPublish) runPublishStep();

  console.log("\nDone.");
})();
