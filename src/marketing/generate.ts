#!/usr/bin/env tsx
/**
 * Nylon Impossible marketing asset generator.
 *
 * Usage:
 *   npx tsx generate.ts [--capture] [--web] [--publish] [--all]
 *
 * Flags:
 *   --capture      Seed demo data, capture web (dev server) and iOS (simulator).
 *   --capture-web  Web capture only (no iOS simulator).
 *   --capture-ios  iOS capture only (no dev server, no Clerk).
 *   --web          Composite source PNGs into website JPGs (@2x + @1x), and
 *                  write the App Store set and the landing-page images.
 *   --publish      Copy web JPGs to superhighfives.com, commit, and push.
 *   --all          Run capture, web, and publish in sequence.
 *   --skip-ios     Reuse the iOS screenshots already in source/ (no simulator).
 *   --strict       Fail if any asset had to fall back to a previous capture.
 *
 * Environment:
 *   VITE_CLERK_PUBLISHABLE_KEY  Required for web capture (Clerk dev instance publishable key).
 *   CLERK_SECRET_KEY            Required for web capture (Clerk dev instance secret key).
 *   CLERK_MARKETING_USER_EMAIL  Required for web capture (email of the Clerk user to sign in as).
 *   MARKETING_WEB_PORT          Port for the web dev server (default: manifest web.port).
 *   MARKETING_SIM_HEADLESS=1    Don't open the Simulator window before booting.
 *   SUPERHIGHFIVES_DIR          Path to superhighfives.com repo root.
 *                               Default: ../../pika-workspace/superhighfives.com
 *                               (relative to nylon-impossible workspace root)
 *   MARKETING_SKIP_IOS=1        Same as --skip-ios.
 *   MARKETING_STRICT=1          Same as --strict.
 *
 * Web capture signs in through Clerk's testing helpers and screenshots the
 * real app over demo data (seed.ts). iOS capture needs no account: it launches
 * the DEBUG build with `-NylonScreen <route>`, which skips sign-in and draws
 * the app's own in-memory sample data — the same todos the seed writes.
 *
 * Output:
 *   source/             captured raw PNGs and capture-status.json (gitignored)
 *   output/             composited @2x and @1x JPGs (and PNGs)
 *   output/app-store/   raw device screenshots per App Store size, for a
 *                       manual upload to App Store Connect
 *   output/landing/     WebP product shots for the web landing page
 */

import { execFileSync, execSync, spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import sharp from "sharp";
import { buildSeedSql } from "./seed";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: join(SCRIPT_DIR, ".dev.vars") });

const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "../..");
const SOURCE_DIR = join(SCRIPT_DIR, "source");
const OUTPUT_DIR = join(SCRIPT_DIR, "output");
const APP_STORE_DIR = join(OUTPUT_DIR, "app-store");
const LANDING_DIR = join(OUTPUT_DIR, "landing");
const WEBSITE_DIR =
  process.env.SUPERHIGHFIVES_DIR ??
  resolve(WORKSPACE_ROOT, "../pika-workspace/superhighfives.com");

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

type Mode = "light" | "dark";
const MODES: Mode[] = ["light", "dark"];

type DeviceKey = "iphone" | "ipad";

interface Size {
  width: number;
  height: number;
}

interface Placement {
  /** Source asset name without the -light/-dark suffix. */
  shot: string;
  left: number;
  top: number;
  width: number;
}

interface Manifest {
  ios: {
    scheme: string;
    project: string;
    bundleId: string;
    devices: Record<
      DeviceKey,
      {
        /** Our own simulator, created on first use and reused after. */
        simulator: string;
        /** Device types to create it from, in order of preference. */
        types: string[];
        /** Folder name in output/app-store/. */
        appStore: string;
        /** App Store Connect's portrait size for this display class. */
        size: Size;
      }
    >;
    shots: { device: DeviceKey; screen: string; landscape?: boolean }[];
  };
  web: {
    port: number;
    timezone: string;
    shots: {
      name: string;
      viewport: Size;
      scale: number;
      mobile?: boolean;
    }[];
  };
  composite: {
    canvas: Size;
    png?: boolean;
    backgrounds: Record<Mode, { r: number; g: number; b: number }>;
    browser: { web: Placement; phone: Placement };
    ipad: { tablet: Placement; phone: Placement };
  };
}

const manifest: Manifest = JSON.parse(
  readFileSync(join(SCRIPT_DIR, "manifest.json"), "utf8"),
);

const WEB_PORT = Number(process.env.MARKETING_WEB_PORT ?? manifest.web.port);
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function flag(name: string): boolean {
  return args.includes(name);
}

const runCapture = flag("--capture") || flag("--all");
const runCaptureWeb = flag("--capture-web");
const runCaptureIOS = flag("--capture-ios");
const runWeb = flag("--web") || flag("--all");
const runPublish = flag("--publish") || flag("--all");

// Capture is best-effort by default (see capturePhase): a flake degrades to the
// screenshots already in source/ instead of failing the run. --strict turns
// that back into a hard failure, so a manual run still tells you the truth.
const strictCapture = flag("--strict") || process.env.MARKETING_STRICT === "1";
// Skip the simulator when source/ already holds iOS screenshots for this
// revision of the app — see the iOS cache in .github/workflows/marketing.yml.
const skipIOSCapture =
  flag("--skip-ios") || process.env.MARKETING_SKIP_IOS === "1";

if (!runCapture && !runCaptureWeb && !runCaptureIOS && !runWeb && !runPublish) {
  console.error(
    "Error: specify at least one of --capture, --capture-web, --capture-ios, --web, --publish, or --all",
  );
  process.exit(1);
}

if (runCapture || runCaptureWeb) {
  const missing = [
    "VITE_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "CLERK_MARKETING_USER_EMAIL",
  ].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `Error: missing env vars for --capture / --capture-web / --all: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

function webAsset(shot: string, mode: Mode): string {
  return `web-${shot}-${mode}`;
}

function iosShotName(shot: Manifest["ios"]["shots"][number]): string {
  return `ios-${shot.device}-${shot.screen}${shot.landscape ? "-landscape" : ""}`;
}

const WEB_ASSETS = manifest.web.shots.flatMap((shot) =>
  MODES.map((mode) => webAsset(shot.name, mode)),
);

function iosAssets(device: DeviceKey): string[] {
  return manifest.ios.shots
    .filter((shot) => shot.device === device)
    .flatMap((shot) => MODES.map((mode) => `${iosShotName(shot)}-${mode}`));
}

const DEVICES = (Object.keys(manifest.ios.devices) as DeviceKey[]).filter(
  (device) => iosAssets(device).length > 0,
);
const IOS_ASSETS = DEVICES.flatMap(iosAssets);

// ---------------------------------------------------------------------------
// Frames: shadow, rounded corners and hairline, in the app's own neutrals
// ---------------------------------------------------------------------------

/** Radix gray neutrals from src/shared/design/tokens.json. */
const FRAME = {
  light: { bar: "#f9f9f9", hairline: "#d9d9d9", fill: "#f0f0f0" },
  dark: { bar: "#191919", hairline: "#3a3a3a", fill: "#222222" },
} as const;

const SHADOW_OFFSET_Y = 18;
const SHADOW_BLUR = 24;
const SHADOW_OPACITY = 0.14;

async function withDropShadow(
  buf: Buffer,
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

  // Grayscale blur of the alpha channel avoids premultiplied-alpha fringes.
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
      (blurredGrey[i * ch] as number) * SHADOW_OPACITY,
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

/** Round the corners and draw a hairline just inside the edge. */
async function frame(
  buf: Buffer,
  radius: number,
  mode: Mode,
): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="white"/></svg>`,
  );
  const stroke = 2;
  const hairline = Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="${stroke / 2}" y="${stroke / 2}" width="${w - stroke}" height="${h - stroke}" rx="${radius}" ry="${radius}" fill="none" stroke="${FRAME[mode].hairline}" stroke-width="${stroke}"/></svg>`,
  );
  return sharp(buf)
    .ensureAlpha()
    .composite([
      { input: mask, blend: "dest-in" },
      { input: hairline, blend: "over" },
    ])
    .png()
    .toBuffer();
}

// The chrome bar is rendered at the same pixel density as the Playwright
// screenshot (deviceScaleFactor: 2), so its height is 2× the logical 40pt.
const CHROME_BAR_H = 80;

/**
 * A quiet browser bar in the app's neutrals: hairline window dots and an
 * address field, no colour. The editorial direction keeps colour for the one
 * yellow fill inside the app.
 */
function makeBrowserChromeSvg(width: number, height: number, mode: Mode): string {
  const { bar, hairline, fill } = FRAME[mode];
  const dotY = Math.round(height / 2);
  const cx = Math.round(width / 2);
  const dots = [32, 60, 88]
    .map(
      (x) =>
        `<circle cx="${x}" cy="${dotY}" r="9" fill="none" stroke="${hairline}" stroke-width="2"/>`,
    )
    .join("");
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${bar}"/>
    <rect x="0" y="${height - 2}" width="${width}" height="2" fill="${hairline}"/>
    ${dots}
    <rect x="${cx - 280}" y="${dotY - 18}" width="560" height="36" rx="10" fill="${fill}"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Local D1: migrations, demo seed, storage sync
// ---------------------------------------------------------------------------

const D1_STATE = join(WORKSPACE_ROOT, ".wrangler/state");
const WRANGLER = join(WORKSPACE_ROOT, "src/api/node_modules/.bin/wrangler");
const D1_CONFIGS = ["src/api/wrangler.jsonc", "src/web/wrangler.jsonc"];

function wrangler(args: string[]): void {
  execFileSync(WRANGLER, args, {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env, CI: "true" },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
}

/** The Clerk user id for the account the capture signs in as. */
async function clerkUserId(email: string): Promise<string> {
  if (process.env.MARKETING_USER_ID) return process.env.MARKETING_USER_ID;
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
  );
  if (!res.ok) {
    throw new Error(`Clerk user lookup failed: ${res.status} ${await res.text()}`);
  }
  const users = (await res.json()) as { id: string }[];
  if (!users[0]) throw new Error(`No Clerk user with email ${email}`);
  return users[0].id;
}

/**
 * Apply migrations and replace the capture account's data with the demo set
 * (seed.ts), against both workers' configs like `bun run db:migrate` does.
 * Runs inside the web capture phase, so a failure here degrades to the cached
 * screenshots like any other capture flake.
 */
async function seedDemoData(): Promise<void> {
  const email = process.env.CLERK_MARKETING_USER_EMAIL as string;
  const userId = await clerkUserId(email);
  const sqlPath = join(SOURCE_DIR, "seed.sql");
  writeFileSync(
    sqlPath,
    buildSeedSql({ userId, email, timeZone: manifest.web.timezone }),
  );
  for (const config of D1_CONFIGS) {
    const common = ["--local", "--persist-to", D1_STATE, "-c", config];
    wrangler(["d1", "migrations", "apply", "DB", ...common]);
    wrangler(["d1", "execute", "DB", ...common, `--file=${sqlPath}`]);
  }
  console.log(`  Seeded demo data for ${email} (${userId})`);
}

/**
 * `wrangler d1 migrations apply` / `d1 execute` and @cloudflare/vite-plugin's
 * bundled Miniflare resolve the same `database_id` to two different local
 * sqlite files under .wrangler/state/v3/d1/miniflare-D1DatabaseObject/ —
 * version skew between wrangler's standalone D1 CLI and the vite-plugin's
 * embedded Miniflare. The plugin's file is created lazily on the dev server's
 * first D1 access (not at boot), so it doesn't exist yet when migrations run,
 * and every server-function DB query 500s with "no such table" until something
 * populates it. Copy the migrated (larger) file onto any smaller sibling so
 * whichever one the dev server actually resolves to has the right schema and
 * seed data.
 */
function syncLocalD1Storage(): void {
  const d1Dir = join(D1_STATE, "v3/d1/miniflare-D1DatabaseObject");
  if (!existsSync(d1Dir)) {
    console.log(`  [d1-sync] ${d1Dir} does not exist, skipping`);
    return;
  }
  const files = readdirSync(d1Dir).filter(
    (f) => f.endsWith(".sqlite") && f !== "metadata.sqlite",
  );
  const bySize = files
    .map((f) => ({ f, size: statSync(join(d1Dir, f)).size }))
    .sort((a, b) => b.size - a.size);
  console.log(
    `  [d1-sync] found ${bySize.length} db file(s): ${JSON.stringify(bySize)}`,
  );
  if (bySize.length < 2) return;

  const [source, ...rest] = bySize;
  for (const { f } of rest) {
    console.log(
      `  [d1-sync] copying ${source.f} (${source.size}b) → ${f} (${statSync(join(d1Dir, f)).size}b)`,
    );
    copyFileSync(join(d1Dir, source.f), join(d1Dir, f));
    for (const ext of ["-wal", "-shm"]) {
      const sidecar = join(d1Dir, f + ext);
      if (existsSync(sidecar)) unlinkSync(sidecar);
    }
  }
}

// ---------------------------------------------------------------------------
// Capture — web
// ---------------------------------------------------------------------------

/** A seeded title that only renders once D1 and the session both work. */
const READY_TEXT = "Review PR for the sync engine";

async function captureWebScreenshots(): Promise<void> {
  const emailAddress = process.env.CLERK_MARKETING_USER_EMAIL as string;

  await seedDemoData();

  // Write a temporary .dev.vars so the workerd SSR environment has the Clerk
  // secrets it needs. In local dev this file already exists (gitignored); in
  // CI it doesn't, so Clerk middleware would crash without it.
  const devVarsPath = join(WORKSPACE_ROOT, "src/web/.dev.vars");
  const devVarsExisted = existsSync(devVarsPath);
  if (!devVarsExisted) {
    writeFileSync(
      devVarsPath,
      [
        `VITE_CLERK_PUBLISHABLE_KEY=${process.env.VITE_CLERK_PUBLISHABLE_KEY}`,
        `CLERK_SECRET_KEY=${process.env.CLERK_SECRET_KEY}`,
      ].join("\n"),
    );
  }

  // Spawn the dev server on 127.0.0.1 (vite otherwise binds IPv6-only on
  // some machines) and wait for it to accept connections. Vite's cold
  // dependency-optimizer scan occasionally races on a fresh CI install and
  // the server never finishes booting — a known one-off flake, so retry with
  // a fresh process once before giving up.
  function startDevServer() {
    console.log(`  Starting web dev server on ${WEB_URL}…`);
    const proc = spawn(
      join(WORKSPACE_ROOT, "src/web/node_modules/.bin/vite"),
      ["dev", "--port", String(WEB_PORT), "--strictPort", "--host", "127.0.0.1"],
      {
        cwd: join(WORKSPACE_ROOT, "src/web"),
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        // Own process group, so killDevServer can signal its children too.
        detached: true,
      },
    );
    // Buffer the server's output (capped) so we can surface it if the server
    // never comes up — otherwise a boot failure is invisible in CI logs.
    const log: string[] = [];
    const captureLine = (chunk: Buffer) => {
      log.push(chunk.toString());
      if (log.length > 200) log.splice(0, log.length - 200);
    };
    proc.stderr?.on("data", captureLine);
    proc.stdout?.on("data", captureLine);
    return { proc, log };
  }

  async function killDevServer(proc: ReturnType<typeof spawn>) {
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        if (proc.pid) process.kill(-proc.pid, signal);
      } catch {
        /* already dead */
      }
    };
    killGroup("SIGTERM");
    await sleep(500);
    killGroup("SIGKILL");
  }

  let server = startDevServer();

  try {
    let ready = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await waitForUrl(WEB_URL, 120_000);
        ready = true;
        break;
      } catch (err) {
        const tail = server.log.join("").trimEnd();
        console.error(
          `  Dev server never became ready (attempt ${attempt}/2). Recent output:`,
        );
        console.error(tail ? tail : "  (server produced no output)");
        await killDevServer(server.proc);
        if (attempt === 2) throw err;
        console.log("  Retrying with a fresh dev server process…");
        server = startDevServer();
      }
    }
    if (!ready) throw new Error("Dev server never became ready after retry");
    const serverLog = server.log;
    console.log(`  Dev server ready at ${WEB_URL}`);

    const { chromium } = await import("playwright");
    const { clerk, clerkSetup } = await import("@clerk/testing/playwright");

    // Derives the Frontend API URL from the publishable key and fetches a
    // testing token — must be called before any clerk.signIn calls.
    await clerkSetup({ publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY });

    const browser = await chromium.launch();

    for (const shot of manifest.web.shots) {
      for (const mode of MODES) {
        const name = webAsset(shot.name, mode);
        const context = await browser.newContext({
          viewport: shot.viewport,
          deviceScaleFactor: shot.scale,
          isMobile: shot.mobile ?? false,
          hasTouch: shot.mobile ?? false,
          colorScheme: mode,
          timezoneId: manifest.web.timezone,
          locale: "en-US",
        });
        const page = await context.newPage();

        // Navigate first (required before clerk.signIn), then sign in.
        // clerk.signIn with emailAddress uses CLERK_SECRET_KEY to create a
        // ticket internally — no manual token fetch needed.
        await page.goto(WEB_URL);
        await clerk.signIn({ page, emailAddress });

        // The dev server's first authenticated D1 access may lazily create a
        // sibling sqlite file the migrate/seed step never touched (see
        // syncLocalD1Storage) — sync onto it and reload if the seeded todos
        // don't show up, a few times in case that file takes a beat to
        // settle, before giving up.
        let found = false;
        let lastErr: unknown;
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            await page
              .getByText(READY_TEXT)
              .first()
              .waitFor({ state: "visible", timeout: 30_000 });
            found = true;
            break;
          } catch (err) {
            lastErr = err;
            console.log(`  [${name}] demo todos not found on attempt ${attempt}/4`);
            syncLocalD1Storage();
            await sleep(1000);
            await page.reload();
          }
        }
        if (!found) {
          const debugHtml = join(SOURCE_DIR, `debug-${name}.html`);
          const debugPng = join(SOURCE_DIR, `debug-${name}.png`);
          writeFileSync(debugHtml, await page.content());
          // Best-effort: don't let a screenshot failure mask lastErr below.
          await page
            .screenshot({ path: debugPng, fullPage: true })
            .catch((err) => console.log(`  Failed to capture ${debugPng}: ${err}`));
          console.log(`  Dumped ${debugHtml} and ${debugPng}`);
          const tail = serverLog.join("").trimEnd();
          console.log("  Dev server output at time of failure:");
          console.log(tail ? tail : "  (server produced no output)");
          throw lastErr;
        }

        // The dev server mounts the TanStack devtools launcher in the
        // bottom-right corner. Hide whatever top-level element sits there,
        // unless it's the app itself.
        await page.evaluate((ready) => {
          for (const inset of [24, 32, 40]) {
            let node = document.elementFromPoint(
              window.innerWidth - inset,
              window.innerHeight - inset,
            ) as HTMLElement | null;
            while (node?.parentElement && node.parentElement !== document.body) {
              node = node.parentElement;
            }
            if (node && node !== document.body && !node.textContent?.includes(ready)) {
              node.style.display = "none";
            }
          }
        }, READY_TEXT);
        // Nothing focused, no caret, no hover tint, transitions settled.
        await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
        await page.mouse.move(0, 0);
        await sleep(800);

        await page.screenshot({ path: sourcePath(name), fullPage: false });
        console.log(`  → ${name}.png`);
        await context.close();
      }
    }

    await browser.close();
  } finally {
    await killDevServer(server.proc);
    if (!devVarsExisted) unlinkSync(devVarsPath);
  }
}

// ---------------------------------------------------------------------------
// Capture — iOS simulator
// ---------------------------------------------------------------------------

interface SimDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable?: boolean;
}

function simctlJson<T>(args: string[]): T {
  const raw = execFileSync("xcrun", ["simctl", "list", ...args, "-j"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  return JSON.parse(raw) as T;
}

/**
 * Current CoreSimulator state ("Booted", "Shutdown", …) for a device.
 *
 * Timed out deliberately: when CoreSimulator is wedged — exactly when we're
 * asking — `simctl list` hangs rather than erroring, and an untimed call here
 * once burned ~110s inside a boot retry that was itself on a 120s budget. A
 * hung lookup is not worth waiting on; report it as unknown and let the
 * caller retry.
 */
function simulatorState(udid: string): string {
  try {
    const { devices } = simctlJson<{ devices: Record<string, SimDevice[]> }>([
      "devices",
    ]);
    return Object.values(devices).flat().find((d) => d.udid === udid)?.state ?? "unknown";
  } catch (err) {
    console.log(`  Could not read simulator state: ${describeError(err)}`);
    return "unknown";
  }
}

/**
 * Our own simulator for a device class, created on first use and reused by
 * later runs. The capture never borrows a simulator someone already has
 * booted: it shuts its device down at the end, and launches the app with
 * screenshot-only arguments.
 */
function ensureMarketingSimulator(device: DeviceKey): string {
  const spec = manifest.ios.devices[device];
  const { devices } = simctlJson<{ devices: Record<string, SimDevice[]> }>([
    "devices",
  ]);
  const existing = Object.values(devices)
    .flat()
    .find((d) => d.name === spec.simulator && d.isAvailable !== false);
  if (existing) return existing.udid;

  const { runtimes } = simctlJson<{
    runtimes: {
      identifier: string;
      platform?: string;
      version: string;
      isAvailable: boolean;
    }[];
  }>(["runtimes"]);
  const runtime = runtimes
    .filter((r) => r.isAvailable && (r.platform ?? "iOS") === "iOS" && r.identifier.includes("iOS"))
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
    .at(-1);
  if (!runtime) throw new Error("No available iOS simulator runtime");

  const { devicetypes } = simctlJson<{
    devicetypes: { name: string; identifier: string }[];
  }>(["devicetypes"]);
  const type = spec.types
    .map((name) => devicetypes.find((t) => t.name === name))
    .find(Boolean);
  if (!type) {
    throw new Error(`None of ${spec.types.join(", ")} is available to create`);
  }

  console.log(`  Creating simulator "${spec.simulator}" (${type.name}, ${runtime.identifier})…`);
  return execFileSync(
    "xcrun",
    ["simctl", "create", spec.simulator, type.identifier, runtime.identifier],
    { encoding: "utf8", timeout: 60_000 },
  ).trim();
}

/**
 * Boot a simulator and block until it is *fully* booted, throwing if it can't
 * get there. Under CI load CoreSimulator can drop a freshly-booted device back
 * to Shutdown, so lean on `simctl bootstatus -b` (which boots if needed and
 * blocks until the device reports booted), verify the state, and retry the
 * whole cycle a few times before giving up loudly.
 */
async function ensureBooted(udid: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    spawnSync("xcrun", ["simctl", "bootstatus", udid, "-b"], {
      stdio: "pipe",
      timeout: 120_000,
    });
    const state = simulatorState(udid);
    console.log(`  Simulator state: ${state}`);
    if (state === "Booted") return;
    console.log(`  boot attempt ${attempt} did not reach Booted, retrying…`);
    // Reset to a known state before the next attempt so bootstatus starts clean.
    spawnSync("xcrun", ["simctl", "shutdown", udid], {
      stdio: "pipe",
      timeout: 30_000,
    });
    await sleep(5000);
  }
  throw new Error(`Simulator ${udid} failed to reach Booted state`);
}

/**
 * Open the simulator window before booting. On CI runners `simctl io
 * screenshot` times out unless the window server has attached to the device's
 * framebuffer, which only happens when the app is running before boot. Xcode
 * 27 renamed Simulator.app to DeviceHub.app, so try both. Best-effort.
 */
async function openSimulatorWindow(): Promise<void> {
  if (process.env.MARKETING_SIM_HEADLESS === "1") return;
  const opened =
    spawnSync("open", ["-a", "Simulator"], { stdio: "pipe" }).status === 0 ||
    spawnSync(
      "open",
      ["/Applications/Xcode.app/Contents/Applications/DeviceHub.app"],
      { stdio: "pipe" },
    ).status === 0;
  if (!opened) {
    console.log("  No Simulator window app found; continuing headless.");
    return;
  }
  for (let i = 0; i < 30; i++) {
    const running = ["Simulator", "DeviceHub"].some(
      (name) => spawnSync("pgrep", ["-x", name], { stdio: "pipe" }).status === 0,
    );
    if (running) break;
    await sleep(1000);
  }
  await sleep(2000); // settle time for the window server connection
}

let builtAppPath: string | undefined;

/** Build the Debug app once; both device classes install the same bundle. */
function buildIOSApp(udid: string): string {
  if (builtAppPath) return builtAppPath;
  const { project, scheme } = manifest.ios;
  const derivedDataPath =
    process.env.MARKETING_DERIVED_DATA ??
    join("/tmp", "nylon-impossible-marketing-build");
  console.log(`  Building iOS app (${scheme}) for simulator…`);
  execSync(
    [
      "xcodebuild build",
      `-project "${join(WORKSPACE_ROOT, project)}"`,
      `-scheme "${scheme}"`,
      "-configuration Debug",
      `-destination "platform=iOS Simulator,id=${udid}"`,
      `-derivedDataPath "${derivedDataPath}"`,
      "-quiet",
    ].join(" "),
    { stdio: "inherit" },
  );
  const appPath = join(
    derivedDataPath,
    "Build/Products/Debug-iphonesimulator",
    `${scheme}.app`,
  );
  if (!existsSync(appPath)) throw new Error(`App not found after build: ${appPath}`);
  console.log("  App built");
  builtAppPath = appPath;
  return appPath;
}

/** Retry a simulator command, re-booting between attempts. */
async function withSimRetries(
  label: string,
  udid: string,
  run: () => void,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      run();
      return;
    } catch (err) {
      lastErr = err;
      console.log(`  ${label} attempt ${attempt} failed: ${describeError(err)}`);
      await sleep(5000);
      // Install and launch fail with SimError 405 when the device has slipped
      // back to Shutdown under CI load, so make sure it's booted again.
      await ensureBooted(udid);
    }
  }
  throw lastErr;
}

/**
 * Capture every manifest shot for one device class through the DEBUG
 * screenshot routes: `-NylonScreen <route>` skips sign-in and draws the app's
 * sample data, `-NylonDark YES` forces dark, and `-NylonLandscape YES` draws
 * an iPad run at landscape size turned a quarter clockwise (iPadOS 26 won't
 * rotate a windowed scene on request), which we turn back here.
 */
async function captureIOSDevice(device: DeviceKey): Promise<void> {
  const { bundleId } = manifest.ios;
  const udid = ensureMarketingSimulator(device);
  const appPath = buildIOSApp(udid);

  await ensureBooted(udid);
  // App Store-style status bar: 9:41, full battery and signal.
  spawnSync(
    "xcrun",
    [
      "simctl", "status_bar", udid, "override",
      "--time", "9:41",
      "--batteryState", "charged", "--batteryLevel", "100",
      "--cellularMode", "active", "--cellularBars", "4",
      "--wifiMode", "active", "--wifiBars", "3",
    ],
    { stdio: "pipe", timeout: 30_000 },
  );

  console.log(`  Installing app on ${device}…`);
  await withSimRetries("install", udid, () =>
    execFileSync("xcrun", ["simctl", "install", udid, appPath], {
      stdio: "pipe",
      timeout: 120_000,
    }),
  );

  // Warm-up launch: the first launch after install pays for dyld and font
  // registration, and a freshly booted simulator posts first-run banners
  // ("Ready for Apple Intelligence") that would otherwise land in the first
  // shots. Give both time to clear before capturing anything.
  const firstShot = manifest.ios.shots.find((s) => s.device === device);
  await withSimRetries("launch", udid, () =>
    execFileSync(
      "xcrun",
      ["simctl", "launch", "--terminate-running-process", udid, bundleId,
        "-NylonScreen", firstShot?.screen ?? "today"],
      { stdio: "pipe", timeout: 120_000 },
    ),
  );
  await sleep(20_000);

  for (const shot of manifest.ios.shots.filter((s) => s.device === device)) {
    for (const mode of MODES) {
      const name = `${iosShotName(shot)}-${mode}`;
      spawnSync("xcrun", ["simctl", "ui", udid, "appearance", mode], {
        stdio: "pipe",
        timeout: 30_000,
      });
      const launchArgs = [
        "-NylonScreen", shot.screen,
        "-NylonDark", mode === "dark" ? "YES" : "NO",
        "-NylonLandscape", shot.landscape ? "YES" : "NO",
      ];
      await withSimRetries("launch", udid, () =>
        // --terminate-running-process: each shot is a fresh launch with its
        // own route, and a half-launched app would otherwise fail the next.
        execFileSync(
          "xcrun",
          ["simctl", "launch", "--terminate-running-process", udid, bundleId, ...launchArgs],
          { stdio: "pipe", timeout: 120_000 },
        ),
      );
      await sleep(4_000);

      const raw = join(SOURCE_DIR, `${name}.raw.png`);
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          execFileSync("xcrun", ["simctl", "io", udid, "screenshot", raw], {
            stdio: "pipe",
            timeout: 60_000,
          });
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          console.log(`  screenshot attempt ${attempt} failed: ${describeError(err)}`);
          await sleep(3000);
        }
      }
      if (lastErr) throw lastErr;

      // Landscape runs are drawn turned a quarter clockwise; turn them back.
      await sharp(raw)
        .rotate(shot.landscape ? 270 : 0)
        .png()
        .toFile(sourcePath(name));
      unlinkSync(raw);
      console.log(`  → ${name}.png`);
    }
  }

  spawnSync("xcrun", ["simctl", "terminate", udid, bundleId], { stdio: "pipe" });
  spawnSync("xcrun", ["simctl", "status_bar", udid, "clear"], { stdio: "pipe" });
  console.log(`  Shutting down ${device} simulator…`);
  spawnSync("xcrun", ["simctl", "shutdown", udid], { stdio: "pipe", timeout: 60_000 });
}

// ---------------------------------------------------------------------------
// Capture orchestration
// ---------------------------------------------------------------------------

/**
 * How each source PNG got here.
 *
 *   fresh    captured by this run
 *   cached   capture failed, but a previous run's PNG was restored into
 *            source/ and is being reused
 *   skipped  capture deliberately not attempted (--skip-ios)
 *   missing  no PNG at all — the composite can't be built
 */
type AssetStatus = "fresh" | "cached" | "skipped" | "missing";

const captureStatus = new Map<string, AssetStatus>();

function sourcePath(asset: string): string {
  return join(SOURCE_DIR, `${asset}.png`);
}

/** mtime in ms, or undefined when the file isn't there. */
function sourceStamp(asset: string): number | undefined {
  const path = sourcePath(asset);
  return existsSync(path) ? statSync(path).mtimeMs : undefined;
}

/**
 * Run one capture phase, tolerating failure when a previous run's screenshots
 * are still on disk.
 *
 * Every red "Deploy to Cloudflare" run in the weeks before this was written was
 * this job, and never the deploy itself: a Vite optimizer race, a Clerk sign-in
 * timeout, the composer selector not appearing, `simctl launch` timing out. Each
 * one got a retry bolted on afterwards, and a new one showed up next. They are
 * all transient failures of a *cosmetic* step, so stop treating them as fatal.
 *
 * The workflow restores the last successful capture into source/ before this
 * runs, so falling back to it makes the composite byte-identical to what's
 * already published — the publish step then no-ops on "nothing to commit" and
 * the flake costs a warning annotation instead of a red run. A genuinely
 * broken capture still fails loudly, because there'd be no PNG to fall back to
 * (and --strict turns any fallback into a failure).
 */
async function capturePhase(
  label: string,
  assets: readonly string[],
  capture: () => Promise<void>,
): Promise<void> {
  const before = new Map(assets.map((a) => [a, sourceStamp(a)]));
  try {
    await capture();
  } catch (err) {
    console.error(`  ✘ ${label} capture failed: ${describeError(err)}`);
  }
  for (const asset of assets) {
    const after = sourceStamp(asset);
    captureStatus.set(
      asset,
      after === undefined
        ? "missing"
        : after === before.get(asset)
          ? "cached"
          : "fresh",
    );
  }
}

/**
 * Report what we ended up with, and decide whether that's good enough.
 *
 * Writes source/capture-status.json so the workflow can tell a fresh iOS
 * capture (safe to cache under the current app revision) from a reused one
 * (caching it would pin stale screenshots to a revision they don't belong to).
 */
function finishCapture(): void {
  const statuses = Object.fromEntries(captureStatus);
  writeFileSync(
    join(SOURCE_DIR, "capture-status.json"),
    `${JSON.stringify(statuses, null, 2)}\n`,
  );

  const missing = [...captureStatus].filter(([, v]) => v === "missing");
  const reused = [...captureStatus].filter(([, v]) => v === "cached");

  for (const [asset] of reused) {
    // ::warning:: surfaces on the run summary even though the job stays green.
    console.log(
      `::warning title=Marketing screenshot reused::${asset}.png could not be captured; reusing the previous one`,
    );
  }

  console.log("\n  Capture summary:");
  for (const [asset, status] of captureStatus) {
    console.log(`    ${asset.padEnd(36)} ${status}`);
  }

  if (missing.length > 0) {
    throw new Error(
      `No screenshot available for: ${missing.map(([a]) => a).join(", ")}. ` +
        "Capture failed and there was nothing cached to fall back to.",
    );
  }
  if (strictCapture && reused.length > 0) {
    throw new Error(
      `--strict: reused previous screenshots for ${reused.map(([a]) => a).join(", ")}`,
    );
  }
}

async function captureIOSPhases(): Promise<void> {
  // The iOS screenshots only change when the app does, but building the app
  // and booting a simulator is the slowest and least reliable part of this
  // job — so don't do it on a web-only deploy. The cache lookup upstream
  // decides; here we just double-check the PNGs it claimed to restore exist.
  const iosCached = IOS_ASSETS.every((a) => existsSync(sourcePath(a)));
  if (skipIOSCapture && iosCached) {
    console.log("  Reusing cached iOS screenshots (app unchanged).");
    for (const asset of IOS_ASSETS) captureStatus.set(asset, "skipped");
    return;
  }
  if (skipIOSCapture) {
    console.log("  iOS capture was skippable, but no cached PNGs found.");
  }
  await openSimulatorWindow();
  // One phase per device class, so an iPad flake can't throw away a good
  // iPhone run (or the other way round).
  for (const device of DEVICES) {
    await capturePhase(`ios ${device}`, iosAssets(device), () =>
      captureIOSDevice(device),
    );
  }
}

async function runCaptureStep(opts: { web: boolean; ios: boolean }): Promise<void> {
  console.log("\n── Capture ──────────────────────────────────────");
  mkdirSync(SOURCE_DIR, { recursive: true });
  if (opts.web) await capturePhase("web", WEB_ASSETS, captureWebScreenshots);
  if (opts.ios) await captureIOSPhases();
  finishCapture();
}

// ---------------------------------------------------------------------------
// Composites
// ---------------------------------------------------------------------------

type Composite = { input: Buffer; left: number; top: number };

/** Desktop web shot in a quiet browser frame, scaled to `width`. */
async function browserLayer(p: Placement, mode: Mode): Promise<Composite> {
  const webImg = await sharp(sourcePath(`${p.shot}-${mode}`)).ensureAlpha().toBuffer();
  const meta = await sharp(webImg).metadata();
  const webW = meta.width ?? 0;
  const chromeImg = await sharp(
    Buffer.from(makeBrowserChromeSvg(webW, CHROME_BAR_H, mode)),
  )
    .png()
    .toBuffer();

  const window = await sharp({
    create: {
      width: webW,
      height: (meta.height ?? 0) + CHROME_BAR_H,
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

  const resized = await sharp(window).resize(p.width).png().toBuffer();
  const framed = await frame(resized, 14, mode);
  const { image, padLeft, padTop } = await withDropShadow(framed);
  return { input: image, left: p.left - padLeft, top: p.top - padTop };
}

/** A device screenshot with its display's rounded corners, scaled to `width`. */
async function deviceLayer(
  p: Placement,
  mode: Mode,
  radiusRatio: number,
): Promise<Composite> {
  const img = await sharp(sourcePath(`${p.shot}-${mode}`))
    .resize(p.width)
    .ensureAlpha()
    .png()
    .toBuffer();
  const framed = await frame(img, Math.round(p.width * radiusRatio), mode);
  const { image, padLeft, padTop } = await withDropShadow(framed);
  return { input: image, left: p.left - padLeft, top: p.top - padTop };
}

/** iPhone display corners are ~13% of its width; the iPad's are far tighter. */
const IPHONE_RADIUS = 0.13;
const IPAD_RADIUS = 0.022;

async function writeComposite(
  name: string,
  mode: Mode,
  layers: Composite[],
): Promise<string[]> {
  const { canvas, backgrounds } = manifest.composite;
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const written: string[] = [];

  const composited = await sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 3,
      background: backgrounds[mode],
    },
  })
    .composite(layers)
    .jpeg({ quality: 95 })
    .toBuffer();

  const jpg2x = join(OUTPUT_DIR, `${name}-${mode}@2x.jpg`);
  const jpg1x = join(OUTPUT_DIR, `${name}-${mode}.jpg`);
  await sharp(composited).toFile(jpg2x);
  await sharp(composited)
    .resize(Math.round(canvas.width / 2), Math.round(canvas.height / 2))
    .jpeg({ quality: 95 })
    .toFile(jpg1x);
  written.push(jpg2x, jpg1x);

  if (manifest.composite.png) {
    const transparent = await sharp({
      create: {
        width: canvas.width,
        height: canvas.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(layers)
      .png()
      .toBuffer();
    const png2x = join(OUTPUT_DIR, `${name}-${mode}@2x.png`);
    const png1x = join(OUTPUT_DIR, `${name}-${mode}.png`);
    await sharp(transparent).toFile(png2x);
    await sharp(transparent)
      .resize(Math.round(canvas.width / 2), Math.round(canvas.height / 2))
      .png()
      .toFile(png1x);
    written.push(png2x, png1x);
  }
  for (const file of written) console.log(`  → ${file}`);
  return written;
}

/** The landing-page composite: desktop browser behind, iPhone in front. */
async function compositeBrowser(mode: Mode): Promise<void> {
  const { web, phone } = manifest.composite.browser;
  await writeComposite("nylon-screenshot", mode, [
    await browserLayer(web, mode),
    await deviceLayer(phone, mode, IPHONE_RADIUS),
  ]);
}

/** The iPad variant: the landscape board behind, iPhone in front. */
async function compositeIPad(mode: Mode): Promise<void> {
  const { tablet, phone } = manifest.composite.ipad;
  await writeComposite("nylon-screenshot-ipad", mode, [
    await deviceLayer(tablet, mode, IPAD_RADIUS),
    await deviceLayer(phone, mode, IPHONE_RADIUS),
  ]);
}

/**
 * Raw device screenshots grouped by App Store display class, numbered in
 * manifest order — ready to drag into App Store Connect, which is a manual
 * step. App Store Connect rejects screenshots with an alpha channel, so they're
 * flattened; a size that doesn't match the display class is flagged, not fixed.
 */
async function writeAppStoreSet(): Promise<void> {
  rmSync(APP_STORE_DIR, { recursive: true, force: true });
  const counters = new Map<DeviceKey, number>();
  for (const shot of manifest.ios.shots) {
    const spec = manifest.ios.devices[shot.device];
    const dir = join(APP_STORE_DIR, spec.appStore);
    mkdirSync(dir, { recursive: true });
    const n = (counters.get(shot.device) ?? 0) + 1;
    counters.set(shot.device, n);
    const expected = shot.landscape
      ? { width: spec.size.height, height: spec.size.width }
      : spec.size;
    for (const mode of MODES) {
      const src = sourcePath(`${iosShotName(shot)}-${mode}`);
      if (!existsSync(src)) {
        console.warn(`  ⚠ ${src} not found, skipping`);
        continue;
      }
      const label = `${shot.screen}${shot.landscape ? "-landscape" : ""}`;
      const dest = join(dir, `${String(n).padStart(2, "0")}-${label}-${mode}.png`);
      const meta = await sharp(src).metadata();
      if (meta.width !== expected.width || meta.height !== expected.height) {
        console.log(
          `::warning title=App Store screenshot size::${dest} is ${meta.width}×${meta.height}, expected ${expected.width}×${expected.height} for ${spec.appStore}`,
        );
      }
      await sharp(src).flatten({ background: "#ffffff" }).png().toFile(dest);
      console.log(`  → ${dest}`);
    }
  }
}

/**
 * WebP product shots for the web app's signed-out landing page. Copy them
 * into src/web/public/images/landing/ to refresh what the page shows.
 */
async function writeLandingImages(): Promise<void> {
  mkdirSync(LANDING_DIR, { recursive: true });
  const shots: [string, string, number][] = [
    ["board", "web-desktop", 1600],
    ["phone", "ios-iphone-today", 660],
  ];
  for (const [name, asset, width] of shots) {
    for (const mode of MODES) {
      const src = sourcePath(`${asset}-${mode}`);
      if (!existsSync(src)) continue;
      const dest = join(LANDING_DIR, `${name}-${mode}.webp`);
      await sharp(src).resize(width).webp({ quality: 82 }).toFile(dest);
      console.log(`  → ${dest}`);
    }
  }
}

async function runWebStep(): Promise<void> {
  console.log("\n── Web composites ───────────────────────────────");
  for (const mode of MODES) await compositeBrowser(mode);
  for (const mode of MODES) await compositeIPad(mode);
  console.log("\n── App Store set ────────────────────────────────");
  await writeAppStoreSet();
  console.log("\n── Landing images ───────────────────────────────");
  await writeLandingImages();
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

  const files = ["nylon-screenshot", "nylon-screenshot-ipad"].flatMap((name) =>
    MODES.flatMap((mode) => [
      `${name}-${mode}@2x.jpg`,
      `${name}-${mode}.jpg`,
      ...(manifest.composite.png ? [`${name}-${mode}@2x.png`, `${name}-${mode}.png`] : []),
    ]),
  );

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

  execSync(`git -C "${WEBSITE_DIR}" add ${copied.map((f) => `"${f}"`).join(" ")}`);
  try {
    execSync(
      `git -C "${WEBSITE_DIR}" commit -m "Update Nylon Impossible marketing screenshots"`,
      { stdio: "inherit" },
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

/**
 * execSync/spawnSync bury the actual reason in the captured stderr, so a bare
 * `err.message` reads "Command failed" and every retry log line in CI has been
 * useless. Pull the streams out too.
 */
function describeError(err: unknown): string {
  const e = err as {
    message?: string;
    stderr?: Buffer | string;
    stdout?: Buffer | string;
  };
  const parts = [e?.message ?? String(err)];
  for (const stream of [e?.stderr, e?.stdout]) {
    const text = stream?.toString().trim();
    if (text) parts.push(text);
  }
  return parts.join(" — ");
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

  if (runCapture) {
    await runCaptureStep({ web: true, ios: true });
  } else if (runCaptureWeb || runCaptureIOS) {
    await runCaptureStep({ web: runCaptureWeb, ios: runCaptureIOS });
  }
  if (runWeb) await runWebStep();
  if (runPublish) runPublishStep();

  console.log("\nDone.");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
