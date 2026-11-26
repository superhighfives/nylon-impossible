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
import type { DropGap, LiftDrag } from "./Column";
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

/** A column's drop area, which the gap and row offsets measure from. */
const dropArea = (listId: string) =>
  document.querySelector<HTMLElement>(
    `[data-drop-area="${CSS.escape(listId)}"]`,
  );

/**
 * A column's rows as laid out in its drop area: offsets, so rows parting
 * around a drag don't move what they're measured against.
 */
function layoutSpans(listId: string): RowSpan[] {
  return columnRows(listId).map((el) => {
    const li = el.closest("li") ?? el;
    return { top: li.offsetTop, bottom: li.offsetTop + li.offsetHeight };
  });
}

/**
 * Drag and drop on the board: pick a row up from anywhere but its checkbox,
 * drop it between rows of any column or on a sidebar list. A mouse, trackpad
 * or pen starts after 6px; a finger long-presses (`LONG_PRESS_MS`, as on the
 * phone), which also opens the row's menu. Either way it looks the same
 * (principle 6): the row lifts and follows, and the rows part around a soft
 * gap where it'll land, one column at a time.
 * Held near the board's left or right edge, it scrolls the board, so a
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
  // The drag: where it was lifted from and the gap it's opening.
  const [lift, setLift] = useState<LiftDrag | null>(null);
  // The drag as last drawn, which is where a release drops. A ref, so a
  // release in the same tick as the last move still sees it.
  const shown = useRef<LiftDrag | null>(null);
  // A finger lifted it, with the row's menu.
  const byTouch = useRef(false);
  // A finger has moved past the slop since the lift: it's a drag, not a menu.
  const moved = useRef(false);
  const [settle, setSettle] = useState<Settle | null>(null);
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

  /**
   * The slot under the pointer or finger in column `listId`, by the nearer
   * half of a row, and where the gap the rows part to leave starts.
   */
  const measureGap = (
    listId: string,
    todo: TodoWithUrls,
    lift: Pick<LiftDrag, "listId" | "from">,
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

  const showLift = (next: LiftDrag | null) => {
    shown.current = next;
    setLift(next);
  };

  const showGap = (gap: DropGap | null) => {
    const cur = shown.current;
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
    showLift({ ...cur, gap });
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
    byTouch.current = startedByTouch(e.activatorEvent);
    // A pointer's drag closes the menu at once; a finger's menu, opened by
    // the long-press, stays until the finger moves.
    if (!byTouch.current) onStart();
    if (!todo) {
      showLift(null);
      return;
    }
    // The row lifts in place: the gap opens in its own space.
    const listId = todo.listId;
    const rowEls = columnRows(listId);
    const from = rowEls.findIndex((el) => el.dataset.rowId === todo.id);
    const li = rowEls[from]?.closest("li");
    const lift = { listId, from, height: li?.offsetHeight ?? 0 };
    showLift({
      ...lift,
      gap:
        from < 0 || start === null
          ? null
          : measureGap(listId, todo, lift, start.y),
    });
  };

  // Also called as the column scrolls, so the gap keeps up with auto-scroll.
  const onDragMove = (e: DragMoveEvent) => {
    const todo = dragging;
    const overId = e.over?.id;
    const lift = shown.current;
    if (
      byTouch.current &&
      !moved.current &&
      (Math.abs(e.delta.x) > LONG_PRESS_SLOP ||
        Math.abs(e.delta.y) > LONG_PRESS_SLOP)
    ) {
      moved.current = true;
      onStart();
    }
    if (!lift) return;
    if (!todo || typeof overId !== "string" || !overId.startsWith("col:")) {
      showGap(null);
      return;
    }
    const y = pointer.current ?? pointerY(e);
    showGap(measureGap(overId.slice(4), todo, lift, y));
  };

  const onDragCancel = () => {
    setDragging(null);
    showLift(null);
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
    const lift = shown.current;
    const y = pointer.current ?? pointerY(e);
    // Read before the preview unmounts.
    const preview = previewRect();
    // A finger let go without moving: the menu stays, nothing changes.
    const held = byTouch.current && !moved.current;
    onDragCancel();
    if (!todo || !lift || typeof overId !== "string" || held) return;
    let slot = 0;
    if (overId.startsWith("col:")) {
      const listId = overId.slice(4);
      // Exactly where the gap was; measured now only if it didn't show.
      slot =
        lift.gap?.listId === listId
          ? lift.gap.index
          : (measureGap(listId, todo, lift, y)?.index ?? 0);
    }
    const drop = resolveDrop({ overId, todo, rowsFor, slot });
    if (drop?.kind === "move") actions.move(todo, drop.listId);
    else if (drop?.kind === "place") {
      if (reducedMotion !== "reduce") {
        // A drop settles from where the rows were parted to, and they're
        // held there until the new order renders.
        const from = captureRows([todo.listId, drop.listId], (listId, index) =>
          columnPart(
            lift.listId === listId ? lift.from : null,
            lift.gap?.listId === listId ? lift.gap.index : null,
            index,
            lift.height,
          ),
        );
        holdRows(from);
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
    lift,
    settle,
    justDragged,
    sensors,
    handlers: { onDragStart, onDragMove, onDragEnd, onDragCancel },
  };
}

/**
 * What follows the pointer or finger while a row is dragged: the row itself,
 * lifted, at its own width and look, raised as the phone's lifted row is and
 * tilted by the drag's angle (`tilt`, in degrees). No faded original is left
 * behind; its slot is the gap.
 */
export function DragPreview({
  todo,
  tilt,
}: {
  todo: TodoWithUrls;
  tilt: number;
}) {
  return (
    <div
      data-drag-preview
      data-lifted
      style={tiltStyle(tilt)}
      className={`${RAISED} n-lifted -mx-2.5 flex cursor-grabbing items-start gap-3 px-2.5 py-2.5`}
    >
      <span
        aria-hidden="true"
        className="mt-px size-[1.375rem] shrink-0 rounded-[6px] border-[1.75px] border-n-ink"
      />
      <span className="line-clamp-3 wrap-anywhere text-n-wide-row-title text-n-ink">
        {displayTitle(todo)}
      </span>
    </div>
  );
}
