import { useDraggable } from "@dnd-kit/core";
import { useLayoutEffect, useRef } from "react";
import { settleTiming } from "@/components/wide/settle";
import { partOffset } from "@/lib/dragOrder";
import type { TodoWithUrls } from "@/types/database";
import { TodoRow, type TodoRowProps } from "./TodoRow";
import type { PhoneDrag } from "./usePhoneDrag";

type RowProps = Omit<
  TodoRowProps,
  "todo" | "subtasks" | "checked" | "collapsing" | "highlighted"
>;

/** A row a long-press (touch) or a 6px drag (pointer) picks up. */
function DraggableRow({
  todo,
  listId,
  index,
  drag,
  animate,
  ...props
}: TodoRowProps & {
  listId: string;
  index: number;
  drag: PhoneDrag | null;
  /** False under reduced motion: rows part and settle without sliding. */
  animate: boolean;
}) {
  const { setNodeRef, listeners, attributes, transform } = useDraggable({
    id: todo.id,
    data: { todo, listId },
  });
  // dnd-kit's attributes make the element a "button" with its own
  // description; the row's button already is one, with a better name.
  const { role: _role, tabIndex: _tabIndex, ...rest } = attributes;
  const mine = drag?.listId === listId ? drag : null;
  const active = mine?.todo.id === todo.id;
  const touch = mine?.mode === "touch";
  // Touch moves the row itself, vertically, and parts the others; a pointer
  // drags a preview and leaves the rows in place.
  const y = touch
    ? active
      ? (transform?.y ?? 0)
      : partOffset(mine.from, mine.slot, index, mine.height)
    : 0;
  return (
    <TodoRow
      {...props}
      todo={todo}
      dragging={active && !touch}
      lifted={active && touch}
      rowRef={setNodeRef}
      rowStyle={
        touch
          ? {
              transform: y ? `translateY(${y}px)` : undefined,
              // The lifted row keeps up with the finger; the others slide.
              transition:
                active || !animate
                  ? "none"
                  : "transform var(--n-duration-fast) var(--n-ease-out-strong)",
            }
          : undefined
      }
      bodyProps={{ ...listeners, ...rest, "data-row-id": todo.id }}
    />
  );
}

/**
 * A page's rows, which reorder by dragging: the rows part around a touch
 * drag, and a pointer drag draws the yellow line where it would land. After
 * a drop the rows ease from where they were into the new order.
 */
export function PhoneRows({
  listId,
  rows,
  drag,
  settleFrom,
  animate,
  subtasksOf,
  checked,
  collapsing,
  highlightedId,
  ...props
}: RowProps & {
  listId: string;
  rows: TodoWithUrls[];
  drag: PhoneDrag | null;
  /** Where the rows were on screen at a drop, by id. */
  settleFrom: Map<string, number> | null;
  animate: boolean;
  subtasksOf: (id: string) => TodoWithUrls[];
  checked: ReadonlySet<string>;
  collapsing: ReadonlySet<string>;
  highlightedId: string | null;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const settled = useRef<Map<string, number> | null>(null);
  // Runs in the commit that shows the dropped order, before it paints.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !settleFrom || settled.current === settleFrom) return;
    settled.current = settleFrom;
    const timing = settleTiming();
    if (!timing) return;
    for (const li of list.querySelectorAll<HTMLElement>(
      ":scope > li[data-phone-row]",
    )) {
      const id = li.querySelector<HTMLElement>("[data-row-id]")?.dataset.rowId;
      const was = id ? settleFrom.get(id) : undefined;
      if (was === undefined) continue;
      const dy = was - li.getBoundingClientRect().top;
      if (dy === 0) continue;
      li.animate?.(
        [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
        timing,
      );
    }
  }, [settleFrom]);
  const line = drag?.listId === listId ? drag.lineY : null;
  return (
    <ul ref={listRef} data-phone-rows={listId} className="relative pt-2">
      {rows.map((todo, i) => (
        <DraggableRow
          key={todo.id}
          {...props}
          todo={todo}
          listId={listId}
          index={i}
          drag={drag}
          animate={animate}
          subtasks={subtasksOf(todo.id)}
          checked={checked.has(todo.id)}
          collapsing={collapsing.has(todo.id)}
          highlighted={highlightedId === todo.id}
        />
      ))}
      {line !== null && (
        <li
          aria-hidden="true"
          data-drop-indicator
          style={{ top: line }}
          className="pointer-events-none absolute inset-x-5 h-0.5 -translate-y-1/2 rounded-full bg-n-brand"
        />
      )}
    </ul>
  );
}
