import {
  column,
  expect,
  phonePage,
  phoneTab,
  reload,
  test,
  toast,
} from "./fixtures";

test.describe("wide", () => {
  test.skip(
    ({ layout }) => layout !== "wide",
    "The sidebar and columns are the wide board's",
  );

  // Settled "Deleting a list": straight away, with Undo, no confirmation.
  test("on wide, a list is created, renamed and deleted from the sidebar and its column", async ({
    board: page,
    layout,
    tag,
  }) => {
    const name = `Smoke list ${tag}`;
    const renamed = `Smoke renamed ${tag}`;
    const sidebar = page.getByRole("complementary", { name: "Sidebar" });
    const entry = (n: string) =>
      sidebar
        .getByRole("navigation", { name: "Lists" })
        .getByRole("button", { name: n, exact: true });

    await sidebar.getByRole("button", { name: "New list" }).click();
    const nameField = page.getByRole("textbox", { name: "Name", exact: true });
    await nameField.fill(name);
    await nameField.press("Enter");
    await expect(entry(name)).toBeVisible();
    await expect(column(page, name)).toBeVisible();

    // The column's title is the rename button.
    await column(page, name)
      .getByRole("heading", { level: 2 })
      .getByRole("button", { name, exact: true })
      .click();
    // The input replaces the heading, so the column can't be found by it now.
    const nameInput = page.getByRole("textbox", { name: "List name" });
    await nameInput.fill(renamed);
    await nameInput.press("Enter");
    await expect(entry(renamed)).toBeVisible();
    await expect(column(page, renamed)).toBeVisible();
    await expect(entry(name)).toHaveCount(0);

    await reload(page, layout);
    await expect(entry(renamed)).toBeVisible();
    await expect(column(page, renamed)).toBeVisible();

    await column(page, renamed)
      .getByRole("button", { name: `${renamed} options` })
      .click();
    await page.getByRole("menuitem", { name: "Delete list" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(entry(renamed)).toHaveCount(0);
    await expect(column(page, renamed)).toHaveCount(0);

    const deleted = toast(page, `Deleted “${renamed}”`);
    await expect(deleted).toBeVisible();
    await deleted.getByRole("button", { name: "Undo" }).click();
    await expect(entry(renamed)).toBeVisible();
    await expect(column(page, renamed)).toBeVisible();
  });
});

test.describe("phone", () => {
  test.skip(
    ({ layout }) => layout !== "phone",
    "The Lists page is the phone's",
  );

  // The phone layout has no way to delete a list (only the wide board's column
  // menu does), so it creates one.
  test("on phone, a list is created from the Lists page", async ({
    board: page,
    layout,
    tag,
  }) => {
    const name = `Smoke list ${tag}`;
    const lists = phonePage(page, "Lists");

    await phoneTab(page, "Lists").tap();
    const field = lists.getByRole("textbox", { name: "New list name" });
    await field.fill(name);
    await field.press("Enter");
    // Creating a list opens it.
    await expect(lists.getByRole("heading", { level: 1, name })).toBeVisible();

    await reload(page, layout, "/lists");
    await expect(
      phonePage(page, "Lists").getByRole("button", { name, exact: true }),
    ).toBeVisible();
  });
});
