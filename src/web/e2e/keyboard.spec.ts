import type { Page } from "@playwright/test";
import {
  column,
  expect,
  rowButton,
  sheet,
  test,
  titles,
  toast,
} from "./fixtures";

/** The title of the selected todo on the board. */
function selected(page: Page) {
  return page
    .locator(
      '[data-layout="wide"] [data-row-container][data-selected] [data-row-id] > span:first-child',
    )
    .first();
}

test.skip(
  ({ layout }) => layout !== "wide",
  "Keyboard first where there's a keyboard",
);

// Principle 7 and commands.ts: everything reachable without a pointer. No
// mouse or touch input happens in this test.
test("the keyboard moves, opens, closes and marks done", async ({
  board: page,
}) => {
  const today = column(page, "Today");
  const thisWeek = column(page, "This week");
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  const order = await titles(today);
  expect(order.length).toBeGreaterThanOrEqual(2);

  // j / k and ↓ / ↑ move through Today's todos.
  await page.keyboard.press("j");
  await expect(selected(page)).toHaveText(order[0]);
  await page.keyboard.press("j");
  await expect(selected(page)).toHaveText(order[1]);
  await page.keyboard.press("k");
  await expect(selected(page)).toHaveText(order[0]);
  await page.keyboard.press("ArrowDown");
  await expect(selected(page)).toHaveText(order[1]);
  await page.keyboard.press("ArrowUp");
  await expect(selected(page)).toHaveText(order[0]);

  // Tab and ⇧Tab move between sections: the sidebar, then the columns.
  await page.keyboard.press("Tab");
  await expect(thisWeek).toHaveAttribute("data-key-section", /.+/);
  await page.keyboard.press("Shift+Tab");
  await expect(today).toHaveAttribute("data-key-section", /.+/);
  await page.keyboard.press("Shift+Tab");
  await expect(sidebar).toHaveAttribute("data-key-section", /.+/);
  await page.keyboard.press("Tab");
  await expect(today).toHaveAttribute("data-key-section", /.+/);
  await expect(sidebar).not.toHaveAttribute("data-key-section", /.+/);

  // Return steps into the column, and on a todo opens it; Esc closes it.
  await page.keyboard.press("Enter");
  await expect(today).toHaveAttribute("data-key-section", "in");
  await expect(selected(page)).toHaveCount(1);
  const title = (await selected(page).innerText()).trim();
  await page.keyboard.press("Enter");
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByLabel("Title", { exact: true })).toHaveValue(
    title,
  );
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);

  // x marks the selected todo done: it leaves, with Undo.
  await expect(selected(page)).toHaveText(title);
  await page.keyboard.press("x");
  await expect(rowButton(today, title)).toHaveCount(0);
  await expect(toast(page, "Done")).toBeVisible();
});
