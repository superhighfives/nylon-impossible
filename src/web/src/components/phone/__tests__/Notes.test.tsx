import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Notes, NotesMarkdown } from "../Notes";

/** A code block's room outside its fill: one notes line less its `p-3`. */
const CODE_SPACE = "my-[calc(1lh-var(--spacing)*3)]";

/** A typed blank line, kept at one line's height. */
const GAP = "mt-[1lh]";

function codeBlocks(text: string) {
  const { container } = render(<NotesMarkdown text={text} />);
  return [...container.querySelectorAll("pre")];
}

// Code blocks get 12 of padding inside their fill and the rest of their two
// fence lines outside it, so the drawn note is as tall as the editor and
// nothing below moves (#835, principle 8).
describe("a code block in the notes", () => {
  it("has 12 of padding on every side and a line less 12 above and below", () => {
    const [pre] = codeBlocks("Work:\n```\nssh-ed25519 AAAA\n```\nAir");
    expect(pre).toHaveClass("p-3", CODE_SPACE);
    expect(pre).not.toHaveClass("px-2");
    // Its wrapper takes no gap when no blank line was typed beside it.
    expect(pre.parentElement).not.toHaveClass(GAP);
    // …and is its own formatting context, so the margins stay inside it.
    expect(pre.parentElement).toHaveClass("flow-root");
  });

  it("adds a full line where a blank line is typed beside it", () => {
    const [pre] = codeBlocks("Work:\n\n```\nssh-ed25519 AAAA\n```");
    expect(pre).toHaveClass("p-3", CODE_SPACE);
    expect(pre.parentElement).toHaveClass(GAP, "flow-root");
  });

  it("keeps its outer space as the note's first and last block", () => {
    const pres = codeBlocks("```\nfirst\n```\nAir\n```\nlast\n```");
    expect(pres).toHaveLength(2);
    for (const pre of pres) {
      expect(pre).toHaveClass("p-3", CODE_SPACE);
    }
    expect(pres[0].parentElement?.previousElementSibling).toBeNull();
    expect(pres[1].parentElement?.nextElementSibling).toBeNull();
  });

  it("keeps Copy in the fill's top-right corner", () => {
    codeBlocks("```\nssh-ed25519 AAAA\n```");
    const copy = screen.getByRole("button", { name: "Copy code" });
    expect(copy).toHaveClass("absolute", "right-0");
    expect(copy).toHaveClass("top-[calc(1lh-var(--spacing)*3)]");
  });
});

describe("a heading in the notes", () => {
  it("draws semibold at the notes' size, and inline bold stays bold", () => {
    render(<NotesMarkdown text={"# Work\nSome **bold** text"} />);
    const heading = screen.getByRole("heading", { name: "Work" });
    expect(heading.tagName).toBe("H3");
    expect(heading).toHaveClass("font-semibold", "text-inherit");
    expect(heading).not.toHaveClass("font-bold");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });
});

describe("the drawn notes", () => {
  it("sit on the detail's background, with no container", () => {
    render(
      <Notes
        value={"# Work\n```\nssh-ed25519 AAAA\n```"}
        onChange={vi.fn()}
        onBlur={vi.fn()}
        label="label"
        rows={3}
        className="text-n-phone-note-body"
      />,
    );
    const drawn = document.querySelector<HTMLElement>("[data-notes-rendered]");
    if (!drawn) throw new Error("not rendered");
    const boxes = [...drawn.classList].filter((c) =>
      /^(bg-|border|shadow|ring-|outline-n)/.test(c),
    );
    expect(boxes).toEqual([]);
    // Nor around it.
    const wrapper = drawn.parentElement;
    expect(wrapper?.className ?? "").not.toMatch(/\b(bg-|border)/);
  });
});
