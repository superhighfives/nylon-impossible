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
  type HTMLAttributes,
  type KeyboardEvent,
  memo,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
} from "react";
import type { TodoWithUrls } from "@/types/database";
import { displayTitle, type MetaPart, metaSummary, rowMeta } from "./model";

/** Hold this long without moving to open the context menu. */
export const LONG_PRESS_MS = 450;
/** Movement (px) that turns a press into a scroll and cancels it. */
const LONG_PRESS_SLOP = 10;

const META_ICONS = {
  pin: Pin,
  repeat: Repeat,
  subtasks: ListTree,
  notes: FileText,
  link: Link2,
} as const;

function MetaItem({ part, link }: { part: MetaPart; link?: boolean }) {
  const Icon = part.kind === "due" ? null : META_ICONS[part.kind];
  const overdue = part.kind === "due" && part.overdue;
  return (
    <span
      className={`inline-flex items-center gap-1 ${overdue ? "font-medium text-n-overdue" : ""}`}
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
      {/* The notes glyph stands alone; its word is for the accessible name. */}
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
        part.kind !== "notes" && part.text
      )}
      {part.kind === "link" && part.more > 0 && ` +${part.more}`}
    </span>
  );
}

function MetaLine({ parts, links }: { parts: MetaPart[]; links?: boolean }) {
  if (parts.length === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem] leading-[1.125rem] text-n-ink-muted"
    >
      {parts.map((part) => (
        <MetaItem key={part.kind} part={part} link={links} />
      ))}
    </span>
  );
}

/** The row's slot: collapses out when done, fades while being dragged. */
function RowShell({
  collapsing,
  dragging,
  rowRef,
  children,
}: {
  collapsing: boolean;
  dragging: boolean;
  rowRef?: Ref<HTMLLIElement>;
  children: ReactNode;
}) {
  return (
    <li
      ref={rowRef}
      data-phone-row
      className={`relative grid transition-[grid-template-rows,opacity] duration-(--n-duration-base) ease-n-out ${
        collapsing
          ? "grid-rows-[0fr] opacity-0"
          : dragging
            ? "grid-rows-[1fr] opacity-35"
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
  onOpen: (todo: TodoWithUrls) => void;
  /** `at` is the pointer, for a right-click; absent from the keyboard. */
  onMenu: (todo: TodoWithUrls, at?: { x: number; y: number }) => void;
  /**
   * `wide` is the board's density: 15px body, the row tinted and rounded
   * inside its column's gutter, and no long-press (a pointer drags instead).
   */
  density?: "phone" | "wide";
  /** Being dragged: the original stays in place, faded. */
  dragging?: boolean;
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
 * selects and a second click opens. Long-press (phone), right-click, the
 * context-menu key or Shift+F10 open the menu.
 */
export const TodoRow = memo(function TodoRow(props: TodoRowProps) {
  return props.density === "wide" ? (
    <WideTodoRow {...props} />
  ) : (
    <PhoneTodoRow {...props} />
  );
});

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
  dragging = false,
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

  const setTitleRef = (node: HTMLButtonElement | null) => {
    titleButton.current = node;
    if (typeof bodyRef === "function") bodyRef(node);
    else if (bodyRef) bodyRef.current = node;
  };

  return (
    <RowShell collapsing={collapsing} dragging={dragging} rowRef={rowRef}>
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
        }}
        onClick={(e) => {
          const target = e.target as Element;
          if (target.closest("a, [data-row-check]")) return;
          // Enter or Space on the title (a click with no detail), a double
          // click, or a click on the selection opens; any other selects.
          if (e.detail === 1 && !wasSelected.current) {
            titleButton.current?.focus();
            onSelect?.(todo);
            return;
          }
          onOpen(todo);
        }}
        onContextMenu={(e) => {
          if ((e.target as Element).closest("a")) return;
          e.preventDefault();
          onMenu(todo, { x: e.clientX, y: e.clientY });
        }}
        className={`-mx-2.5 flex min-h-0 cursor-pointer items-start gap-3 overflow-clip rounded-n-chip px-2.5 transition-colors duration-(--n-duration-fast) select-none ${
          selected || highlighted
            ? "bg-n-fill"
            : //`surface`, or `fill` in the tinted fourth column (TINTED).
              "pointer-fine:hover:bg-[var(--n-row-hover,var(--color-n-surface))]"
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
              className={`line-clamp-3 block text-[0.9375rem] leading-[1.4] font-medium tracking-[-0.005em] wrap-anywhere transition-colors duration-(--n-duration-fast) ${
                checked ? "text-n-ink-muted line-through" : "text-n-ink"
              }`}
            >
              {title}
            </span>
          </button>
          <MetaLine parts={parts} links />
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
  dragging = false,
  bodyProps,
  bodyRef,
  rowRef,
}: TodoRowProps) {
  const parts = rowMeta(todo, subtasks, now, timeZone);
  const title = displayTitle(todo);
  const press = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  // Set when a long-press opened the menu, so the click that follows the
  // finger lifting doesn't also open the detail.
  const suppressClick = useRef(false);

  useEffect(() => () => clearTimeout(press.current?.timer), []);

  const endPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    bodyProps?.onPointerDown?.(e);
    if (e.button !== 0) return;
    suppressClick.current = false;
    endPress();
    press.current = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        press.current = null;
        suppressClick.current = true;
        navigator.vibrate?.(10);
        onMenu(todo);
      }, LONG_PRESS_MS),
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p) return;
    if (
      Math.abs(e.clientX - p.x) > LONG_PRESS_SLOP ||
      Math.abs(e.clientY - p.y) > LONG_PRESS_SLOP
    ) {
      endPress();
    }
  };

  return (
    <RowShell collapsing={collapsing} dragging={dragging} rowRef={rowRef}>
      <div
        className={`flex min-h-0 items-start gap-3 overflow-clip px-5 transition-colors duration-(--n-duration-fast) ${
          highlighted ? "bg-n-fill" : "pointer-fine:hover:bg-n-surface"
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
          onPointerMove={onPointerMove}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onPointerLeave={endPress}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            onOpen(todo);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            endPress();
            suppressClick.current = false;
            onMenu(todo, { x: e.clientX, y: e.clientY });
          }}
          onKeyDown={(e) => menuKey(e, () => onMenu(todo), bodyProps)}
          aria-haspopup="dialog"
          aria-description={metaSummary(parts) || undefined}
          className="n-focus-inset min-w-0 flex-1 cursor-pointer touch-pan-y rounded-n-chip py-[0.6875rem] text-left select-none [-webkit-touch-callout:none]"
        >
          <span
            className={`line-clamp-3 block text-[1.0625rem] leading-[1.35] font-medium tracking-[-0.005em] wrap-anywhere transition-colors duration-(--n-duration-fast) ${
              checked ? "text-n-ink-muted line-through" : "text-n-ink"
            }`}
          >
            {title}
          </span>
          <MetaLine parts={parts} />
        </button>
      </div>
    </RowShell>
  );
}
