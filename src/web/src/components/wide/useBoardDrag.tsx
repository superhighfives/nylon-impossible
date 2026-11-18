import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import { displayTitle } from "@/components/phone/model";
import { LONG_PRESS_MS, LONG_PRESS_SLOP } from "@/components/phone/TodoRow";
import type { TodoActions } from "@/components/phone/useTodoActions";
import { RAISED } from "@/components/ui/styles";
import { useHints } from "@/hooks/useHints";
import {
  columnGapTop,
  columnPart,
  dropLineY,
  dropSlot,
  type RowSpan,
} from "@/lib/dragOrder";
import {
  isTouchEvent,
  NonTouchPointerSensor,
  RowTouchSensor,
  startedByTouch,
} from "@/lib/dragSensors";
import type { TodoWithUrls } from "@/types/database";
import { columnRows } from "./boardDom";
import type { DropGap, DropIndicator, TouchDrag } from "./Column";
import { resolveDrop } from "./drop";
import {
  captureRows,
  holdRows,
  landAt,
  previewRect,
  SETTLE_TTL_MS,
  type Settle,
} from "./settle";
import { landingSwing, pickTilt, tiltStyle, tiltTokens } from "./tilt";

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

/** Where a drag started, in client coordinates, from its first event. */
function startPoint(e: Event | null): { x: number; y: number } | null {
  if (!e) return null;
  if (isTouchEvent(e)) {
    const touch = e.touches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return e instanceof MouseEvent ? { x: e.clientX, y: e.clientY } : null;
}

/**
 * Pointer y for a drag event: where it started plus how far it moved. Only a
 * fallback: once the column scrolls, `delta` includes the scroll as well.
 */
function pointerY(e: DragMoveEvent | DragEndEvent) {
  return (startPoint(e.activatorEvent)?.y ?? 0) + e.delta.y;
}

/** A column's drop area, which the line, the gap and row offsets measure from. */
const dropArea = (listId: string) =>
  document.querySelector<HTMLElement>(
    `[data-drop-area="${CSS.escape(listId)}"]`,
  );

/**
 * A column's rows as laid out in its drop area: offsets, so rows parting
 * around a touch drag don't move what they're measured against.
 */
function layoutSpans(listId: string): RowSpan[] {
  return columnRows(listId).map((el) => {
    const li = el.closest("li") ?? el;
    return { top: li.offsetTop, bottom: li.offsetTop + li.offsetHeight };
  });
}

/**
 * Drag and drop on the board: pick a row up from anywhere but its checkbox,
 * drop it between rows of any column or on a sidebar list. The input that
 * starts the drag decides how it looks (principle 6). A mouse, trackpad or
 * pen drags after 6px, with a preview and a line marking the slot. A finger
 * long-presses (`LONG_PRESS_MS`, as on the phone) to lift the row, and
 * the rows part around a soft gap where it'll land, one column at a time.
 * Held near the board's left or right edge, either scrolls the board, so a
 * list that's off screen can take it. Spread `handlers` onto the
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
  /**
   * A drag closes the context menu: a pointer's as it starts, a finger's
   * once it moves past the slop (the lift itself opens the menu).
   */
  onStart: () => void;
  /** The board's sideways-scrolling row of columns. */
  board?: () => HTMLElement | null;
}) {
  const { reducedMotion } = useHints();
  const [dragging, setDragging] = useState<TodoWithUrls | null>(null);
  // The drag's tilt, in degrees: picked as it lifts, held until it drops.
  const [tilt, setTilt] = useState(0);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  // A touch drag: where it was lifted from and the gap it's opening.
  const [touch, setTouch] = useState<TouchDrag | null>(null);
  const touchShown = useRef<TouchDrag | null>(null);
  // A finger has moved past the slop since the lift: it's a drag, not a menu.
  const moved = useRef(false);
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
    useSensor(RowTouchSensor, {
      activationConstraint: {
        delay: LONG_PRESS_MS,
        tolerance: LONG_PRESS_SLOP,
      },
    }),
    useSensor(NonTouchPointerSensor, { activationConstraint: { distance: 6 } }),
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
    const area = dropArea(listId);
    if (!area) return null;
    const rowEls = columnRows(listId);
    const rects = rowEls.map((el) =>
      (el.closest("li") ?? el).getBoundingClientRect(),
    );
    const dragged = rowEls.findIndex((el) => el.dataset.rowId === todo.id);
    const index = dropSlot(rowsFor(listId), todo, rects, dragged, y);
    // Measured against the element the line is drawn in.
    const base = area.getBoundingClientRect().top;
    const line = dropLineY(rects, index, dragged, y);
    return { listId, index, y: line === null ? EMPTY_LINE_Y : line - base };
  };

  /**
   * The slot under the finger in column `listId`, by the line's rule, and
   * where the gap the rows part to leave starts.
   */
  const measureGap = (
    listId: string,
    todo: TodoWithUrls,
    lift: Pick<TouchDrag, "listId" | "from">,
    y: number,
  ): DropGap | null => {
    const area = dropArea(listId);
    if (!area) return null;
    const spans = layoutSpans(listId);
    const from = lift.listId === listId ? lift.from : null;
    const at = y - area.getBoundingClientRect().top;
    const index = dropSlot(rowsFor(listId), todo, spans, from ?? -1, at);
    return { listId, index, top: columnGapTop(spans, from, index) };
  };

  const showTouch = (next: TouchDrag | null) => {
    touchShown.current = next;
    setTouch(next);
  };

  const showGap = (gap: DropGap | null) => {
    const cur = touchShown.current;
    if (!cur) return;
    const was = cur.gap;
    if (
      was === gap ||
      (was &&
        gap &&
        was.listId === gap.listId &&
        was.index === gap.index &&
        was.top === gap.top)
    ) {
      return;
    }
    showTouch({ ...cur, gap });
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
    setTilt(pickTilt(tiltTokens()?.max ?? 0));
    untrack.current?.();
    const start = startPoint(e.activatorEvent);
    const track = (ev: PointerEvent) => {
      pointer.current = ev.clientY;
      pointerX.current = ev.clientX;
    };
    // dnd-kit's touch sensor works from touch events, not pointer events.
    const trackTouch = (ev: TouchEvent) => {
      const t = ev.touches[0];
      if (!t) return;
      pointer.current = t.clientY;
      pointerX.current = t.clientX;
    };
    window.addEventListener("pointermove", track, { capture: true });
    window.addEventListener("touchmove", trackTouch, {
      capture: true,
      passive: true,
    });
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
      window.removeEventListener("touchmove", trackTouch, { capture: true });
      clearInterval(edge);
    };
    moved.current = false;
    if (!todo || !startedByTouch(e.activatorEvent)) {
      showTouch(null);
      onStart();
      return;
    }
    // A finger lifts the row in place: the gap opens in its own space, and
    // the menu the long-press opened stays until the finger moves.
    const listId = todo.listId;
    const rowEls = columnRows(listId);
    const from = rowEls.findIndex((el) => el.dataset.rowId === todo.id);
    const li = rowEls[from]?.closest("li");
    const lift = { listId, from, height: li?.offsetHeight ?? 0 };
    showTouch({
      ...lift,
      gap:
        from < 0 || start === null
          ? null
          : measureGap(listId, todo, lift, start.y),
    });
  };

  // Also called as the column scrolls, so the line keeps up with auto-scroll.
  const onDragMove = (e: DragMoveEvent) => {
    const todo = dragging;
    const overId = e.over?.id;
    const lift = touchShown.current;
    if (
      lift &&
      !moved.current &&
      (Math.abs(e.delta.x) > LONG_PRESS_SLOP ||
        Math.abs(e.delta.y) > LONG_PRESS_SLOP)
    ) {
      moved.current = true;
      onStart();
    }
    if (!todo || typeof overId !== "string" || !overId.startsWith("col:")) {
      if (lift) showGap(null);
      else show(null);
      return;
    }
    const y = pointer.current ?? pointerY(e);
    if (lift) showGap(measureGap(overId.slice(4), todo, lift, y));
    else show(measure(overId.slice(4), todo, y));
  };

  const onDragCancel = () => {
    setDragging(null);
    show(null);
    showTouch(null);
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
    const lift = touchShown.current;
    const y = pointer.current ?? pointerY(e);
    // Read before the preview unmounts.
    const preview = previewRect();
    // A finger let go without moving: the menu stays, nothing changes.
    const held = lift !== null && !moved.current;
    onDragCancel();
    if (!todo || typeof overId !== "string" || held) return;
    let slot = 0;
    if (overId.startsWith("col:")) {
      const listId = overId.slice(4);
      // Exactly where the line or gap was; measured now only if neither
      // showed.
      const last = lift ? lift.gap : line;
      slot =
        last?.listId === listId
          ? last.index
          : ((lift
              ? measureGap(listId, todo, lift, y)
              : measure(listId, todo, y)
            )?.index ?? 0);
    }
    const drop = resolveDrop({ overId, todo, rowsFor, slot });
    if (drop?.kind === "move") actions.move(todo, drop.listId);
    else if (drop?.kind === "place") {
      if (reducedMotion !== "reduce") {
        // A touch drop settles from where the rows were parted to, and
        // they're held there until the new order renders.
        const from = captureRows(
          [todo.listId, drop.listId],
          lift
            ? (listId, index) =>
                columnPart(
                  lift.listId === listId ? lift.from : null,
                  lift.gap?.listId === listId ? lift.gap.index : null,
                  index,
                  lift.height,
                )
            : undefined,
        );
        if (lift) holdRows(from);
        // Reduced motion has no settle, so no swing either.
        const swing = landingSwing(tilt, tiltTokens(), false);
        const landing = preview
          ? landAt(from, todo.id, drop.listId, preview, { tilt, swing })
          : null;
        setSettle({ from, landing });
      }
      actions.place(todo, drop.listId, drop.position);
    }
  };

  return {
    dragging,
    tilt,
    indicator,
    touch,
    settle,
    justDragged,
    sensors,
    handlers: { onDragStart, onDragMove, onDragEnd, onDragCancel },
  };
}

/**
 * What follows the pointer while a row is dragged: a card tilted by the
 * drag's angle (`tilt`, in degrees), lifted with a deeper shadow. A finger
 * lifts the row itself instead (`lifted`): the row's own width and look,
 * raised as the phone's lifted row is, with no faded original left behind.
 */
export function DragPreview({
  todo,
  tilt,
  lifted = false,
}: {
  todo: TodoWithUrls;
  tilt: number;
  lifted?: boolean;
}) {
  return (
    <div
      data-drag-preview
      data-lifted={lifted ? "" : undefined}
      style={tiltStyle(tilt)}
      className={
        lifted
          ? `${RAISED} n-lifted -mx-2.5 flex items-start gap-3 px-2.5 py-2.5`
          : "n-lifted flex w-72 cursor-grabbing items-start gap-3 rounded-n-field border border-n-hairline bg-n-surface px-3 py-2.5 shadow-[0_14px_30px_color-mix(in_srgb,black_16%,transparent)]"
      }
    >
      <span
        aria-hidden="true"
        className="mt-px size-[1.375rem] shrink-0 rounded-[6px] border-[1.75px] border-n-ink"
      />
      <span
        className={`${lifted ? "line-clamp-3 tracking-[-0.005em] wrap-anywhere" : "line-clamp-2"} text-[0.9375rem] leading-[1.4] font-medium text-n-ink`}
      >
        {displayTitle(todo)}
      </span>
    </div>
  );
}

/**
 * The drop line's dot: 8px of `brand` at its leading end, with a 2px
 * `canvas` ring so it reads over any row. Scales in; goes inside the line.
 */
export function DropDot() {
  return (
    <span
      aria-hidden="true"
      data-drop-dot
      className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 animate-n-dot-in rounded-full bg-n-brand ring-2 ring-n-canvas"
    />
  );
}
