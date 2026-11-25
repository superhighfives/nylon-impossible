import { useDraggable } from "@dnd-kit/core";
import { useLayoutEffect, useRef } from "react";
import { settleTiming } from "@/components/wide/settle";
import { swingKeyframes } from "@/components/wide/tilt";
import { partOffset } from "@/lib/dragOrder";
import type { TodoWithUrls } from "@/types/database";
import { TodoRow, type TodoRowProps } from "./TodoRow";
import type { PhoneDrag, PhoneSettle } from "./usePhoneDrag";

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
  // A drag moves the row itself, vertically, and parts the others.
  const y = mine
    ? active
      ? (transform?.y ?? 0)
      : partOffset(mine.from, mine.slot, index, mine.height)
    : 0;
  return (
    <TodoRow
      {...props}
      todo={todo}
      lifted={active}
      tilt={active ? mine.tilt : undefined}
      rowRef={setNodeRef}
      rowStyle={
        mine
          ? {
              transform: y ? `translateY(${y}px)` : undefined,
              // The lifted row keeps up with the drag; the others slide.
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
 * A page's rows, which reorder by dragging: the rows part around the lifted
 * row to open a soft yellow gap where it would land. After a drop the rows ease from where they were into
 * the new order, and the dropped one swings past level as it lands.
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
  /** Where the rows were on screen at a drop, and what landed. */
  settleFrom: PhoneSettle | null;
  animate: boolean;
  subtasksOf: (id: string) => TodoWithUrls[];
  checked: ReadonlySet<string>;
  collapsing: ReadonlySet<string>;
  highlightedId: string | null;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const settled = useRef<PhoneSettle | null>(null);
  // Runs in the commit that shows the dropped order, before it paints.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !settleFrom || settled.current === settleFrom) return;
    settled.current = settleFrom;
    const timing = settleTiming();
    if (!timing) return;
    const { tops, landing } = settleFrom;
    for (const li of list.querySelectorAll<HTMLElement>(
      ":scope > li[data-phone-row]",
    )) {
      const id = li.querySelector<HTMLElement>("[data-row-id]")?.dataset.rowId;
      const was = id ? tops.get(id) : undefined;
      if (was === undefined) continue;
      if (id === landing.id && landing.swing !== 0) {
        li.animate?.(swingKeyframes(landing.tilt, landing.swing), timing);
      }
      const dy = was - li.getBoundingClientRect().top;
      if (dy === 0) continue;
      li.animate?.(
        [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
        timing,
      );
    }
  }, [settleFrom]);
  const gap = drag?.listId === listId ? drag.gapY : null;
  return (
    <ul ref={listRef} data-phone-rows={listId} className="relative pt-2">
      {gap !== null && drag && (
        // Under the rows, filling the space they part to leave.
        <li
          aria-hidden="true"
          data-drop-gap
          style={{ top: gap, height: drag.height }}
          className={`pointer-events-none absolute inset-x-0 ${
            animate
              ? "transition-[top] duration-(--n-duration-fast) ease-n-out"
              : ""
          }`}
        >
          <span className="absolute inset-x-2 inset-y-1 rounded-n-field bg-n-brand-soft" />
        </li>
      )}
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
    </ul>
  );
}
