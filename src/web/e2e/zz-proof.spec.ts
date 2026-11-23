// TEMPORARY (#821): one-off proof runs, reverted before merge.
import type { Page } from "@playwright/test";
import {
  column,
  expect,
  reload,
  rowButton,
  test,
  watchWrite,
} from "./fixtures";

/** main's watchWrite, verbatim. */
function mainWatchWrite(page: Page, body?: string): Promise<unknown> {
  return page.waitForResponse(
    (res) =>
      res.request().method() !== "GET" &&
      res.status() < 500 &&
      (!body || (res.request().postData() ?? "").includes(body)),
    { timeout: 30_000 },
  );
}

const hold = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

test.skip(({ layout }) => layout !== "wide", "wide only");

type Mode = "main" | "branch";

async function add(page: Page, tag: string, mode: Mode, answer400 = false) {
  const title = `Smoke add ${tag}`;
  const today = () => column(page, "Today");
  const field = today().getByRole("textbox", { name: "New todo in today" });
  await field.click();
  await field.fill(title);
  await page.route("**/todos/smart", async (r) => {
    if (answer400) {
      await r.fulfill({ status: 400, body: '{"error":"bad"}' });
      return;
    }
    await hold(2000);
    await r.continue();
  });
  const saved =
    mode === "main" ? mainWatchWrite(page) : watchWrite(page, title);
  await field.press("Enter");
  await expect(rowButton(today(), title)).toBeVisible();
  await reload(page, "wide", undefined, saved);
  await expect(rowButton(today(), title)).toBeVisible();
}

for (const mode of ["main", "branch"] as const) {
  test(`${mode}: save held 2s`, async ({ board: page, tag }) => {
    await add(page, tag, mode);
  });
}

test("branch: save answered 400", async ({ board: page, tag }) => {
  await add(page, tag, "branch", true);
});
