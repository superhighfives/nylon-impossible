import { expect, reload, test } from "./fixtures";

const TITLE = "Call Mum about Sunday lunch";

// #830, principle 8: a tab that reloads onto a new build (#691) goes from the
// board to the board. The server renders it with your todos, so the first
// paint isn't the skeleton.
test("the server renders the board with your todos, not the skeleton", async ({
  board: page,
  layout,
}) => {
  for (const path of ["/", "/someday"]) {
    // The page's own request context, so it carries the session cookie.
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html, `${path}'s first HTML`).toContain(TITLE);
    expect(html, `${path}'s first HTML`).not.toContain("data-skeleton-rows");
  }

  // And the browser takes it over as it is: a hydration mismatch would fail
  // the test as a page error.
  await reload(page, layout);
  await expect(page.getByRole("button", { name: TITLE }).first()).toBeVisible();
});
