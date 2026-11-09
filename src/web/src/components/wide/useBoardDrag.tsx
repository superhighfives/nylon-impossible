import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import { displayTitle } from "@/components/phone/model";
import type { TodoActions } from "@/components/phone/useTodoActions";
import { useHints } from "@/hooks/useHints";
import { dropLineY, dropPlacement, slotAt } from "@/lib/dragOrder";
import type { TodoWithUrls } from "@/types/database";
import { columnRows } from "./boardDom";
import type { DropIndicator } from "./Column";
import { resolveDrop } from "./drop";
import {
  captureRows,
  landAt,
  previewRect,
  SETTLE_TTL_MS,
  type Settle,
} from "./settle";

/** Where the line goes in an empty column, from the top of its row list. */
const EMPTY_LINE_Y = 8;

/** How near the board's side edges a dragged todo scrolls it, in px. */
const EDGE = 64;
/** How far each tick scrolls with the pointer right at the edge, in px. */
const EDGE_SPEED = 18;
const EDGE_TICK_MS = 16;

/**
 * How far one tick scrolls the board (`rect`) sideways with a dragged todo
 * at `pointer`: leftward (negative) near its left edge, rightward near its
 * right, faster the nearer it is, and 0 anywhere else. So a todo can reach a
 * list that's off screen.
 */
export function edgeScrollStep(
  pointer: { x: number; y: number },
  rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
): number {
  const { x, y } = pointer;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    return 0;
  }
  if (x < rect.left + EDGE) {
    return -Math.ceil(EDGE_SPEED * (1 - (x - rect.left) / EDGE));
  }
  if (x > rect.right - EDGE) {
    return Math.ceil(EDGE_SPEED * (1 - (rect.right - x) / EDGE));
  }
  return 0;
}

/**
 * Pointer y for a drag event: where it started plus how far it moved. Only a
 * fallback: once the column scrolls, `delta` includes the scroll as well.
 */
function pointerY(e: DragMoveEvent | DragEndEvent) {
  const start = e.activatorEvent as PointerEvent | MouseEvent;
  return (start?.clientY ?? 0) + e.delta.y;
}

/**
 * Drag and drop on the board: pick a row up from anywhere but its checkbox,
 * drop it between rows of any column (the indicator marks the slot) or on a
 * sidebar list. Held near the board's left or right edge, it scrolls the
 * board, so a list that's off screen can take it. Spread `handlers` onto the
 * `DndContext`, and pass `settle` to the columns so their rows ease into a
 * new order after a drop.
 */
export function useBoardDrag({
  rowsFor,
  actions,
  onStart,
  board,
}: {
  rowsFor: (listId: string) => TodoWithUrls[];
  actions: Pick<TodoActions, "move" | "place">;
  /** A drag closes the context menu. */
  onStart: () => void;
  /** The board's sideways-scrolling row of columns. */
  board?: () => HTMLElement | null;
}) {
  const { reducedMotion } = useHints();
  const [dragging, setDragging] = useState<TodoWithUrls | null>(null);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const [settle, setSettle] = useState<Settle | null>(null);
  // The line as last drawn, which is where a release drops. A ref, so a
  // release in the same tick as the last move still sees it.
  const shown = useRef<DropIndicator | null>(null);
  // The real pointer, tracked while dragging.
  const pointer = useRef<number | null>(null);
  const pointerX = useRef<number | null>(null);
  const untrack = useRef<(() => void) | null>(null);
  // The pointer-up that ends a drag can land as a click on a row.
  const justDragged = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => () => untrack.current?.(), []);
  // A drop's reorder renders once the optimistic update lands; after that,
  // later changes to the columns shouldn't animate from the old places.
  useEffect(() => {
    if (!settle) return;
    const done = setTimeout(() => setSettle(null), SETTLE_TTL_MS);
    return () => clearTimeout(done);
  }, [settle]);

  /** The slot under the pointer in column `listId`, and where its line goes. */
  const measure = (
    listId: string,
    todo: TodoWithUrls,
    y: number,
  ): DropIndicator | null => {
    const area = document.querySelector<HTMLElement>(
      `[data-drop-area="${CSS.escape(listId)}"]`,
    );
    if (!area) return null;
    const rowEls = columnRows(listId);
    const rects = rowEls.map((el) =>
      (el.closest("li") ?? el).getBoundingClientRect(),
    );
    const dragged = rowEls.findIndex((el) => el.dataset.rowId === todo.id);
    const mids = rects
      .filter((_, i) => i !== dragged)
      .map((r) => r.top + r.height / 2);
    const { index } = dropPlacement(rowsFor(listId), todo, slotAt(mids, y));
    // Measured against the element the line is drawn in.
    const base = area.getBoundingClientRect().top;
    const line = dropLineY(rects, index, dragged, y);
    return { listId, index, y: line === null ? EMPTY_LINE_Y : line - base };
  };

  const show = (next: DropIndicator | null) => {
    shown.current = next;
    setIndicator((cur) =>
      cur &&
      next &&
      cur.listId === next.listId &&
      cur.index === next.index &&
      cur.y === next.y
        ? cur
        : next,
    );
  };

  const onDragStart = (e: DragStartEvent) => {
    const todo = e.active.data.current?.todo as TodoWithUrls | undefined;
    setDragging(todo ?? null);
    untrack.current?.();
    const track = (ev: PointerEvent) => {
      pointer.current = ev.clientY;
      pointerX.current = ev.clientX;
    };
    window.addEventListener("pointermove", track, { capture: true });
    // Scrolls while the pointer rests near an edge, not only as it moves.
    const edge = setInterval(() => {
      const el = board?.();
      const x = pointerX.current;
      const y = pointer.current;
      if (!el || x === null || y === null) return;
      const step = edgeScrollStep({ x, y }, el.getBoundingClientRect());
      if (step) el.scrollBy({ left: step });
    }, EDGE_TICK_MS);
    untrack.current = () => {
      window.removeEventListener("pointermove", track, { capture: true });
      clearInterval(edge);
    };
    onStart();
  };

  // Also called as the column scrolls, so the line keeps up with auto-scroll.
  const onDragMove = (e: DragMoveEvent) => {
    const todo = dragging;
    const overId = e.over?.id;
    if (!todo || typeof overId !== "string" || !overId.startsWith("col:")) {
      show(null);
      return;
    }
    show(measure(overId.slice(4), todo, pointer.current ?? pointerY(e)));
  };

  const onDragCancel = () => {
    setDragging(null);
    show(null);
    untrack.current?.();
    untrack.current = null;
    pointer.current = null;
    pointerX.current = null;
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const todo = dragging;
    const overId = e.over?.id;
    const line = shown.current;
    const y = pointer.current ?? pointerY(e);
    // Read before the preview unmounts.
    const preview = previewRect();
    onDragCancel();
    if (!todo || typeof overId !== "string") return;
    let slot = 0;
    if (overId.startsWith("col:")) {
      const listId = overId.slice(4);
      // Exactly where the line was; measured now only if it never showed.
      slot =
        line?.listId === listId
          ? line.index
          : (measure(listId, todo, y)?.index ?? 0);
    }
    const drop = resolveDrop({ overId, todo, rowsFor, slot });
    if (drop?.kind === "move") actions.move(todo, drop.listId);
    else if (drop?.kind === "place") {
      if (reducedMotion !== "reduce") {
        const from = captureRows([todo.listId, drop.listId]);
        const landing = preview
          ? landAt(from, todo.id, drop.listId, preview)
          : null;
        setSettle({ from, landing });
      }
      actions.place(todo, drop.listId, drop.position);
    }
  };

  return {
    dragging,
    indicator,
    settle,
    justDragged,
    sensors,
    handlers: { onDragStart, onDragMove, onDragEnd, onDragCancel },
  };
}

/** What follows the pointer while a row is dragged. */
export function DragPreview({ todo }: { todo: TodoWithUrls }) {
  return (
    <div
      data-drag-preview
      className="flex w-72 cursor-grabbing items-start gap-3 rounded-n-field border border-n-hairline bg-n-surface px-3 py-2.5"
    >
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
