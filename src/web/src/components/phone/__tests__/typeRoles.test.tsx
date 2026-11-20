import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { loadTokens } from "../../../../../shared/design/generate.mjs";
import { Masthead } from "../Masthead";
import { TodoRow, type TodoRowProps } from "../TodoRow";
import { makeTodo, NOW, TZ } from "./fixtures";

type Style = { size: number; lineHeight: number; weight: number };
const type = loadTokens().type as Record<string, Record<string, Style>>;

/** A role's size, line height and weight, in px, from its class name. */
function role(className: string) {
  const [, density, name] =
    className.match(/^text-n-(phone|wide)-([a-z-]+)$/) ?? [];
  const key = name?.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const style = type[density]?.[key ?? ""];
  expect(style, className).toBeDefined();
  return [style.size, style.lineHeight, style.weight];
}

/** The one text-n-<density>-<role> class on an element. */
function roleClass(el: HTMLElement) {
  const roles = [...el.classList].filter((c) =>
    /^text-n-(phone|wide)-/.test(c),
  );
  expect(roles).toHaveLength(1);
  return roles[0];
}

function renderRow(density: "phone" | "wide") {
  const props: TodoRowProps = {
    todo: makeTodo(),
    subtasks: [],
    now: NOW,
    timeZone: TZ,
    checked: false,
    collapsing: false,
    highlighted: false,
    density,
    onCheck: vi.fn(),
    onOpen: vi.fn(),
    onMenu: vi.fn(),
  };
  render(
    <ul>
      <TodoRow {...props} />
    </ul>,
  );
  return screen.getByText("Water the plants");
}

// The row titles and the masthead keep the size and line height they had
// before the web read tokens.json (Decisions, 2026-11-19): 15/21 and 17/23
// for the rows (as the Mac popover and the iPhone draw them), 46/46 for the
// masthead.
describe("the web's type roles", () => {
  it("sets a wide row's title at 15/21, medium", () => {
    const title = renderRow("wide");
    expect(roleClass(title)).toBe("text-n-wide-row-title");
    expect(role(roleClass(title))).toEqual([15, 21, 500]);
  });

  it("sets a phone row's title at 17/23, medium", () => {
    const title = renderRow("phone");
    expect(roleClass(title)).toBe("text-n-phone-row-title");
    expect(role(roleClass(title))).toEqual([17, 23, 500]);
  });

  it("sets the masthead at 46/46, bold, in the display face", () => {
    render(<Masthead title="Today" subline="Sunday, October 18" />);
    const title = screen.getByRole("heading", { name: "Today" });
    expect(roleClass(title)).toBe("text-n-phone-display");
    expect(role(roleClass(title))).toEqual([46, 46, 700]);
    expect(title).toHaveClass("font-n-display");
    const subline = screen.getByText("Sunday, October 18");
    expect(role(roleClass(subline))).toEqual([14, 19, 400]);
  });
});
