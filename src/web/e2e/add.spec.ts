import { column, expect, phonePage, reload, rowButton, test } from "./fixtures";

// Principle 2: adding is one gesture, and the todo lands where you're looking.
test("a todo typed into Today's composer lands in Today and reaches D1", async ({
  board: page,
  layout,
  tag,
}) => {
  const title = `Smoke add ${tag}`;
  const today = () =>
    layout === "wide" ? column(page, "Today") : phonePage(page, "Today");
  const field =
    layout === "wide"
      ? today().getByRole("textbox", { name: "New todo in today" })
      : page
          .locator('[data-layout="phone"]')
          .getByRole("textbox", { name: "New todo" });

  // On wide the composer rests read-only on Add until it's clicked.
  await field.click();
  await field.fill(title);
  await field.press("Enter");
  await expect(rowButton(today(), title)).toBeVisible();

  await reload(page, layout);
  await expect(rowButton(today(), title)).toBeVisible();
});
