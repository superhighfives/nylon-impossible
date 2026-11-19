import type { Page } from "@playwright/test";
import { column, expect, phonePage, rowButton, test, toast } from "./fixtures";

const TITLE = "Call Mum about Sunday lunch";

// A Done row's button also names where the todo came from ("… Today").
const doneRow = (page: Page) =>
  column(page, "Done").getByRole("button", { name: new RegExp(`^${TITLE}`) });

// Principle 3 and Settled "Completing a todo": a checked todo leaves straight
// away, with Undo. On wide it shows in the Done column (Settled "Wide layout").
test("a todo marked done leaves its list, and Undo brings it back", async ({
  board: page,
  layout,
}) => {
  const today =
    layout === "wide" ? column(page, "Today") : phonePage(page, "Today");
  const check = today.getByRole("button", {
    name: `Mark “${TITLE}” done`,
  });
  await expect(rowButton(today, TITLE)).toBeVisible();

  if (layout === "phone") await check.tap();
  else await check.click();

  await expect(rowButton(today, TITLE)).toHaveCount(0);
  const done = toast(page, "Done");
  await expect(done).toBeVisible();
  if (layout === "wide") {
    await expect(doneRow(page)).toBeVisible();
  }

  const undo = done.getByRole("button", { name: "Undo" });
  if (layout === "phone") await undo.tap();
  else await undo.click();

  await expect(rowButton(today, TITLE)).toBeVisible();
  if (layout === "wide") {
    await expect(doneRow(page)).toHaveCount(0);
  }
});
