import {
  Check,
  FileText,
  Link2,
  ListTree,
  Loader2,
  Pin,
  Repeat,
} from "lucide-react";
import {
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  memo,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
} from "react";
import { RAISED, ROW_HOVER } from "@/components/ui/styles";
import { tiltStyle } from "@/components/wide/tilt";
import type { TodoWithUrls } from "@/types/database";
import { displayTitle, type MetaPart, metaSummary, rowMeta } from "./model";

/** Hold this long without moving to open the context menu (touch). */
export const LONG_PRESS_MS = 450;
/**
 * Movement (px) that turns a press into a scroll and cancels it, or, once
 * the row has lifted, turns the menu into a drag.
 */
export const LONG_PRESS_SLOP = 10;

const META_ICONS = {
  pin: Pin,
  repeat: Repeat,
  subtasks: ListTree,
  notes: FileText,
  link: Link2,
} as const;

/**
 * Which meta items are chips: only due today, in `brand`, the row's one
 * yellow. Pinned, Repeat, the other due days, subtasks, notes and links are
 * plain muted text, and overdue is red text (#784). A chip reads as
 * something to press, and nothing on the meta line can be pressed.
 */
export function metaChip(part: MetaPart): "brand" | null {
  return part.kind === "due" && part.today && !part.overdue ? "brand" : null;
}

/** Due today's chip. */
const CHIP = "h-5 rounded-n-chip px-[0.4375rem] bg-n-brand text-n-brand-ink";
/** The meta line and due today's chip, at each density's type. */
const META_TEXT = {
  phone: { line: "text-n-phone-meta", chip: "text-n-phone-meta-chip" },
  wide: { line: "text-n-wide-meta", chip: "text-n-wide-meta-chip" },
} as const;

function MetaItem({
  part,
  link,
  density,
}: {
  part: MetaPart;
  link?: boolean;
  density: "phone" | "wide";
}) {
  const Icon = part.kind === "due" ? null : META_ICONS[part.kind];
  const overdue = part.kind === "due" && part.overdue;
  const chip = metaChip(part);
  return (
    <span
      data-meta-chip={chip ?? undefined}
      className={`inline-flex items-center gap-1 ${overdue ? "font-medium text-n-overdue" : ""} ${
        chip ? `${CHIP} ${META_TEXT[density].chip}` : ""
      }`}
    >
      {part.kind === "link" && part.fetching ? (
        <Loader2
          size="1em"
          strokeWidth={2}
          className="animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        Icon && (
          <Icon
            size="1em"
            strokeWidth={2}
            // SF Symbols draws pin.fill; lucide has no filled pin, so fill it.
            fill={part.kind === "pin" ? "currentColor" : "none"}
            aria-hidden="true"
          />
        )
      )}
      {part.kind === "link" && link ? (
        // Wide: a real link. It opens in a new tab without changing the
        // selection, and stays out of the tab order (O opens it).
        <a
          href={part.href}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          className="text-inherit underline-offset-2 pointer-fine:hover:text-n-ink pointer-fine:hover:underline"
        >
          {part.text}
        </a>
      ) : (
        part.text
      )}
      {part.kind === "link" && part.more > 0 && ` +${part.more}`}
    </span>
  );
}

function MetaLine({
  parts,
  links,
  density,
}: {
  parts: MetaPart[];
  links?: boolean;
  density: "phone" | "wide";
}) {
  if (parts.length === 0) return null;
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 flex flex-wrap gap-x-3 gap-y-1 ${META_TEXT[density].line} text-n-ink-muted`}
    >
      {parts.map((part) => (
        <MetaItem key={part.kind} part={part} link={links} density={density} />
      ))}
    </span>
  );
}

/**
 * The row's slot: collapses out when done, rises above the others while
 * lifted, and empties while a card stands in for it.
 */
function RowShell({
  collapsing,
  lifted = false,
  away = false,
  rowRef,
  style,
  children,
}: {
  collapsing: boolean;
  lifted?: boolean;
  away?: boolean;
  rowRef?: Ref<HTMLLIElement>;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <li
      ref={rowRef}
      data-phone-row
      data-lifted={lifted ? "" : undefined}
      style={style}
      className={`relative grid transition-[grid-template-rows,opacity] duration-(--n-duration-base) ease-n-out ${
        lifted ? "z-10 cursor-grabbing" : ""
      } ${
        collapsing
          ? "grid-rows-[0fr] opacity-0"
          : away
            ? "grid-rows-[1fr] opacity-0"
            : "grid-rows-[1fr] opacity-100"
      }`}
      aria-hidden={collapsing || undefined}
    >
      {children}
    </li>
  );
}

/**
 * Beside the board's selected row while moving with the keys (the board
 * root's `data-keyboard`): the sidebar's bar, 3px and inset 6px top and
 * bottom, a 7px gap clear of the row's fill so nothing shifts. Muted ink is
 * 5:1 or more against canvas, surface and fill. Goes in a `relative` parent
 * whose left edge is 10px inside the fill's.
 */
export function SelectionBar() {
  return (
    <span
      aria-hidden="true"
      data-row-selection-bar
      className="absolute top-1.5 bottom-1.5 -left-5 hidden w-[3px] rounded-full bg-n-ink-muted group-data-[keyboard]/board:block"
    />
  );
}

function CheckButton({
  title,
  checked,
  wide,
  onClick,
}: {
  title: string;
  checked: boolean;
  wide: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-row-check
      aria-pressed={checked}
      aria-label={`Mark “${title}” done`}
      // Wide: out of the tab order; X marks the selection done.
      tabIndex={wide ? -1 : undefined}
      onClick={onClick}
      className={`n-focus-inset -mr-1.5 -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-n-field ${wide ? "-my-0.5" : "mt-0.5"}`}
    >
      <span
        className={`flex items-center justify-center border-[1.75px] transition-[background-color,border-color] duration-(--n-duration-fast) ${
          wide ? "size-[1.375rem] rounded-[6px]" : "size-6 rounded-[7px]"
        } ${
          checked
            ? "animate-n-pop border-n-brand bg-n-brand text-n-brand-ink"
            : "border-n-ink bg-transparent"
        }`}
      >
        {checked && <Check size={14} strokeWidth={3.2} aria-hidden="true" />}
      </span>
    </button>
  );
}

export interface TodoRowProps {
  todo: TodoWithUrls;
  subtasks: TodoWithUrls[];
  now: Date;
  timeZone: string;
  /** Filled and struck through: done, holding before it leaves. */
  checked: boolean;
  /** Collapsing out of the list. */
  collapsing: boolean;
  /** The context menu is open for this row. */
  highlighted: boolean;
  /**
   * Wide only: the board's selection, and the row's only focus indicator.
   * Drawn as the pressed fill; moving with the keys adds `SelectionBar`
   * beside it, as in the sidebar.
   */
  selected?: boolean;
  /**
   * Wide only: focusing the row selects it. A click on an unselected row
   * just selects; a second click, a double click or Enter opens.
   */
  onSelect?: (todo: TodoWithUrls) => void;
  onCheck: (todo: TodoWithUrls) => void;
  /**
   * `by` (wide): Enter or Space on the title opens it from the keyboard,
   * which on the board puts the keyboard on the open todo's sheet.
   */
  onOpen: (todo: TodoWithUrls, by?: "keyboard" | "pointer") => void;
  /** `at` is the pointer, for a right-click; absent from the keyboard. */
  onMenu: (todo: TodoWithUrls, at?: { x: number; y: number }) => void;
  /**
   * `wide` is the board's density: 15px body, and the row tinted and rounded
   * inside its column's gutter.
   */
  density?: "phone" | "wide";
  /**
   * Phone: lifted by a drag, with the context menu preview's raised look.
   * The drag moves the row itself, so it doesn't fade.
   */
  lifted?: boolean;
  /** Phone: a drag's tilt, in degrees, while `lifted`. */
  tilt?: number;
  /**
   * Wide: being dragged. The card that follows the pointer or finger stands
   * in for the row, so its slot is left empty: the gap, while it's over it.
   */
  away?: boolean;
  /** The row's slot's style, for a drag's offsets. */
  rowStyle?: CSSProperties;
  /** Extra props for the row's main button — drag listeners, data hooks. */
  bodyProps?: HTMLAttributes<HTMLButtonElement> &
    Record<`data-${string}`, string>;
  /** Wide: props for the row's container, which a pointer drags. */
  containerProps?: HTMLAttributes<HTMLDivElement>;
  /** Wide: the column's one tab stop (its selected row, else its first). */
  tabStop?: boolean;
  bodyRef?: Ref<HTMLButtonElement>;
  rowRef?: Ref<HTMLLIElement>;
}

/**
 * One todo: checkbox, title (up to three lines) and a meta line. No handles,
 * chevrons or toolbars. On the phone a tap opens the detail; on wide a click
 * or tap selects and a second one opens. Long-press (touch), right-click, the
 * context-menu key or Shift+F10 open the menu.
 */
export const TodoRow = memo(function TodoRow(props: TodoRowProps) {
  return props.density === "wide" ? (
    <WideTodoRow {...props} />
  ) : (
    <PhoneTodoRow {...props} />
  );
});

/**
 * A touch long-press that opens the row's menu: held `LONG_PRESS_MS` within
 * `LONG_PRESS_SLOP`, it ticks and calls `open`. A mouse, trackpad or pen
 * drags instead, and right-clicks for the menu. `fired` is set once it has
 * opened the menu, so the click that may follow the finger lifting is
 * ignored.
 */
function useLongPress(open: () => void) {
  const press = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const fired = useRef(false);

  useEffect(() => () => clearTimeout(press.current?.timer), []);

  const end = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  const start = (e: PointerEvent<HTMLElement>) => {
    fired.current = false;
    end();
    if (e.button !== 0 || e.pointerType !== "touch") return;
    press.current = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        press.current = null;
        fired.current = true;
        navigator.vibrate?.(10);
        open();
      }, LONG_PRESS_MS),
    };
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p) return;
    if (
      Math.abs(e.clientX - p.x) > LONG_PRESS_SLOP ||
      Math.abs(e.clientY - p.y) > LONG_PRESS_SLOP
    ) {
      end();
    }
  };

  return { start, move, end, fired };
}

/** Shift+F10 and the context-menu key open the row's menu. */
function menuKey(
  e: KeyboardEvent<HTMLButtonElement>,
  open: () => void,
  bodyProps: TodoRowProps["bodyProps"],
) {
  bodyProps?.onKeyDown?.(e);
  if (e.defaultPrevented) return;
  if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
    e.preventDefault();
    open();
  }
}

/**
 * The wide row: a container a pointer clicks and drags, holding the title
 * as the focusable button and a meta line beside it, whose link is a real
 * link (a link can't sit inside a button). One click selects; a second
 * click, a double click or Enter opens.
 */
function WideTodoRow({
  todo,
  subtasks,
  now,
  timeZone,
  checked,
  collapsing,
  highlighted,
  selected = false,
  onSelect,
  onCheck,
  onOpen,
  onMenu,
  away = false,
  rowStyle,
  bodyProps,
  bodyRef,
  rowRef,
  containerProps,
  tabStop = false,
}: TodoRowProps) {
  const parts = rowMeta(todo, subtasks, now, timeZone);
  const title = displayTitle(todo);
  const titleButton = useRef<HTMLButtonElement | null>(null);
  // Whether the row was already selected when the pointer went down.
  const wasSelected = useRef(false);
  // The lift also selects the row and opens its menu, under the row.
  const longPress = useLongPress(() => onMenu(todo));

  const setTitleRef = (node: HTMLButtonElement | null) => {
    titleButton.current = node;
    if (typeof bodyRef === "function") bodyRef(node);
    else if (bodyRef) bodyRef.current = node;
  };

  return (
    <RowShell
      collapsing={collapsing}
      away={away}
      rowRef={rowRef}
      style={rowStyle}
    >
      {selected && <SelectionBar />}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the title button is the keyboard path; this is the pointer's larger target */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keys go to the title button */}
      <div
        {...containerProps}
        data-row-container
        data-selected={selected ? "" : undefined}
        onPointerDown={(e) => {
          containerProps?.onPointerDown?.(e);
          wasSelected.current = selected;
          // The checkbox ticks on a tap, and a link opens: neither lifts.
          if ((e.target as Element).closest("a, [data-row-check]")) {
            longPress.end();
            return;
          }
          longPress.start(e);
        }}
        onPointerMove={longPress.move}
        onPointerUp={longPress.end}
        onPointerCancel={longPress.end}
        onPointerLeave={longPress.end}
        onClick={(e) => {
          const target = e.target as Element;
          if (target.closest("a, [data-row-check]")) return;
          if (longPress.fired.current) {
            longPress.fired.current = false;
            return;
          }
          // Enter or Space on the title (a click with no detail), a double
          // click, or a click on the selection opens; any other selects.
          if (e.detail === 1 && !wasSelected.current) {
            titleButton.current?.focus();
            onSelect?.(todo);
            return;
          }
          onOpen(todo, e.detail === 0 ? "keyboard" : "pointer");
        }}
        onContextMenu={(e) => {
          if ((e.target as Element).closest("a")) return;
          e.preventDefault();
          longPress.end();
          // A long-press already opened it, under the row.
          if (longPress.fired.current) return;
          onMenu(todo, { x: e.clientX, y: e.clientY });
        }}
        // The browser pans until the lift; the hold shows no callout and
        // selects no text.
        className={`-mx-2.5 flex min-h-0 cursor-pointer touch-pan-x touch-pan-y items-start gap-3 overflow-clip rounded-n-chip px-2.5 transition-colors duration-(--n-duration-fast) select-none [-webkit-touch-callout:none] ${
          selected || highlighted ? "bg-n-fill" : ROW_HOVER
        }`}
      >
        <CheckButton
          title={title}
          checked={checked}
          wide
          onClick={() => onCheck(todo)}
        />
        <div className="-ml-1.5 min-w-0 flex-1 py-2.5 pr-2 pl-1.5">
          <button
            {...bodyProps}
            ref={setTitleRef}
            type="button"
            tabIndex={tabStop ? 0 : -1}
            onFocus={(e) => {
              bodyProps?.onFocus?.(e);
              onSelect?.(todo);
            }}
            onKeyDown={(e) => menuKey(e, () => onMenu(todo), bodyProps)}
            aria-haspopup="dialog"
            aria-description={metaSummary(parts) || undefined}
            className="block w-full cursor-pointer text-left outline-none"
          >
            <span
              className={`line-clamp-3 block text-n-wide-row-title wrap-anywhere transition-colors duration-(--n-duration-fast) ${
                checked ? "text-n-ink-muted line-through" : "text-n-ink"
              }`}
            >
              {title}
            </span>
          </button>
          <MetaLine parts={parts} links density="wide" />
        </div>
      </div>
    </RowShell>
  );
}

/** The phone row: the whole row is the button; links stay in the detail. */
function PhoneTodoRow({
  todo,
  subtasks,
  now,
  timeZone,
  checked,
  collapsing,
  highlighted,
  onCheck,
  onOpen,
  onMenu,
  lifted = false,
  tilt = 0,
  rowStyle,
  bodyProps,
  bodyRef,
  rowRef,
}: TodoRowProps) {
  const parts = rowMeta(todo, subtasks, now, timeZone);
  const title = displayTitle(todo);
  const longPress = useLongPress(() => onMenu(todo));

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    bodyProps?.onPointerDown?.(e);
    longPress.start(e);
  };

  return (
    <RowShell
      collapsing={collapsing}
      lifted={lifted}
      rowRef={rowRef}
      style={rowStyle}
    >
      <div
        data-row-card
        style={lifted ? tiltStyle(tilt) : undefined}
        className={`flex min-h-0 items-start gap-3 overflow-clip px-5 transition-[background-color,box-shadow] duration-(--n-duration-fast) ${
          lifted
            ? `${RAISED} n-lifted`
            : highlighted
              ? "bg-n-fill"
              : "pointer-fine:hover:bg-n-surface"
        }`}
      >
        <CheckButton
          title={title}
          checked={checked}
          wide={false}
          onClick={() => onCheck(todo)}
        />
        <button
          {...bodyProps}
          ref={bodyRef}
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={longPress.move}
          onPointerUp={longPress.end}
          onPointerCancel={longPress.end}
          onPointerLeave={longPress.end}
          onClick={() => {
            if (longPress.fired.current) {
              longPress.fired.current = false;
              return;
            }
            onOpen(todo);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            longPress.end();
            longPress.fired.current = false;
            onMenu(todo, { x: e.clientX, y: e.clientY });
          }}
          onKeyDown={(e) => menuKey(e, () => onMenu(todo), bodyProps)}
          aria-haspopup="dialog"
          aria-description={metaSummary(parts) || undefined}
          className="n-focus-inset min-w-0 flex-1 cursor-pointer touch-pan-y rounded-n-chip py-[0.6875rem] text-left select-none [-webkit-touch-callout:none]"
        >
          <span
            className={`line-clamp-3 block text-n-phone-row-title wrap-anywhere transition-colors duration-(--n-duration-fast) ${
              checked ? "text-n-ink-muted line-through" : "text-n-ink"
            }`}
          >
            {title}
          </span>
          <MetaLine parts={parts} density="phone" />
        </button>
      </div>
    </RowShell>
  );
}
