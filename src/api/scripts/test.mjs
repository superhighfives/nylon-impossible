#!/usr/bin/env node
/**
 * Wrapper around `vitest run` that strips two upstream log sources we can't
 * silence via configuration:
 *   - [vpw:*]  — vitest-pool-workers hardcodes its Log to LogLevel.VERBOSE
 *   - workerd/jsg ... CODE_MOVED — workerd C++ runtime info-level telemetry
 *
 * Forwards the exit code so CI signals correctly. Also sets WRANGLER_LOG=warn
 * to suppress wrangler's "Using secrets defined in .env" repetition.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const SILENCE = /^(\[vpw:|workerd\/)/;

const child = spawn("vitest", ["run", ...process.argv.slice(2)], {
  env: { ...process.env, WRANGLER_LOG: "warn" },
  stdio: ["inherit", "pipe", "pipe"],
});

const pipe = (src, dest) => {
  createInterface({ input: src }).on("line", (line) => {
    if (!SILENCE.test(line)) dest.write(`${line}\n`);
  });
};

pipe(child.stdout, process.stdout);
pipe(child.stderr, process.stderr);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
