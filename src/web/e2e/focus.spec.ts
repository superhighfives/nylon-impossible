import type { Locator, Page } from "@playwright/test";
import {
  column,
  expect,
  phonePage,
  rowButton,
  sheet,
  test,
  titles,
} from "./fixtures";

const TITLE = "Review PR for the sync engine";

/**
 * What focus draws on `el`: whether the soft tint (`n-focus`'s
 * background-image) is there, the outline (`ink` when it's the page's ink)
 * and its offset, and the box-shadow.
 */
function look(el: Locator) {
  return el.evaluate((node) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--n-color-ink)";
    document.body.appendChild(probe);
    const ink = getComputedStyle(probe).color;
    probe.remove();
    const cs = getComputedStyle(node);
    const drawn = cs.outlineStyle !== "none" && cs.outlineWidth !== "0px";
    return {
      tint: cs.backgroundImage.includes("gradient"),
      outline: drawn
        ? `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor === ink ? "ink" : cs.outlineColor}`
        : "none",
      boxShadow: cs.boxShadow,
    };
  });
}

const CALM = { tint: true, outline: "none", boxShadow: "none" };
const KEYED = { tint: true, outline: "2px solid ink", boxShadow: "none" };

/** Opens TITLE's sheet: two clicks on wide, a tap on the phone. */
async function open(page: Page, layout: string) {
  // Outline colour eases with `transition-colors`; read the settled look.
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; }",
  });
  if (layout === "wide") {
    const today = column(page, "Today");
    await rowButton(today, TITLE).click();
    await rowButton(today, TITLE).click();
  } else {
    await rowButton(phonePage(page, "Today"), TITLE).tap();
  }
  await expect(sheet(page)).toBeVisible();
  return sheet(page);
}

// #773 and Visual: "A mouse click never draws a keyboard-strength ring."
test("clicking into the open todo's title shows the tint and no ring", async ({
  board: page,
  layout,
}) => {
  const title = (await open(page, layout)).locator("[data-detail-title]");
  if (layout === "wide") await title.click();
  else await title.tap();
  await expect(title).toBeFocused();
  expect(await look(title)).toEqual(CALM);
});

test("the composer shows the tint on a click, and the ring too from the keyboard", async ({
  board: page,
  layout,
}) => {
  test.skip(layout !== "wide", "The phone's composer has no ring by touch");
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; }",
  });
  const today = column(page, "Today");
  const field = today.getByRole("textbox", { name: "New todo in today" });
  const form = today.locator("form[data-composer]");

  await field.click();
  await expect(field).toBeFocused();
  expect(await look(form)).toEqual(CALM);

  // ↑ from the first todo reaches Add; Return starts typing.
  const [first] = await titles(today);
  await rowButton(today, first).click();
  await page.keyboard.press("ArrowUp");
  await expect(field).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(field).not.toHaveAttribute("readonly");
  expect(await look(form)).toEqual(KEYED);
});

test("a button the pointer presses draws neither the tint nor the ring", async ({
  board: page,
  layout,
}) => {
  test.skip(layout !== "wide", "A mouse press, on the wide board");
  const list = (await open(page, layout)).getByRole("button", {
    name: /^List: /,
  });
  // Focus lands on the press; it isn't released, so nothing opens.
  const box = await list.boundingBox();
  if (!box) throw new Error("No List row");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(list).toBeFocused();
  expect(await look(list)).toEqual({
    tint: false,
    outline: "none",
    boxShadow: "none",
  });
});

test("Tab through the open todo: every field and button shows the tint and one ink ring", async ({
  board: page,
  layout,
}) => {
  // The wide board's Tab moves between sections; the phone sheet's is the
  // browser's own.
  test.skip(layout !== "phone", "Tab is the browser's on the phone sheet");
  await open(page, layout);
  const seen = { field: 0, button: 0 };
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const active = page.locator(":focus");
    const kind = await active.evaluate((n) =>
      !/\bn-focus(-inset)?\b/.test(n.className.toString())
        ? null
        : n.matches("textarea, input, select")
          ? "field"
          : "button",
    );
    if (!kind) continue;
    seen[kind]++;
    const label = await active.evaluate(
      (n) => n.getAttribute("aria-label") ?? n.textContent ?? n.tagName,
    );
    expect(await look(active), `${kind} ${label}`).toEqual(KEYED);
  }
  expect(seen.field).toBeGreaterThan(0);
  expect(seen.button).toBeGreaterThan(0);
});
