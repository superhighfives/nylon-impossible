import { DndContext } from "@dnd-kit/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NOW, TZ } from "@/components/phone/__tests__/fixtures";
import { DonePage } from "@/components/phone/DonePage";
import { Column } from "../Column";
import { DoneColumn } from "../DoneColumn";

/** The line's words and the decorative squiggle beside them. */
function emptyLine(text: string) {
  const words = screen.getByText(text);
  const line = words.closest("[data-empty-line]");
  expect(line).not.toBeNull();
  return { words, line: line as HTMLElement };
}

function expectRowLine(text: string, size: string) {
  const { words, line } = emptyLine(text);
  // Row type, not a heading: the row title's size, regular, no display face.
  expect(words).toHaveClass(size);
  expect(line.outerHTML).not.toContain("font-n-display");
  expect(line.outerHTML).not.toContain("font-semibold");
  // The squiggle is decorative; the words are all that's read out.
  const icon = line.querySelector("svg");
  expect(icon).not.toBeNull();
  expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(line).toHaveTextContent(new RegExp(`^${text}$`));
}

describe("empty line", () => {
  it("draws an empty board column as a row under its composer", () => {
    render(
      <DndContext>
        <Column
          listId="someday"
          title="Someday"
          subline="Whenever you're ready"
          rows={[]}
          subtasksOf={() => []}
          checked={new Set()}
          collapsing={new Set()}
          highlightedId={null}
          selectedId={null}
          indicator={null}
          composer={<div data-testid="composer" />}
          empty="Nothing here yet."
          loading={false}
          error={null}
          now={NOW}
          timeZone={TZ}
          onCheck={vi.fn()}
          onOpen={vi.fn()}
          onMenu={vi.fn()}
        />
      </DndContext>,
    );
    expectRowLine("Nothing here yet.", "text-[0.9375rem]");
    const { line } = emptyLine("Nothing here yet.");
    // Muted until something's dragged over it.
    expect(line.parentElement).toHaveClass("text-n-ink-subtle");
  });

  it("keeps the composer's height above Done's line, so it sits level with the columns beside it", () => {
    render(
      <DoneColumn
        todos={[]}
        listName={() => "Today"}
        listInSentence={() => "today"}
        now={NOW}
        timeZone={TZ}
        selectedId={null}
        onSelect={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    expectRowLine("Nothing done yet.", "text-[0.9375rem]");
    const { line } = emptyLine("Nothing done yet.");
    const spacer = line.previousElementSibling;
    expect(spacer).toHaveClass("h-10");
    expect(spacer).toHaveAttribute("aria-hidden", "true");
  });

  it("draws the phone's Done page as a large centred squiggle over the words", () => {
    render(
      <DonePage
        todos={[]}
        listName={() => "Today"}
        listInSentence={() => "today"}
        timeZone={TZ}
        onRestore={vi.fn()}
      />,
    );
    const { words, line } = emptyLine("Nothing done yet.");
    expect(line).toHaveClass("items-center", "text-center");
    expect(words).toHaveClass("text-[1.0625rem]");
    expect(line.querySelector("svg")).toHaveAttribute("width", "96");
  });
});
