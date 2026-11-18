import {
  column,
  expect,
  phonePage,
  reload,
  rowButton,
  sheet,
  test,
} from "./fixtures";

const TITLE = "Review PR for the sync engine";

// Settled "Selecting on wide" (a second click opens the todo beside its
// column) and Settled "Saving" (every edit saves, no Save button).
test("opening a todo and editing its title and notes saves them", async ({
  board: page,
  layout,
  tag,
}) => {
  const today = () =>
    layout === "wide" ? column(page, "Today") : phonePage(page, "Today");
  const newTitle = `Smoke edited ${tag}`;
  const notes = `Smoke notes ${tag}`;

  if (layout === "wide") {
    await rowButton(today(), TITLE).click();
    await expect(sheet(page)).toHaveCount(0);
    await rowButton(today(), TITLE).click();
  } else {
    await rowButton(today(), TITLE).tap();
  }
  const open = sheet(page);
  await expect(open).toBeVisible();
  await expect(open.getByLabel("Title", { exact: true })).toHaveValue(TITLE);
  await expect(open.getByRole("button", { name: /^save$/i })).toHaveCount(0);

  await open.getByLabel("Title", { exact: true }).fill(newTitle);
  await open.getByRole("textbox", { name: "Notes" }).fill(notes);
  await open.getByRole("button", { name: "Close" }).click();
  await expect(open).toHaveCount(0);
  await expect(rowButton(today(), newTitle)).toBeVisible();

  await reload(page, layout);
  await expect(rowButton(today(), newTitle)).toBeVisible();
  await expect(rowButton(today(), TITLE)).toHaveCount(0);
  // The notes reached D1 too.
  if (layout === "wide") {
    await rowButton(today(), newTitle).dblclick();
  } else {
    await rowButton(today(), newTitle).tap();
  }
  await expect(sheet(page).getByLabel("Notes")).toContainText(notes);
});
