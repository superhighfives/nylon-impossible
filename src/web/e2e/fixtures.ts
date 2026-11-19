/**
 * The fixture every spec uses: a fresh seed for the smoke user, a page signed
 * in as them on the board, and a check that fails the test on an uncaught page
 * error or a 5xx from the app under test.
 */

import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import {
  test as base,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";
import { email, seed } from "./account";

type Layout = "wide" | "phone";

interface Fixtures {
  /** Which layout the project draws: wide (1440×900) or phone. */
  layout: Layout;
  /** A suffix unique to this test, so titles never match leftovers. */
  tag: string;
  /** Signed in, seeded, on `/` with the board loaded. */
  board: Page;
}

/** Origins whose 5xx fails a test: the web app and, in CI, the preview API. */
function appOrigins(baseURL: string | undefined): string[] {
  const origins = new Set<string>();
  if (baseURL) origins.add(new URL(baseURL).origin);
  if (process.env.API_URL) origins.add(new URL(process.env.API_URL).origin);
  return [...origins];
}

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern, and this one has none.
  layout: async ({}, use, testInfo) => {
    await use(testInfo.project.name === "phone" ? "phone" : "wide");
  },

  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern, and this one has none.
  tag: async ({}, use, testInfo) => {
    const retry = testInfo.retry ? `r${testInfo.retry}` : "";
    await use(`${Date.now().toString(36)}${retry}`);
  },

  page: async ({ page, baseURL }, use) => {
    const errors: string[] = [];
    const origins = appOrigins(baseURL);
    page.on("pageerror", (error) => {
      errors.push(`Uncaught page error: ${error.message}`);
    });
    page.on("response", (response) => {
      const url = response.url();
      if (
        response.status() >= 500 &&
        origins.some((origin) => url.startsWith(origin))
      ) {
        errors.push(
          `${response.status()} from ${response.request().method()} ${url}`,
        );
      }
    });
    await use(page);
    expect(errors, "page errors and 5xx responses").toEqual([]);
  },

  board: async ({ page, layout }, use) => {
    const userId = process.env.SMOKE_USER_ID;
    if (!userId) throw new Error("global-setup.ts didn't set SMOKE_USER_ID");
    seed(userId);

    await setupClerkTestingToken({ page });
    // Clerk has to have loaded on the page before it can sign in.
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: email });
    await page.goto("/");
    await expect(page.locator(`[data-${layout}-ready]`)).toBeAttached({
      timeout: 30_000,
    });
    await use(page);
  },
});

export { expect };

/** Today, This week, Someday or a list's column on wide. */
export function column(page: Page, name: string): Locator {
  return page.locator('[data-layout="wide"] section[data-column]').filter({
    has: page.getByRole("heading", { level: 2, name, exact: true }),
  });
}

/** The phone page that's showing (the others are inert). */
export function phonePage(page: Page, name: string): Locator {
  return page
    .locator('[data-layout="phone"]')
    .getByRole("region", { name, exact: true });
}

/** A todo's row (the `<li>`), found by its exact title. */
export function row(scope: Locator, title: string): Locator {
  return scope.locator("li[data-phone-row]").filter({
    has: scope.page().getByRole("button", { name: title, exact: true }),
  });
}

/** A todo's title button, which selects (wide) or opens (phone) it. */
export function rowButton(scope: Locator, title: string): Locator {
  return scope.getByRole("button", { name: title, exact: true });
}

/** Rows' titles in a column or page, top to bottom. */
export async function titles(scope: Locator): Promise<string[]> {
  const texts = await scope
    .locator(
      "li[data-phone-row]:not([aria-hidden]) [data-row-id] > span:first-child",
    )
    .allInnerTexts();
  return texts.map((t) => t.trim());
}

/** The toast that's showing, by its text. Toasts are Base UI dialogs. */
export function toast(page: Page, text: string): Locator {
  return page
    .getByRole("region", { name: "Notifications" })
    .getByRole("dialog", { name: text });
}

/** The open todo's sheet. */
export function sheet(page: Page): Locator {
  return page.getByRole("dialog", { name: "Todo" });
}

/**
 * Start listening for the next write (POST/PATCH/PUT/DELETE) the app sends.
 * Call it before the action that saves, pass the result to `reload`: the app
 * awaits its auth token before sending, so a reload straight after the
 * optimistic row can beat the request and lose the write.
 */
export function watchWrite(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (res) => res.request().method() !== "GET" && res.status() < 500,
    { timeout: 30_000 },
  );
}

/**
 * Reload (or open `path`) and wait for the board to load again. Pass the
 * `watchWrite` promise when the test checks that a write survived.
 */
export async function reload(
  page: Page,
  layout: Layout,
  path?: string,
  saved?: Promise<unknown>,
): Promise<void> {
  if (saved) await saved;
  if (path) await page.goto(path);
  else await page.reload();
  await expect(page.locator(`[data-${layout}-ready]`)).toBeAttached({
    timeout: 30_000,
  });
}

/** The phone switcher's button for a page: Today, This week, Someday, Lists. */
export function phoneTab(page: Page, name: string): Locator {
  return page
    .getByRole("navigation", { name: "Lists" })
    .getByRole("button", { name, exact: true });
}

/**
 * Hold a finger on `target` for `ms`, without moving, the way a phone opens a
 * row's menu (450ms, TodoRow's LONG_PRESS_MS). Playwright's tap is too short.
 */
export async function longPress(
  page: Page,
  target: Locator,
  ms = 700,
): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error("longPress: the target isn't visible");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await page.waitForTimeout(ms);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}
