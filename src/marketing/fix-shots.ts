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
 * The workflow runs `capture` on the fix branch (`--as after`) and on main
 * (`--as before`) — same derived data, so the second build is incremental —
 * then commits the PNGs to feedback-assets and puts `report`'s Markdown in
 * the PR body, with the plan in a hidden comment so a capture-only rerun can
 * reuse it. Capture is best-effort per shot: a failure is recorded in
 * <dir>/status-<as>.json and shown in the report, never thrown.
 *
 * Routes run on in-memory sample data with no account, so nothing personal
 * ends up in the (public) images.
 */

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
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
// A video is a whole UI-test run per side, so one is plenty.
const MAX_VIDEOS = 1;

interface Shot {
  device: Device;
  screen: string;
  dark?: boolean;
  landscape?: boolean;
  note?: string;
}

/**
 * A UI test (`Class/testMethod` in the UI-test target) that performs the
 * interaction. It's recorded on both sides: the after side runs the branch,
 * the before side runs main with the branch's UI tests copied in.
 */
interface Video {
  device: "iphone" | "ipad";
  test: string;
  note?: string;
}

interface Plan {
  shots?: Shot[];
  videos?: Video[];
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
      if (!ok) console.error(`  Ignoring an invalid shot: ${JSON.stringify(shot)}`);
      return ok;
    })
    .slice(0, MAX_SHOTS)
    // Known fields only: the plan is saved into the public PR body, so nothing
    // the model adds besides these may pass through.
    .map((shot) => ({
      device: shot.device,
      screen: shot.screen,
      dark: shot.dark === true,
      landscape: shot.landscape === true,
      note: typeof shot.note === "string" ? plainText(shot.note) : undefined,
    }));
  // The test name ends up in an xcodebuild argument and a file name.
  const videos = (Array.isArray(raw?.videos) ? raw.videos : [])
    .filter((video) => {
      const ok =
        typeof video === "object" &&
        video !== null &&
        (video.device === "iphone" || video.device === "ipad") &&
        typeof video.test === "string" &&
        /^[A-Za-z][A-Za-z0-9_]{0,60}\/test[A-Za-z0-9_]{0,80}$/.test(video.test);
      if (!ok) console.error(`  Ignoring an invalid video: ${JSON.stringify(video)}`);
      return ok;
    })
    .slice(0, MAX_VIDEOS)
    .map((video) => ({
      device: video.device,
      test: video.test,
      note: typeof video.note === "string" ? plainText(video.note) : undefined,
    }));
  return videos.length ? { shots, videos } : { shots };
}

/**
 * Model text bound for a public PR body: one line, no table breaks, HTML or
 * links, and @mentions broken with a zero-width space so nobody gets pinged.
 */
function plainText(text: string): string {
  return text
    .replace(/[|\n<>[\]]/g, " ")
    // Idempotent: a plan read back from the PR body has been through this.
    .replace(/@(?!\u200b)/g, "@\u200b")
    .trim()
    .slice(0, 200);
}

function videoName(video: Video, index: number): string {
  return `video-${index + 1}-${video.device}-${video.test.replace("/", "-")}`;
}

function shotName(shot: Shot, index: number): string {
  const mode = shot.dark ? "dark" : "light";
  return `${index + 1}-${shot.device}-${shot.screen}-${mode}${shot.landscape ? "-landscape" : ""}`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function xcodebuild(destination: string, derivedData: string, extra: string[] = []): Promise<void> {
  const child = spawn(
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
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`xcodebuild exited with ${signal ?? code}`)),
    );
  });
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

  // Build, then boot. Overlapping them looked free, but a cold build swamps
  // CoreSimulator: in feedback run 40067524940 every state read timed out for
  // the whole 30-minute build, so the boot was given up on although it had
  // worked (the next side found the device already Booted).
  console.log(`  Building for the ${DEVICE_LABEL[device]} simulator…`);
  await xcodebuild(`platform=iOS Simulator,id=${udid}`, DERIVED_DATA.ios);
  await ensureBooted(udid);
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
// Capture — video of a UI test
// ---------------------------------------------------------------------------

const UI_TEST_SCHEME = "Nylon Impossible UI Tests";
const UI_TEST_TARGET = "Nylon ImpossibleUITests";
// Printed by the test just before the gesture; the GIF starts there.
const GESTURE_MARKER = "FIX-SHOTS-GESTURE";

/** Run a command, echoing its output, and resolve with its exit code. */
function runStreaming(
  cmd: string,
  args: string[],
  { onLine, timeout }: { onLine?: (line: string) => void; timeout?: number } = {},
): Promise<number | null> {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "inherit"] });
  let pending = "";
  child.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    pending += chunk.toString();
    for (let i = pending.indexOf("\n"); i >= 0; i = pending.indexOf("\n")) {
      onLine?.(pending.slice(0, i));
      pending = pending.slice(i + 1);
    }
  });
  const timer = timeout ? setTimeout(() => child.kill("SIGTERM"), timeout) : undefined;
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function captureVideo(video: Video, dest: string, as: string, status: Status): Promise<void> {
  const udid = ensureSimulator(SIMULATOR_NAME[video.device], manifest.ios.devices[video.device].types);
  const common = [
    "-project", join(WORKSPACE_ROOT, manifest.ios.project),
    "-scheme", UI_TEST_SCHEME,
    "-destination", `platform=iOS Simulator,id=${udid}`,
    "-derivedDataPath", DERIVED_DATA.ios,
  ];

  // Build, then boot, as for stills: a build next to a booting simulator
  // starves CoreSimulator (#445).
  console.log("  Building the UI tests…");
  const built = await runStreaming("xcodebuild", ["build-for-testing", ...common, "-quiet"]);
  if (built !== 0) throw new Error(`build-for-testing exited with ${built}`);
  await ensureBooted(udid);

  const raw = join(DERIVED_DATA.ios, `${basename(dest, ".gif")}.mp4`);
  const recorder = spawn("xcrun", ["simctl", "io", udid, "recordVideo", "--codec=h264", "--force", raw], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  // Echo what the recorder says, and wait for it to start before the test
  // does.
  recorder.stderr.on("data", (chunk: Buffer) => process.stdout.write(`  [recordVideo] ${chunk}`));
  await new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, 30_000);
    recorder.stderr.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("Recording started")) {
        clearTimeout(fallback);
        resolve();
      }
    });
  });

  console.log(`  Recording ${video.test}…`);
  let markerAt: number | undefined;
  const code = await runStreaming(
    "xcodebuild",
    ["test-without-building", ...common, `-only-testing:${UI_TEST_TARGET}/${video.test}`],
    {
      onLine: (line) => {
        if (markerAt === undefined && line.includes(GESTURE_MARKER)) markerAt = Date.now();
      },
      timeout: 10 * 60_000,
    },
  );
  // Before the fix the test is expected to fail; the recording is the point.
  console.log(`  The test ${code === 0 ? "passed" : `exited with ${code}`} (${as}).`);

  const stoppedAt = Date.now();
  recorder.kill("SIGINT");
  // SIGINT makes recordVideo finish the file; until it exits the file has
  // no index and ffmpeg can't open it.
  const recorderExit = await new Promise<string>((resolve) => {
    const fallback = setTimeout(() => resolve("still running after 60s"), 60_000);
    recorder.on("exit", (code, signal) => {
      clearTimeout(fallback);
      resolve(`exited with ${signal ?? code}`);
    });
  });
  if (!existsSync(raw)) throw new Error(`recordVideo wrote no file (${recorderExit})`);
  console.log(`  recordVideo ${recorderExit}; ${Math.round(statSync(raw).size / 1024)} KB.`);

  // From just before the marker, measured back from the end: recordVideo
  // only writes frames when the screen changes, so its timeline needn't
  // match the clock from "Recording started" (run 40152231313 asked for
  // 316s into a shorter file). Without a marker, or if that cut fails, the
  // last 10 seconds.
  const toGif = (window: string[]) =>
    execFileSync(
      "ffmpeg",
      [
        "-y", "-loglevel", "error", ...window, "-i", raw,
        "-vf", "fps=12,scale=300:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse",
        "-loop", "0", dest,
      ],
      { stdio: "inherit", timeout: 120_000 },
    );
  const lastTen = ["-sseof", "-10"];
  if (markerAt === undefined) {
    console.log("  No gesture marker in the test output; using the last 10s.");
    toGif(lastTen);
  } else {
    try {
      toGif(["-sseof", (-((stoppedAt - markerAt) / 1000 + 0.5)).toFixed(2), "-t", "9"]);
    } catch (err) {
      console.log(`  Trimming to the marker failed (${describeError(err)}); using the last 10s.`);
      toGif(lastTen);
    }
  }
  status[basename(dest)] = { ok: true };
  console.log(`  → ${dest}`);
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
  await xcodebuild("platform=macOS", DERIVED_DATA.mac, ["CODE_SIGNING_ALLOWED=NO"]);
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
  const videos = (plan.videos ?? []).map((video, i) => ({ video, dest: join(out, `${videoName(video, i)}-${as}.gif`) }));
  if (!shots.length && !videos.length) {
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

  // Videos after the stills, so a slow test run can't cost them.
  for (const { video, dest } of videos) {
    console.log(`\n── Video: ${video.test} (${as}) ──`);
    try {
      if (!windowOpen) {
        await openSimulatorWindow();
        windowOpen = true;
      }
      await captureVideo(video, dest, as, status);
    } catch (err) {
      status[basename(dest)] = { ok: false, error: describeError(err).slice(0, 300) };
      console.log(`  ✗ ${video.test}: ${describeError(err)}`);
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
  if (plan.skip || (!plan.shots?.length && !plan.videos?.length)) {
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
    const cellFor = (file: string, as: "before" | "after", width: number) =>
      statuses[as][file]?.ok ? `<img src="${base}/${file}?raw=true" width="${width}" alt="${as}">` : "_not captured_";
    const width = (shot: Shot) => (shot.device === "mac" || shot.landscape ? 480 : shot.device === "ipad" ? 360 : 280);
    (plan.shots ?? []).forEach((shot, i) => {
      const name = shotName(shot, i);
      const cell = (as: "before" | "after") => cellFor(`${name}-${as}.png`, as, width(shot));
      const label = [
        `**${DEVICE_LABEL[shot.device]}** · \`${shot.screen}\` · ${shot.dark ? "dark" : "light"}`,
        shot.note,
      ]
        .filter(Boolean)
        .join("<br>");
      lines.push(`| ${label} | ${cell("before")} | ${cell("after")} |`);
    });
    (plan.videos ?? []).forEach((video, i) => {
      const name = videoName(video, i);
      const cell = (as: "before" | "after") => cellFor(`${name}-${as}.gif`, as, video.device === "ipad" ? 360 : 280);
      const label = [`**${DEVICE_LABEL[video.device]}** · video · \`${video.test}\``, video.note].filter(Boolean).join("<br>");
      lines.push(`| ${label} | ${cell("before")} | ${cell("after")} |`);
    });
  }
  // The validated plan, for a capture-only rerun (feedback.yml reads it back).
  // Escaping < and > keeps it valid JSON that can't close the comment early.
  const saved = JSON.stringify(plan).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  lines.push("", `<!-- fix-shots:plan ${saved} -->`);
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
