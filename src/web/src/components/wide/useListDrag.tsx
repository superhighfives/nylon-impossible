import {
  type Active,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  useDraggable,
} from "@dnd-kit/core";
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useHints } from "@/hooks/useHints";
import { gapTop, partOffset, type RowSpan, slotAt } from "@/lib/dragOrder";
import { isTouchEvent } from "@/lib/dragSensors";
import { type ListMove, listMoves } from "@/lib/listOrder";
import { SETTLE_TTL_MS, settleTiming } from "./settle";
import {
  landingSwing,
  pickTilt,
  swingKeyframes,
  tiltStyle,
  tiltTokens,
} from "./tilt";

/**
 * Reordering your lists by dragging them: the wide sidebar's Lists group and
 * the phone layout's Lists page. A list drags as a todo does, with a pointer
 * or a long-press (the sensors are the board's or the phone's): the entry
 * lifts, tilted, and follows the pointer or finger up and down, and the
 * other entries part around a `brandSoft` gap where it'll land. No line
 * (Settled "Brand accent" covers only a todo's). Only your lists are in a
 * group, so the time lists can't be dragged, and nothing lands among them.
 */

/** What a list entry hands its drag. */
interface ListDragData {
  kind: "list";
  id: string;
  /** The group it's in: `data-list-group` on the entries' `ul`. */
  group: string;
}

/** Whether a drag is of a list rather than a todo. */
export function isListDrag(active: Active | null | undefined): boolean {
  return (active?.data.current as ListDragData | undefined)?.kind === "list";
}

/** The list drag in progress. */
export interface ListDrag {
  id: string;
  group: string;
  /** The dragged entry's index in its group. */
  from: number;
  /** Its slot among the *other* entries. */
  slot: number;
  /** The dragged entry's height, which the gap is. */
  height: number;
  /** How far the others move to part: its height and the space after it. */
  pitch: number;
  /** Where the gap starts, from the top of the group. */
  gapY: number | null;
  /** The drag's tilt, in degrees: picked as it lifts, held until it drops. */
  tilt: number;
}

/** Where a group's entries were on screen at a drop, and what landed. */
export interface ListSettle {
  tops: Map<string, number>;
  landing: { id: string; tilt: number; swing: number };
}

const groupEl = (group: string) =>
  document.querySelector<HTMLElement>(
    `[data-list-group="${CSS.escape(group)}"]`,
  );

const entriesOf = (el: HTMLElement) => [
  ...el.querySelectorAll<HTMLElement>(":scope > li[data-list-entry]"),
];

/** The entries' layout spans in their group: offsets, so parting doesn't move them. */
function spansOf(el: HTMLElement): RowSpan[] {
  return entriesOf(el).map((li) => ({
    top: li.offsetTop,
    bottom: li.offsetTop + li.offsetHeight,
  }));
}

/** The pointer or finger's y on screen, from the event that started a drag. */
function startY(e: Event | null): number | null {
  if (!e) return null;
  if (isTouchEvent(e)) return e.touches[0]?.clientY ?? null;
  return e instanceof MouseEvent ? e.clientY : null;
}

/** The slot `y` (from the top of the group) points to among the others. */
function slotFor(spans: RowSpan[], from: number, y: number): number {
  const mids = spans
    .filter((_, i) => i !== from)
    .map((s) => (s.top + s.bottom) / 2);
  return slotAt(mids, y);
}

interface DragHandlers {
  onDragStart: (e: DragStartEvent) => void;
  onDragMove: (e: DragMoveEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: (e: DragCancelEvent) => void;
}

/** One `DndContext`'s handlers: a list's drag to `lists`, a todo's to `todos`. */
export function routeDrag(
  lists: DragHandlers,
  todos: Partial<DragHandlers>,
): DragHandlers {
  return {
    onDragStart: (e) =>
      isListDrag(e.active) ? lists.onDragStart(e) : todos.onDragStart?.(e),
    onDragMove: (e) =>
      isListDrag(e.active) ? lists.onDragMove(e) : todos.onDragMove?.(e),
    onDragEnd: (e) =>
      isListDrag(e.active) ? lists.onDragEnd(e) : todos.onDragEnd?.(e),
    onDragCancel: (e) =>
      isListDrag(e.active) ? lists.onDragCancel(e) : todos.onDragCancel?.(e),
  };
}

/**
 * Dragging your lists into a new order. `lists` is your lists in the order
 * shown; a drop hands `onMove` the positions that put the dragged one between
 * its new neighbours (`listMoves`). Spread `handlers` (through `routeDrag`)
 * onto the `DndContext`; `ordered` shows a just-dropped order until the
 * saved one renders, and `settle` is where the entries were at the drop, so
 * they ease into place.
 */
export function useListDrag<T extends { id: string; position: string }>({
  lists,
  onMove,
}: {
  lists: T[];
  onMove: (moves: ListMove[]) => void;
}) {
  const { reducedMotion } = useHints();
  const [drag, setDrag] = useState<ListDrag | null>(null);
  // The drag as last drawn, so a release in the same tick as a move sees it.
  const shown = useRef<ListDrag | null>(null);
  const spans = useRef<RowSpan[]>([]);
  // The pointer or finger, tracked while dragging: dnd-kit's delta also
  // counts the sidebar's scroll.
  const pointer = useRef<number | null>(null);
  const untrack = useRef<(() => void) | null>(null);
  // The pointer-up that ends a drag can land as a click on the entry.
  const justDragged = useRef(false);
  const [pending, setPending] = useState<{
    ids: string[];
    settle: ListSettle | null;
  } | null>(null);

  useEffect(() => () => untrack.current?.(), []);
  useEffect(() => {
    if (!pending) return;
    const done = setTimeout(() => setPending(null), SETTLE_TTL_MS);
    return () => clearTimeout(done);
  }, [pending]);

  /** `rows` in a just-dropped order until it's saved. */
  const ordered = <R extends { id: string }>(rows: R[]): R[] => {
    if (!pending) return rows;
    const rank = new Map(pending.ids.map((id, i) => [id, i]));
    return [...rows].sort(
      (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
    );
  };

  const show = (next: ListDrag | null) => {
    shown.current = next;
    setDrag(next);
  };

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as ListDragData | undefined;
    const el = data ? groupEl(data.group) : null;
    if (!data || !el) return;
    const entries = entriesOf(el);
    const from = entries.findIndex((li) => li.dataset.listEntry === data.id);
    if (from < 0) return;
    spans.current = spansOf(el);
    const own = spans.current[from];
    const after = spans.current[from + 1] ?? spans.current[from - 1];
    const height = own.bottom - own.top;
    const space = after
      ? Math.abs(
          from + 1 < spans.current.length
            ? after.top - own.bottom
            : own.top - after.bottom,
        )
      : 0;
    // Until it first moves, where it started plus dnd-kit's delta.
    pointer.current = null;
    untrack.current?.();
    const track = (ev: PointerEvent) => {
      pointer.current = ev.clientY;
    };
    const trackTouch = (ev: TouchEvent) => {
      const t = ev.touches[0];
      if (t) pointer.current = t.clientY;
    };
    window.addEventListener("pointermove", track, { capture: true });
    window.addEventListener("touchmove", trackTouch, {
      capture: true,
      passive: true,
    });
    untrack.current = () => {
      window.removeEventListener("pointermove", track, { capture: true });
      window.removeEventListener("touchmove", trackTouch, { capture: true });
    };
    show({
      id: data.id,
      group: data.group,
      from,
      slot: from,
      height,
      pitch: height + space,
      gapY: gapTop(spans.current, from, from),
      tilt: pickTilt(tiltTokens()?.max ?? 0),
    });
  };

  const onDragMove = (e: DragMoveEvent) => {
    const cur = shown.current;
    const el = cur ? groupEl(cur.group) : null;
    if (!cur || !el) return;
    const y =
      (pointer.current ?? (startY(e.activatorEvent) ?? 0) + e.delta.y) -
      el.getBoundingClientRect().top;
    const slot = slotFor(spans.current, cur.from, y);
    if (slot === cur.slot) return;
    show({ ...cur, slot, gapY: gapTop(spans.current, cur.from, slot) });
  };

  const onDragCancel = () => {
    show(null);
    untrack.current?.();
    untrack.current = null;
    pointer.current = null;
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  };

  const onDragEnd = () => {
    const cur = shown.current;
    // Read before the entries stop parting and the lifted one drops.
    const tops =
      cur && reducedMotion !== "reduce" ? captureTops(cur.group) : null;
    onDragCancel();
    // Released where it started: nothing changes, nothing is saved.
    if (!cur || cur.slot === cur.from) return;
    const moves = listMoves(lists, cur.id, cur.slot);
    if (moves.length === 0) return;
    const ids = lists.map((l) => l.id).filter((id) => id !== cur.id);
    ids.splice(cur.slot, 0, cur.id);
    setPending({
      ids,
      settle: tops
        ? {
            tops,
            landing: {
              id: cur.id,
              tilt: cur.tilt,
              swing: landingSwing(cur.tilt, tiltTokens(), false),
            },
          }
        : null,
    });
    onMove(moves);
  };

  return {
    drag,
    justDragged,
    ordered,
    settle: pending?.settle ?? null,
    handlers: { onDragStart, onDragMove, onDragEnd, onDragCancel },
  };
}

/** Each entry's top on screen, parted or lifted as it is, by list id. */
function captureTops(group: string): Map<string, number> | null {
  const el = groupEl(group);
  if (!el) return null;
  const tops = new Map<string, number>();
  for (const li of entriesOf(el)) {
    const id = li.dataset.listEntry;
    if (id) tops.set(id, li.getBoundingClientRect().top);
  }
  return tops;
}

/**
 * One list's entry in a group: draggable, lifted while it's the one being
 * dragged, parting while another is. Put `ref` and `style` on the entry's
 * `li` (with `data-list-entry` set to the list's id), `listeners` on what
 * picks it up, and `card` on what lifts.
 */
export function useListEntry({
  id,
  group,
  index,
  drag,
  animate,
  disabled = false,
}: {
  id: string;
  group: string;
  index: number;
  drag: ListDrag | null;
  /** False under reduced motion: entries part without sliding. */
  animate: boolean;
  /** A time list's entry, which stays where it is. */
  disabled?: boolean;
}) {
  const data: ListDragData = { kind: "list", id, group };
  const { setNodeRef, listeners, transform } = useDraggable({
    id: `list:${id}`,
    data,
    disabled,
  });
  const mine = drag?.group === group ? drag : null;
  const lifted = mine?.id === id;
  const y = mine
    ? lifted
      ? (transform?.y ?? 0)
      : partOffset(mine.from, mine.slot, index, mine.pitch)
    : 0;
  const style: CSSProperties | undefined = mine
    ? {
        transform: y ? `translateY(${y}px)` : undefined,
        // The lifted entry keeps up with the pointer; the others slide.
        transition:
          lifted || !animate
            ? "none"
            : "transform var(--n-duration-fast) var(--n-ease-out-strong)",
      }
    : undefined;
  return {
    ref: setNodeRef,
    listeners,
    style,
    lifted,
    card: lifted && mine ? tiltStyle(mine.tilt) : undefined,
  };
}

/**
 * The soft gap the entries part around, under them. Put it first in the
 * group's `ul`, which is `relative`.
 */
export function ListDropGap({
  drag,
  group,
  animate,
  inset = "inset-x-0 inset-y-px",
}: {
  drag: ListDrag | null;
  group: string;
  animate: boolean;
  /** Where the fill sits in the gap, as inset utilities. */
  inset?: string;
}) {
  if (drag?.group !== group || drag.gapY === null) return null;
  return (
    <li
      aria-hidden="true"
      data-drop-gap
      style={{ top: drag.gapY, height: drag.height }}
      className={`pointer-events-none absolute inset-x-0 ${
        animate
          ? "transition-[top] duration-(--n-duration-fast) ease-n-out"
          : ""
      }`}
    >
      <span className={`absolute ${inset} rounded-n-field bg-n-brand-soft`} />
    </li>
  );
}

/**
 * After a drop, a group's entries ease from where they were into the new
 * order, and the dropped one swings past level as it lands. Runs in the
 * commit that shows the new order, before it paints.
 */
export function useListSettle(
  ref: RefObject<HTMLElement | null>,
  settle: ListSettle | null,
) {
  const played = useRef<ListSettle | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !settle || played.current === settle) return;
    played.current = settle;
    const timing = settleTiming();
    if (!timing) return;
    for (const li of entriesOf(el)) {
      const id = li.dataset.listEntry;
      const was = id ? settle.tops.get(id) : undefined;
      if (was === undefined) continue;
      const { landing } = settle;
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
  }, [ref, settle]);
}
