import type { Locator, Page } from "@playwright/test";
import {
  column,
  expect,
  reload,
  rowButton,
  test,
  titles,
  toast,
} from "./fixtures";

/** Studio's seeded todos, in order. */
const STUDIO = [
  "Order more vinyl mailers",
  "Update portfolio site",
  "Mix the new EP",
];

/**
 * Press on `from` with the mouse, move past the 6px that starts a drag, then
 * glide to (x, y) so the board tracks the pointer the whole way. Returns with
 * the button still down, so the caller can look at the drop line.
 */
async function dragTo(page: Page, from: Locator, x: number, y: number) {
  const box = await from.boundingBox();
  if (!box) throw new Error("dragTo: the row isn't visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 12, {
    steps: 4,
  });
  await page.mouse.move(x, y, { steps: 12 });
}

test.skip(
  ({ layout }) => layout !== "wide",
  'Dragging is the web board\'s (Settled "Moving between lists by drag")',
);

// Settled "Dropping with a pointer": over a row's lower half the todo goes
// below it, shown by the drop line.
test("dragging the first todo below the third reorders the column", async ({
  board: page,
  layout,
}) => {
  const studio = column(page, "Studio");
  await studio.scrollIntoViewIfNeeded();
  expect(await titles(studio)).toEqual(STUDIO);

  const third = await rowButton(studio, STUDIO[2]).boundingBox();
  if (!third) throw new Error("the third row isn't visible");
  await dragTo(
    page,
    rowButton(studio, STUDIO[0]),
    third.x + third.width / 2,
    third.y + third.height * 0.8,
  );
  await expect(studio.locator("[data-drop-indicator]")).toBeVisible();
  await page.mouse.up();

  const reordered = [STUDIO[1], STUDIO[2], STUDIO[0]];
  await expect.poll(() => titles(studio)).toEqual(reordered);

  await reload(page, layout);
  const after = column(page, "Studio");
  await after.scrollIntoViewIfNeeded();
  await expect.poll(() => titles(after)).toEqual(reordered);
});

test("dragging a todo onto another column moves it there", async ({
  board: page,
  layout,
}) => {
  const title = "Read Piranesi";
  const someday = column(page, "Someday");
  const thisWeek = column(page, "This week");
  await someday.scrollIntoViewIfNeeded();

  const rows = thisWeek.locator("[data-row-list]");
  const target = await rows.boundingBox();
  if (!target) throw new Error("This week's rows aren't visible");
  await dragTo(
    page,
    rowButton(someday, title),
    target.x + target.width / 2,
    target.y + target.height - 4,
  );
  await expect(thisWeek.locator("[data-drop-indicator]")).toBeVisible();
  await page.mouse.up();

  await expect(toast(page, "Moved to this week")).toBeVisible();
  await expect(rowButton(thisWeek, title)).toBeVisible();
  await expect(rowButton(someday, title)).toHaveCount(0);

  await reload(page, layout);
  await expect(rowButton(column(page, "This week"), title)).toBeVisible();
});
