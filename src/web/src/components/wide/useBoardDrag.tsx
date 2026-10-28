import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useRef, useState } from "react";
import { displayTitle } from "@/components/phone/model";
import type { TodoActions } from "@/components/phone/useTodoActions";
import { dropPlacement, slotAt } from "@/lib/dragOrder";
import type { TodoWithUrls } from "@/types/database";
import { columnRows } from "./boardDom";
import type { DropIndicator } from "./Column";
import { resolveDrop } from "./drop";

/** Pointer y for a drag event: where it started plus how far it moved. */
function pointerY(e: DragMoveEvent | DragEndEvent) {
  const start = e.activatorEvent as PointerEvent | MouseEvent;
  return (start?.clientY ?? 0) + e.delta.y;
}

/**
 * Drag and drop on the board: pick a row up from anywhere but its checkbox,
 * drop it between rows of any column (the indicator marks the slot) or on a
 * sidebar list. Spread `handlers` onto the `DndContext`.
 */
export function useBoardDrag({
  rowsFor,
  actions,
  onStart,
}: {
  rowsFor: (listId: string) => TodoWithUrls[];
  actions: Pick<TodoActions, "move" | "place">;
  /** A drag closes the context menu. */
  onStart: () => void;
}) {
  const [dragging, setDragging] = useState<TodoWithUrls | null>(null);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  // The pointer-up that ends a drag can land as a click on a row.
  const justDragged = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const slotFor = (listId: string, todo: TodoWithUrls, y: number) => {
    const rowEls = columnRows(listId).filter(
      (el) => el.dataset.rowId !== todo.id,
    );
    const mids = rowEls.map((el) => {
      const r =
        el.closest("li")?.getBoundingClientRect() ?? el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const { index } = dropPlacement(rowsFor(listId), todo, slotAt(mids, y));
    return { index, rowEls };
  };

  const onDragStart = (e: DragStartEvent) => {
    const todo = e.active.data.current?.todo as TodoWithUrls | undefined;
    setDragging(todo ?? null);
    onStart();
  };

  const onDragMove = (e: DragMoveEvent) => {
    const todo = dragging;
    const overId = e.over?.id;
    if (!todo || typeof overId !== "string" || !overId.startsWith("col:")) {
      setIndicator(null);
      return;
    }
    const listId = overId.slice(4);
    const { index, rowEls } = slotFor(listId, todo, pointerY(e));
    const list = document.querySelector<HTMLElement>(
      `[data-column-body="${CSS.escape(listId)}"] .relative`,
    );
    if (!list) return;
    const base = list.getBoundingClientRect().top;
    const li = (el: HTMLElement | undefined) =>
      el?.closest("li")?.getBoundingClientRect();
    const before = li(rowEls[index]);
    const after = li(rowEls[index - 1]);
    const top = before ? before.top - base : after ? after.bottom - base : 8;
    setIndicator((cur) =>
      cur && cur.listId === listId && cur.index === index && cur.y === top
        ? cur
        : { listId, index, y: top },
    );
  };

  const onDragCancel = () => {
    setDragging(null);
    setIndicator(null);
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const todo = dragging;
    const overId = e.over?.id;
    onDragCancel();
    if (!todo || typeof overId !== "string") return;
    const slot = overId.startsWith("col:")
      ? slotFor(overId.slice(4), todo, pointerY(e)).index
      : 0;
    const drop = resolveDrop({ overId, todo, rowsFor, slot });
    if (drop?.kind === "move") actions.move(todo, drop.listId);
    else if (drop?.kind === "place") {
      actions.place(todo, drop.listId, drop.position);
    }
  };

  return {
    dragging,
    indicator,
    justDragged,
    sensors,
    handlers: { onDragStart, onDragMove, onDragEnd, onDragCancel },
  };
}

/** What follows the pointer while a row is dragged. */
export function DragPreview({ todo }: { todo: TodoWithUrls }) {
  return (
    <div className="flex w-72 cursor-grabbing items-start gap-3 rounded-n-field border border-n-hairline bg-n-surface px-3 py-2.5">
      <span
        aria-hidden="true"
        className="mt-px size-[1.375rem] shrink-0 rounded-[6px] border-[1.75px] border-n-ink"
      />
      <span className="line-clamp-2 text-[0.9375rem] leading-[1.4] font-medium text-n-ink">
        {displayTitle(todo)}
      </span>
    </div>
  );
}
