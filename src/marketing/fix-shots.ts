#!/usr/bin/env tsx
/**
 * Before/after screenshots for a feedback fix PR (feedback.yml).
 *
 * Usage:
 *   npx tsx fix-shots.ts capture --plan <plan.json> --as before|after --out <dir>
 *   npx tsx fix-shots.ts report --plan <plan.json> --out <dir> --base <url>
 *       [--before-sha <sha>] [--after-sha <sha>]
 *
 * Claude writes the plan while fixing the issue: which DEBUG screen routes
 * (`-NylonScreen`, see ScreenRoute.swift) show the change, on which device,
 * in which appearance — or why there's nothing a still image could show.
 *
 *   { "shots": [{ "device": "iphone", "screen": "detail", "dark": true,
 *                 "note": "The close button sits clear of the grabber" }] }
 *   { "skip": "Gesture fix: a still image looks the same before and after." }
 *
 * The workflow runs `capture` on main (`--as before`) and on the fix branch
 * (`--as after`) — same derived data, so the second build is incremental —
 * then commits the PNGs to feedback-assets and puts `report`'s Markdown in
 * the PR body. Capture is best-effort per shot: a failure is recorded in
 * <dir>/status-<as>.json and shown in the report, never thrown.
 *
 * Routes run on in-memory sample data with no account, so nothing personal
 * ends up in the (public) images.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  describeError,
  ensureBooted,
  ensureSimulator,
  openSimulatorWindow,
  sleep,
  withSimRetries,
} from "./simulator";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "../..");

interface Manifest {
  timeZone: string;
  ios: {
    project: string;
    scheme: string;
    bundleId: string;
    devices: Record<"iphone" | "ipad", { types: string[] }>;
  };
}
const manifest: Manifest = JSON.parse(readFileSync(join(SCRIPT_DIR, "manifest.json"), "utf8"));

type Device = "iphone" | "ipad" | "mac";
const DEVICES: Device[] = ["iphone", "ipad", "mac"];
const DEVICE_LABEL: Record<Device, string> = { iphone: "iPhone", ipad: "iPad", mac: "Mac" };
const MAX_SHOTS = 4;

interface Shot {
  device: Device;
  screen: string;
  dark?: boolean;
  landscape?: boolean;
  note?: string;
}

interface Plan {
  shots?: Shot[];
  skip?: string;
}

/** Per image, keyed by file name. */
type Status = Record<string, { ok: true } | { ok: false; error: string }>;

// Our own simulators, so a capture never touches one the marketing run (or a
// person) is using.
const SIMULATOR_NAME: Record<"iphone" | "ipad", string> = {
  iphone: "Nylon Fix iPhone",
  ipad: "Nylon Fix iPad",
};

// Kept between the before and after runs: switching branches and building
// again only recompiles what the fix touched.
const DERIVED_DATA = {
  ios: process.env.FIX_SHOTS_DERIVED_DATA_IOS ?? "/tmp/nylon-fix-shots-ios",
  mac: process.env.FIX_SHOTS_DERIVED_DATA_MAC ?? "/tmp/nylon-fix-shots-mac",
};

// ---------------------------------------------------------------------------
// Arguments and plan
// ---------------------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);

function option(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}

function required(name: string): string {
  const value = option(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

/**
 * The plan comes from the model, so check it rather than trust it: a screen
 * name ends up as a launch argument and in a file name.
 */
function readPlan(path: string): Plan {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Plan;
  if (typeof raw?.skip === "string" && raw.skip.trim()) return { skip: plainText(raw.skip) };
  const candidates: Shot[] = Array.isArray(raw?.shots) ? raw.shots : [];
  const shots = candidates
    .filter((shot) => {
      const ok =
        typeof shot === "object" &&
        shot !== null &&
        DEVICES.includes(shot.device) &&
        typeof shot.screen === "string" &&
        /^[a-z]{2,20}$/.test(shot.screen);
      if (!ok) console.log(`  Ignoring an invalid shot: ${JSON.stringify(shot)}`);
      return ok;
    })
    .slice(0, MAX_SHOTS)
    .map((shot) => ({ ...shot, note: typeof shot.note === "string" ? plainText(shot.note) : undefined }));
  return { shots };
}

/**
 * Model text bound for a public PR body: one line, no table breaks, HTML or
 * links, and @mentions broken with a zero-width space so nobody gets pinged.
 */
function plainText(text: string): string {
  return text
    .replace(/[|\n<>[\]]/g, " ")
    .replace(/@/g, "@\u200b")
    .trim()
    .slice(0, 200);
}

function shotName(shot: Shot, index: number): string {
  const mode = shot.dark ? "dark" : "light";
  return `${index + 1}-${shot.device}-${shot.screen}-${mode}${shot.landscape ? "-landscape" : ""}`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function xcodebuild(destination: string, derivedData: string, extra: string[] = []): void {
  execFileSync(
    "xcodebuild",
    [
      "build",
      "-project", join(WORKSPACE_ROOT, manifest.ios.project),
      "-scheme", manifest.ios.scheme,
      "-configuration", "Debug",
      "-destination", destination,
      "-derivedDataPath", derivedData,
      "-quiet",
      ...extra,
    ],
    { stdio: "inherit" },
  );
}

function builtApp(derivedData: string, products: string): string {
  const path = join(derivedData, "Build/Products", products, `${manifest.ios.scheme}.app`);
  if (!existsSync(path)) throw new Error(`App not found after build: ${path}`);
  return path;
}

// ---------------------------------------------------------------------------
// Capture — iOS simulator
// ---------------------------------------------------------------------------

const SIM_LAUNCH_ENV = { ...process.env, SIMCTL_CHILD_TZ: manifest.timeZone };

async function captureSimulator(
  device: "iphone" | "ipad",
  shots: { shot: Shot; dest: string }[],
  status: Status,
): Promise<void> {
  const { bundleId } = manifest.ios;
  const udid = ensureSimulator(SIMULATOR_NAME[device], manifest.ios.devices[device].types);
  await ensureBooted(udid);

  console.log(`  Building for the ${DEVICE_LABEL[device]} simulator…`);
  xcodebuild(`platform=iOS Simulator,id=${udid}`, DERIVED_DATA.ios);
  const app = builtApp(DERIVED_DATA.ios, "Debug-iphonesimulator");

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
  await withSimRetries("install", udid, () =>
    execFileSync("xcrun", ["simctl", "install", udid, app], { stdio: "pipe", timeout: 120_000 }),
  );
  // Warm-up launch, as in generate.ts: the first launch after install pays
  // for dyld and fonts, and a fresh simulator posts first-run banners.
  await withSimRetries("launch", udid, () =>
    execFileSync(
      "xcrun",
      ["simctl", "launch", "--terminate-running-process", udid, bundleId, "-NylonScreen", shots[0].shot.screen],
      { stdio: "pipe", timeout: 120_000, env: SIM_LAUNCH_ENV },
    ),
  );
  await sleep(15_000);

  for (const { shot, dest } of shots) {
    try {
      const mode = shot.dark ? "dark" : "light";
      spawnSync("xcrun", ["simctl", "ui", udid, "appearance", mode], { stdio: "pipe", timeout: 30_000 });
      await withSimRetries("launch", udid, () =>
        execFileSync(
          "xcrun",
          [
            "simctl", "launch", "--terminate-running-process", udid, bundleId,
            "-NylonScreen", shot.screen,
            "-NylonDark", shot.dark ? "YES" : "NO",
            "-NylonLandscape", shot.landscape ? "YES" : "NO",
          ],
          { stdio: "pipe", timeout: 120_000, env: SIM_LAUNCH_ENV },
        ),
      );
      await sleep(4_000);
      const raw = `${dest}.raw.png`;
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          execFileSync("xcrun", ["simctl", "io", udid, "screenshot", raw], { stdio: "pipe", timeout: 60_000 });
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
      await sharp(raw).rotate(shot.landscape ? 270 : 0).png().toFile(dest);
      unlinkSync(raw);
      status[basename(dest)] = { ok: true };
      console.log(`  → ${dest}`);
    } catch (err) {
      status[basename(dest)] = { ok: false, error: describeError(err).slice(0, 300) };
      console.log(`  ✗ ${dest}: ${describeError(err)}`);
    }
  }

  spawnSync("xcrun", ["simctl", "terminate", udid, bundleId], { stdio: "pipe" });
}

// ---------------------------------------------------------------------------
// Capture — Mac
// ---------------------------------------------------------------------------

// The app's largest on-screen window, by pid. Window numbers come from
// CGWindowList; owner and bounds need no Screen Recording permission.
const WINDOW_ID_SWIFT = `
import CoreGraphics
import Foundation
let pid = Int32(CommandLine.arguments[1])!
let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let windows = info.compactMap { w -> (Int, Double)? in
  guard (w[kCGWindowOwnerPID as String] as? Int32) == pid, (w[kCGWindowLayer as String] as? Int) == 0,
        let n = w[kCGWindowNumber as String] as? Int, let b = w[kCGWindowBounds as String] as? [String: Double]
  else { return nil }
  return (n, (b["Width"] ?? 0) * (b["Height"] ?? 0))
}
guard let best = windows.max(by: { $0.1 < $1.1 }) else { exit(1) }
print(best.0)
`;

function appPid(app: string): string | undefined {
  const result = spawnSync("pgrep", ["-nf", `${app}/Contents/MacOS/`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function quitMacApp(app: string): void {
  spawnSync("pkill", ["-f", `${app}/Contents/MacOS/`], { stdio: "pipe" });
}

async function captureMac(shots: { shot: Shot; dest: string }[], status: Status): Promise<void> {
  console.log("  Building for the Mac…");
  // Unsigned, as in ios-test.yml: CI has no Mac development profile.
  xcodebuild("platform=macOS", DERIVED_DATA.mac, ["CODE_SIGNING_ALLOWED=NO"]);
  const app = builtApp(DERIVED_DATA.mac, "Debug");
  const windowIdScript = join(DERIVED_DATA.mac, "window-id.swift");
  writeFileSync(windowIdScript, WINDOW_ID_SWIFT);

  for (const { shot, dest } of shots) {
    try {
      quitMacApp(app);
      await sleep(1000);
      // Through `open`, not the binary: launched directly, the app never
      // activates and puts up no window.
      execFileSync(
        "open",
        [
          "-n", "-F", "-a", app,
          "--env", `TZ=${manifest.timeZone}`,
          "--args",
          "-NylonScreen", shot.screen,
          "-NylonDark", shot.dark ? "YES" : "NO",
        ],
        { stdio: "pipe", timeout: 60_000 },
      );
      await sleep(8_000);
      const pid = appPid(app);
      if (!pid) throw new Error("The app didn't stay running");
      const windowId = execFileSync("swift", [windowIdScript, pid], { encoding: "utf8", timeout: 120_000 }).trim();
      // -o drops the window shadow, so the image is the window and nothing else.
      execFileSync("screencapture", ["-x", "-o", "-l", windowId, dest], { stdio: "pipe", timeout: 60_000 });
      status[basename(dest)] = { ok: true };
      console.log(`  → ${dest}`);
    } catch (err) {
      status[basename(dest)] = { ok: false, error: describeError(err).slice(0, 300) };
      console.log(`  ✗ ${dest}: ${describeError(err)}`);
    }
  }
  quitMacApp(app);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function capture(): Promise<void> {
  const plan = readPlan(required("plan"));
  const as = required("as");
  if (as !== "before" && as !== "after") throw new Error("--as is before or after");
  const out = resolve(required("out"));
  mkdirSync(out, { recursive: true });
  const status: Status = {};
  const statusPath = join(out, `status-${as}.json`);

  const shots = (plan.shots ?? []).map((shot, i) => ({ shot, dest: join(out, `${shotName(shot, i)}-${as}.png`) }));
  if (!shots.length) {
    console.log(plan.skip ? `  Skipped: ${plan.skip}` : "  The plan has no shots.");
    writeFileSync(statusPath, JSON.stringify(status, null, 2));
    return;
  }

  // One phase per device, so a simulator that won't boot loses its own shots
  // and nothing else.
  let windowOpen = false;
  for (const device of DEVICES) {
    const mine = shots.filter((s) => s.shot.device === device);
    if (!mine.length) continue;
    console.log(`\n── ${DEVICE_LABEL[device]} (${as}) ──`);
    try {
      if (device === "mac") {
        await captureMac(mine, status);
      } else {
        if (!windowOpen) {
          await openSimulatorWindow();
          windowOpen = true;
        }
        await captureSimulator(device, mine, status);
      }
    } catch (err) {
      for (const { dest } of mine) {
        status[basename(dest)] ??= { ok: false, error: describeError(err).slice(0, 300) };
      }
      console.log(`  ✗ ${DEVICE_LABEL[device]}: ${describeError(err)}`);
    }
    writeFileSync(statusPath, JSON.stringify(status, null, 2));
  }
  writeFileSync(statusPath, JSON.stringify(status, null, 2));
}

/** The PR body section: a Before | After row per shot, or why there are none. */
function report(): void {
  const plan = readPlan(required("plan"));
  const out = resolve(required("out"));
  const base = required("base").replace(/\/$/, "");
  const beforeSha = option("before-sha")?.slice(0, 7);
  const afterSha = option("after-sha")?.slice(0, 7);
  const readStatus = (as: string): Status => {
    const path = join(out, `status-${as}.json`);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  };
  const statuses = { before: readStatus("before"), after: readStatus("after") };

  const lines = ["### Before / after", ""];
  if (plan.skip || !plan.shots?.length) {
    lines.push(`No screenshots: ${plan.skip ?? "no screen to show."}`);
  } else {
    const from = [beforeSha && `\`main\` at ${beforeSha}`, afterSha && `this branch at ${afterSha}`]
      .filter(Boolean)
      .join(" and ");
    lines.push(
      `_DEBUG screen routes on sample data${from ? `, from ${from}` : ""}. Captured by the Feedback workflow._`,
      "",
      "| | Before | After |",
      "| --- | --- | --- |",
    );
    const width = (shot: Shot) => (shot.device === "mac" || shot.landscape ? 480 : shot.device === "ipad" ? 360 : 280);
    plan.shots.forEach((shot, i) => {
      const name = shotName(shot, i);
      const cell = (as: "before" | "after") => {
        const file = `${name}-${as}.png`;
        const result = statuses[as][file];
        if (!result?.ok) return "_not captured_";
        return `<img src="${base}/${file}?raw=true" width="${width(shot)}" alt="${as}">`;
      };
      const label = [
        `**${DEVICE_LABEL[shot.device]}** · \`${shot.screen}\` · ${shot.dark ? "dark" : "light"}`,
        shot.note,
      ]
        .filter(Boolean)
        .join("<br>");
      lines.push(`| ${label} | ${cell("before")} | ${cell("after")} |`);
    });
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

if (command === "capture") {
  await capture();
} else if (command === "report") {
  report();
} else {
  console.error("Usage: fix-shots.ts capture|report …");
  process.exit(2);
}
