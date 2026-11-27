/**
 * `fix-shots.ts report` on fixture plans and status files: what the PR's
 * Before | After table says. Capture needs a simulator, so it isn't here;
 * scripts/foreman/test.sh covers the foreman's side with a faked tsx.
 *
 *   bun run marketing:test
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEST = "PullToRefreshUITests/testPullingTheChipRowDownDoesNotRefresh";
const GIF = "video-1-iphone-PullToRefreshUITests-testPullingTheChipRowDownDoesNotRefresh";

type Status = Record<string, { ok: boolean; error?: string; testExit?: number | null }>;

/** The report for a plan and the two sides' status files, if any. */
function report(plan: unknown, statuses: { before?: Status; after?: Status } = {}): string {
  const out = mkdtempSync(join(tmpdir(), "fix-shots-"));
  writeFileSync(join(out, "plan.json"), JSON.stringify(plan));
  for (const [as, status] of Object.entries(statuses)) {
    writeFileSync(join(out, `status-${as}.json`), JSON.stringify(status));
  }
  return execFileSync(
    join(SCRIPT_DIR, "node_modules/.bin/tsx"),
    ["fix-shots.ts", "report", "--plan", join(out, "plan.json"), "--out", out, "--base", "https://x.test/fixes/1"],
    { cwd: SCRIPT_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
}

const savedPlan = (section: string) => JSON.parse(/<!-- fix-shots:plan (.*?) -->/.exec(section)?.[1] ?? "null");
const rows = (section: string) => section.split("\n").filter((line) => /^\| \*\*/.test(line));

test("keeps one valid video and drops the rest", () => {
  const plan = savedPlan(
    report({
      videos: [
        { device: "mac", test: TEST },
        { device: "iphone", test: "PullToRefreshUITests/testX; rm -rf /" },
        { device: "iphone", test: "PullToRefreshUITests/notATest" },
        { device: "iphone", test: TEST, note: "Pull the chip row", extra: "dropped" },
        { device: "iphone", test: "PullToRefreshUITests/testSecond" },
      ],
    }),
  );
  assert.deepEqual(plan, { shots: [], videos: [{ device: "iphone", test: TEST, note: "Pull the chip row" }] });
});

test("a plan with no valid video saves none", () => {
  assert.deepEqual(savedPlan(report({ videos: [{ device: "ipad", test: TEST }] })), { shots: [] });
});

test("a video row comes after the still rows, with both GIFs", () => {
  const section = report(
    { shots: [{ device: "iphone", screen: "today" }], videos: [{ device: "iphone", test: TEST, note: "The pull" }] },
    {
      before: { "1-iphone-today-light-before.png": { ok: true }, [`${GIF}-before.gif`]: { ok: true, testExit: 65 } },
      after: { "1-iphone-today-light-after.png": { ok: true }, [`${GIF}-after.gif`]: { ok: true, testExit: 0 } },
    },
  );
  const [still, video, ...others] = rows(section);
  assert.equal(others.length, 0);
  assert.match(still, /`today`/);
  assert.equal(
    video,
    `| **iPhone** · video · \`${TEST}\`<br>The pull | ` +
      `<img src="https://x.test/fixes/1/${GIF}-before.gif?raw=true" width="280" alt="before"> | ` +
      `<img src="https://x.test/fixes/1/${GIF}-after.gif?raw=true" width="280" alt="after"> |`,
  );
});

test("a side with no status reads not captured", () => {
  const [video] = rows(
    report({ videos: [{ device: "iphone", test: TEST }] }, { after: { [`${GIF}-after.gif`]: { ok: true, testExit: 0 } } }),
  );
  assert.match(video, /\| _not captured_ \| <img [^|]*-after\.gif/);
});

test("a test that failed on the after side says so", () => {
  const [video] = rows(
    report(
      { videos: [{ device: "iphone", test: TEST }] },
      { after: { [`${GIF}-after.gif`]: { ok: false, error: "no marker", testExit: 65 } } },
    ),
  );
  assert.match(video, /`<br>The test failed on this branch\. \| _not captured_ \| _not captured_ \|$/);
});

test("failing on the before side says nothing", () => {
  const [video] = rows(
    report(
      { videos: [{ device: "iphone", test: TEST }] },
      { before: { [`${GIF}-before.gif`]: { ok: true, testExit: 65 } }, after: { [`${GIF}-after.gif`]: { ok: true, testExit: 0 } } },
    ),
  );
  assert.doesNotMatch(video, /failed/);
});

test("a video-only plan gets the table, not No screenshots", () => {
  const section = report({ videos: [{ device: "iphone", test: TEST }] });
  assert.match(section, /\| \| Before \| After \|/);
  assert.doesNotMatch(section, /No screenshots/);
});

test("a plan with neither still says why", () => {
  assert.match(report({ skip: "Nothing to see." }), /No screenshots: Nothing to see\./);
});
