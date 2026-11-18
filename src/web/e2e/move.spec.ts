import {
  column,
  expect,
  longPress,
  phonePage,
  phoneTab,
  reload,
  row,
  rowButton,
  test,
  toast,
} from "./fixtures";

const TITLE = "Review PR for the sync engine";

test.describe("wide", () => {
  test.skip(
    ({ layout }) => layout !== "wide",
    "The number keys are the wide board's",
  );

  // States, "Moving": 1 / 2 / 3 move the selected todo and keep it selected.
  test("on wide, 2 moves the selected todo to This week", async ({
    board: page,
    layout,
  }) => {
    const today = column(page, "Today");
    const thisWeek = column(page, "This week");

    // One click selects (Settled "Selecting on wide").
    await rowButton(today, TITLE).click();
    await expect(
      row(today, TITLE).locator("[data-row-container]"),
    ).toHaveAttribute("data-selected", "");
    await page.keyboard.press("2");

    await expect(toast(page, "Moved to this week")).toBeVisible();
    await expect(rowButton(today, TITLE)).toHaveCount(0);
    await expect(
      row(thisWeek, TITLE).locator("[data-row-container]"),
    ).toHaveAttribute("data-selected", "");

    await reload(page, layout);
    await expect(rowButton(column(page, "This week"), TITLE)).toBeVisible();
    await expect(rowButton(column(page, "Today"), TITLE)).toHaveCount(0);
  });
});

test.describe("phone", () => {
  test.skip(
    ({ layout }) => layout !== "phone",
    "Move to is the phone's way to move",
  );

  // Settled "Moving between lists by drag": on a phone a todo moves through its
  // menu (Move to).
  test("on phone, Move to → Someday moves the todo", async ({
    board: page,
    layout,
  }) => {
    const today = phonePage(page, "Today");

    await longPress(page, rowButton(today, TITLE));
    const menu = page.getByRole("menu", { name: "Todo actions" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Move to Someday" }).tap();

    await expect(toast(page, "Moved to someday")).toBeVisible();
    await expect(rowButton(today, TITLE)).toHaveCount(0);
    await phoneTab(page, "Someday").tap();
    await expect(rowButton(phonePage(page, "Someday"), TITLE)).toBeVisible();

    await reload(page, layout);
    await phoneTab(page, "Someday").tap();
    await expect(rowButton(phonePage(page, "Someday"), TITLE)).toBeVisible();
  });
});
