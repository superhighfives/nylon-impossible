import {
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  PointerSensor,
  type PointerSensorOptions,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { previewRect, SETTLE_TTL_MS } from "@/components/wide/settle";
import { useHints } from "@/hooks/useHints";
import {
  dropLineY,
  dropPlacement,
  type RowSpan,
  slotAt,
} from "@/lib/dragOrder";
import type { TodoWithUrls } from "@/types/database";
import { LONG_PRESS_MS, LONG_PRESS_SLOP } from "./TodoRow";

/**
 * Touch drags in place: the lifted row follows the finger and the others part
 * to open a gap. A pointer (mouse, trackpad, pen) drags a preview and draws
 * the yellow line between rows, as on the wide board (principle 6).
 */
export type PhoneDragMode = "touch" | "pointer";

/** The drag in progress on a page's rows. */
export interface PhoneDrag {
  todo: TodoWithUrls;
  listId: string;
  mode: PhoneDragMode;
  /** The dragged row's index in the page's rows. */
  from: number;
  /** Its slot among the *other* rows, clamped to its pinned/unpinned tier. */
  slot: number;
  /** Pointer only: the line's offset from the top of the row list, in px. */
  lineY: number | null;
  /** The dragged row's height, which the others part by. */
  height: number;
}

/** A page's row list, which rows and the line are measured against. */
export const rowList = (listId: string) =>
  document.querySelector<HTMLElement>(
    `[data-phone-rows="${CSS.escape(listId)}"]`,
  );

/** The rows' layout spans in their list: offsets, so parting doesn't move them. */
function rowSpans(list: HTMLElement): RowSpan[] {
  return [
    ...list.querySelectorAll<HTMLElement>(":scope > li[data-phone-row]"),
  ].map((li) => ({
    top: li.offsetTop,
    bottom: li.offsetTop + li.offsetHeight,
  }));
}

/** Where a drag started, in client coordinates, from its first event. */
function startY(e: Event | null): number {
  if (!e) return 0;
  if ("touches" in e) return (e as TouchEvent).touches[0]?.clientY ?? 0;
  return (e as MouseEvent).clientY ?? 0;
}

/** A pointer sensor for everything but touch, which long-presses instead. */
class NonTouchPointerSensor extends PointerSensor {
  static override activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (
        event: ReactPointerEvent,
        options: PointerSensorOptions,
      ): boolean =>
        event.nativeEvent.pointerType !== "touch" &&
        PointerSensor.activators[0].handler(event, options),
    },
  ];
}

/**
 * Reordering a phone page's rows. Touch lifts a row after a long-press
 * (`LONG_PRESS_MS`, the same hold that opens the context menu) and moving it
 * past the slop turns the menu into a drag; a pointer drags after 6px. A
 * drag stays in its tier, and its position comes from `dropPlacement`.
 *
 * Spread `handlers` onto the `DndContext`; `ordered` shows a just-dropped
 * order until the saved one renders, and `settleFrom` is where rows were at
 * the drop, so they ease into place.
 */
export function usePhoneDrag({
  rowsFor,
  place,
  onLiftMove,
}: {
  rowsFor: (listId: string | undefined) => TodoWithUrls[];
  place: (todo: TodoWithUrls, listId: string, position: string) => void;
  /** The lifted row moved past the slop: the context menu closes. */
  onLiftMove: () => void;
}) {
  const { reducedMotion } = useHints();
  const [drag, setDrag] = useState<PhoneDrag | null>(null);
  // The drag as last drawn, so a release in the same tick as a move sees it.
  const shown = useRef<PhoneDrag | null>(null);
  const spans = useRef<RowSpan[]>([]);
  // The pointer at the start, in the row list's coordinates.
  const origin = useRef(0);
  const moved = useRef(false);
  // The pointer-up that ends a pointer drag can land as a click on the row.
  const justDragged = useRef(false);
  // A dropped order, shown until the saved one renders.
  const [pending, setPending] = useState<{
    listId: string;
    ids: string[];
    from: Map<string, number> | null;
  } | null>(null);

  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: LONG_PRESS_MS,
        tolerance: LONG_PRESS_SLOP,
      },
    }),
    useSensor(NonTouchPointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    if (!pending) return;
    const done = setTimeout(() => setPending(null), SETTLE_TTL_MS);
    return () => clearTimeout(done);
  }, [pending]);

  /** `rows` for `listId`, in a just-dropped order until it's saved. */
  const ordered = (listId: string, rows: TodoWithUrls[]) => {
    if (pending?.listId !== listId) return rows;
    const rank = new Map(pending.ids.map((id, i) => [id, i]));
    return [...rows].sort(
      (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
    );
  };
  /** A page's rows as they're showing, which a drag is measured against. */
  const showing = (listId: string) => ordered(listId, rowsFor(listId));

  const show = (next: PhoneDrag | null) => {
    shown.current = next;
    setDrag(next);
  };

  const onDragStart = (e: DragStartEvent) => {
    const todo = e.active.data.current?.todo as TodoWithUrls | undefined;
    const listId = e.active.data.current?.listId as string | undefined;
    const list = listId ? rowList(listId) : null;
    if (!todo || !listId || !list) return;
    const rows = showing(listId);
    const from = rows.findIndex((t) => t.id === todo.id);
    if (from < 0) return;
    spans.current = rowSpans(list);
    origin.current =
      startY(e.activatorEvent) - list.getBoundingClientRect().top;
    moved.current = false;
    const own = spans.current[from];
    show({
      todo,
      listId,
      mode: e.activatorEvent?.type.startsWith("touch") ? "touch" : "pointer",
      from,
      slot: from,
      lineY: null,
      height: own ? own.bottom - own.top : 0,
    });
  };

  // Also called as the page auto-scrolls; `delta` includes the scroll.
  const onDragMove = (e: DragMoveEvent) => {
    const cur = shown.current;
    if (!cur) return;
    if (
      cur.mode === "touch" &&
      !moved.current &&
      (Math.abs(e.delta.x) > LONG_PRESS_SLOP ||
        Math.abs(e.delta.y) > LONG_PRESS_SLOP)
    ) {
      moved.current = true;
      onLiftMove();
    }
    const y = origin.current + e.delta.y;
    const mids = spans.current
      .filter((_, i) => i !== cur.from)
      .map((s) => (s.top + s.bottom) / 2);
    const { index } = dropPlacement(
      showing(cur.listId),
      cur.todo,
      slotAt(mids, y),
    );
    const lineY =
      cur.mode === "pointer"
        ? dropLineY(spans.current, index, cur.from, y)
        : null;
    if (index !== cur.slot || lineY !== cur.lineY) {
      show({ ...cur, slot: index, lineY });
    }
  };

  const onDragCancel = () => {
    const wasPointer = shown.current?.mode === "pointer";
    show(null);
    if (!wasPointer) return;
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  };

  const onDragEnd = (_e: DragEndEvent) => {
    const cur = shown.current;
    // Read before the preview unmounts and the rows stop parting.
    const from = cur && reducedMotion !== "reduce" ? capture(cur) : null;
    onDragCancel();
    // Released where it started: nothing changes, nothing is saved.
    if (!cur || cur.slot === cur.from) return;
    const rows = showing(cur.listId);
    const { position } = dropPlacement(rows, cur.todo, cur.slot);
    const others = rows.filter((t) => t.id !== cur.todo.id).map((t) => t.id);
    others.splice(cur.slot, 0, cur.todo.id);
    setPending({ listId: cur.listId, ids: others, from });
    place(cur.todo, cur.listId, position);
  };

  return {
    drag,
    sensors,
    justDragged,
    ordered,
    /** Where `listId`'s rows were on screen at the drop, by todo id. */
    settleFrom: (listId: string) =>
      pending?.listId === listId ? pending.from : null,
    handlers: { onDragStart, onDragMove, onDragEnd, onDragCancel },
  };
}

/**
 * Each row's top on screen at the drop, parted or lifted as it is. A
 * pointer drop settles the dragged row from its preview instead.
 */
function capture(drag: PhoneDrag): Map<string, number> | null {
  const list = rowList(drag.listId);
  if (!list) return null;
  const tops = new Map<string, number>();
  for (const li of list.querySelectorAll<HTMLElement>(
    ":scope > li[data-phone-row]",
  )) {
    const id = li.querySelector<HTMLElement>("[data-row-id]")?.dataset.rowId;
    if (id) tops.set(id, li.getBoundingClientRect().top);
  }
  const preview = drag.mode === "pointer" ? previewRect() : null;
  if (preview) {
    tops.set(drag.todo.id, preview.top + preview.height / 2 - drag.height / 2);
  }
  return tops;
}
