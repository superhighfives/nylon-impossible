import { DndContext } from "@dnd-kit/core";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhoneRows } from "../PhoneRows";
import type { PhoneDrag } from "../usePhoneDrag";
import { makeTodo, NOW, TZ } from "./fixtures";

const rows = [
  makeTodo({ id: "a", title: "Call the bank", position: "a0" }),
  makeTodo({ id: "b", title: "Water the plants", position: "a1" }),
  makeTodo({ id: "c", title: "Book the dentist", position: "a2" }),
];

function renderRows(drag: PhoneDrag | null) {
  return render(
    <DndContext>
      <PhoneRows
        listId="list-today"
        rows={rows}
        drag={drag}
        settleFrom={null}
        animate
        subtasksOf={() => []}
        checked={new Set()}
        collapsing={new Set()}
        highlightedId={null}
        now={NOW}
        timeZone={TZ}
        onCheck={vi.fn()}
        onOpen={vi.fn()}
        onMenu={vi.fn()}
      />
    </DndContext>,
  );
}

const drag = (over: Partial<PhoneDrag>): PhoneDrag => ({
  todo: rows[0],
  listId: "list-today",
  mode: "touch",
  from: 0,
  slot: 2,
  lineY: null,
  gapY: 96,
  height: 48,
  tilt: 1,
  ...over,
});

describe("PhoneRows", () => {
  it("fills a touch drag's gap with soft yellow, where the rows part", () => {
    renderRows(drag({}));
    const gap = document.querySelector<HTMLElement>("[data-drop-gap]");
    expect(gap?.style.top).toBe("96px");
    expect(gap?.style.height).toBe("48px");
    expect(gap?.firstElementChild).toHaveClass(
      "bg-n-brand-soft",
      "rounded-n-field",
    );
    // The rows that part for it: the ones the dragged row passes.
    const parted = [
      ...document.querySelectorAll<HTMLElement>("li[data-phone-row]"),
    ].map((li) => li.style.transform);
    expect(parted.slice(1)).toEqual(["translateY(-48px)", "translateY(-48px)"]);
    // A gap, not a line: no border, no text.
    expect(gap).toHaveTextContent("");
    expect(document.querySelector("[data-drop-indicator]")).toBeNull();
  });

  it("lifts the touched row tilted by its drag's angle", () => {
    renderRows(drag({ tilt: -0.7 }));
    const card = document
      .querySelector("[data-lifted]")
      ?.querySelector<HTMLElement>("[data-row-card]");
    expect(card).toHaveClass("n-lifted");
    expect(card?.style.getPropertyValue("--n-drag-tilt")).toBe("-0.7deg");
  });

  it("a pointer drag draws the line with its dot, and no gap", () => {
    renderRows(drag({ mode: "pointer", gapY: null, lineY: 48 }));
    expect(document.querySelector("[data-drop-gap]")).toBeNull();
    const line = document.querySelector("[data-drop-indicator]");
    expect(line).toHaveClass("bg-n-brand", "h-0.5");
    expect(line?.querySelector("[data-drop-dot]")).toHaveClass(
      "bg-n-brand",
      "size-2",
      "ring-2",
      "ring-n-canvas",
      "animate-n-dot-in",
    );
  });
});
