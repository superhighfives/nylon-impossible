/**
 * Simulator plumbing shared by generate.ts (marketing and parity shots) and
 * fix-shots.ts (before/after shots on feedback fix PRs). Every helper here
 * was hardened against a specific CI flake; see the comments before changing
 * the timeouts or retries.
 */

import { execFileSync, spawnSync } from "node:child_process";

export interface SimDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable?: boolean;
}

export function simctlJson<T>(args: string[], timeout = 30_000): T {
  const raw = execFileSync("xcrun", ["simctl", "list", ...args, "-j"], {
    encoding: "utf8",
    timeout,
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
export function simulatorState(udid: string): string {
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

const SETUP_TIMEOUT = 180_000;

/**
 * A simulator of ours by name, created on first use (from the first of
 * `types` this Xcode has, on the newest iOS runtime) and reused by later
 * runs. Captures never borrow a simulator someone already has booted: they
 * shut their device down at the end, and launch the app with
 * screenshot-only arguments.
 *
 * Its lookups and the create get a longer timeout than `simulatorState`'s:
 * nothing retries them, so one that times out costs every shot on the
 * device. `simctl create` timed out at 60s in feedback run 40150015575. On a hosted
 * runner, even after the workflow's warm-up, `simctl list` has taken over 30s
 * (feedback run 40046607203).
 */
export function ensureSimulator(name: string, types: string[]): string {
  const { devices } = simctlJson<{ devices: Record<string, SimDevice[]> }>(
    ["devices"],
    SETUP_TIMEOUT,
  );
  const existing = Object.values(devices)
    .flat()
    .find((d) => d.name === name && d.isAvailable !== false);
  if (existing) return existing.udid;

  const { runtimes } = simctlJson<{
    runtimes: {
      identifier: string;
      platform?: string;
      version: string;
      isAvailable: boolean;
    }[];
  }>(["runtimes"], SETUP_TIMEOUT);
  const runtime = runtimes
    .filter((r) => r.isAvailable && (r.platform ?? "iOS") === "iOS" && r.identifier.includes("iOS"))
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
    .at(-1);
  if (!runtime) throw new Error("No available iOS simulator runtime");

  const { devicetypes } = simctlJson<{
    devicetypes: { name: string; identifier: string }[];
  }>(["devicetypes"], SETUP_TIMEOUT);
  const type = types
    .map((t) => devicetypes.find((d) => d.name === t))
    .find(Boolean);
  if (!type) {
    throw new Error(`None of ${types.join(", ")} is available to create`);
  }

  console.log(`  Creating simulator "${name}" (${type.name}, ${runtime.identifier})…`);
  return execFileSync(
    "xcrun",
    ["simctl", "create", name, type.identifier, runtime.identifier],
    { encoding: "utf8", timeout: SETUP_TIMEOUT },
  ).trim();
}

/**
 * Mark the keyboard's "slide to type" introduction as seen, so it doesn't
 * cover the first shot that brings up the keyboard (the composer). Best-
 * effort: a failure here only costs that tip showing.
 */
function quietKeyboardTips(udid: string) {
  spawnSync(
    "xcrun",
    [
      "simctl",
      "spawn",
      udid,
      "defaults",
      "write",
      "com.apple.Preferences",
      "DidShowContinuousPathIntroduction",
      "-bool",
      "true",
    ],
    { stdio: "pipe", timeout: 30_000 },
  );
}

/**
 * Boot a simulator and block until it is *fully* booted, throwing if it can't
 * get there. Under CI load CoreSimulator can drop a freshly-booted device back
 * to Shutdown, so lean on `simctl bootstatus -b` (which boots if needed and
 * blocks until the device reports booted), verify the state, and retry the
 * whole cycle a few times before giving up loudly.
 *
 * Only a state we actually read gets the device shut down and restarted. On a
 * loaded runner the state lookup itself times out ("unknown"), and treating
 * that as a failed boot threw away boots that were nearly done: feedback run
 * 40057233704 lost three in a row that way. So an unknown state after a
 * successful bootstatus counts as booted, after a timed-out one the next
 * attempt carries on with the same boot, and after a failed one it waits
 * a moment and tries again.
 */
export async function ensureBooted(udid: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const boot = spawnSync("xcrun", ["simctl", "bootstatus", udid, "-b"], {
      stdio: "pipe",
      timeout: 120_000,
    });
    const state = simulatorState(udid);
    console.log(`  Simulator state: ${state}`);
    if (state === "Booted") return quietKeyboardTips(udid);
    if (state === "unknown") {
      if (boot.status === 0) {
        console.log("  bootstatus reported booted; going with that.");
        return quietKeyboardTips(udid);
      }
      if (boot.error) {
        console.log(`  boot attempt ${attempt} is still going, waiting on it…`);
        continue;
      }
      // bootstatus failed fast rather than timing out; pause so the retries
      // don't spin, but leave the device alone since its state is unknown.
      console.log(
        `  bootstatus exited ${boot.status} on attempt ${attempt}, retrying…`,
      );
      await sleep(5000);
      continue;
    }
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
export async function openSimulatorWindow(): Promise<void> {
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

/** Retry a simulator command, re-booting between attempts. */
export async function withSimRetries(
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

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * execSync/spawnSync bury the actual reason in the captured stderr, so a bare
 * `err.message` reads "Command failed" and every retry log line in CI has been
 * useless. Pull the streams out too.
 */
export function describeError(err: unknown): string {
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
