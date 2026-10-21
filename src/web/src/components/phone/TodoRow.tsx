import {
  Check,
  FileText,
  Link as LinkIcon,
  ListChecks,
  Pin,
  Repeat,
} from "lucide-react";
import {
  type HTMLAttributes,
  type KeyboardEvent,
  memo,
  type PointerEvent,
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
  subtasks: ListChecks,
  notes: FileText,
  link: LinkIcon,
} as const;

function MetaItem({ part }: { part: MetaPart }) {
  const Icon = part.kind === "due" ? null : META_ICONS[part.kind];
  const overdue = part.kind === "due" && part.overdue;
  return (
    <span
      className={`inline-flex items-center gap-1 ${overdue ? "font-medium text-n-overdue" : ""}`}
    >
      {Icon && <Icon size={13} strokeWidth={2} aria-hidden="true" />}
      {/* The notes glyph stands alone; its word is for the accessible name. */}
      {part.kind !== "notes" && part.text}
    </span>
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
  bodyRef?: Ref<HTMLButtonElement>;
  rowRef?: Ref<HTMLLIElement>;
}

/**
 * One todo: checkbox, title (up to three lines) and a meta line. No handles,
 * chevrons or toolbars — tap opens the detail; long-press, right-click, the
 * context-menu key or Shift+F10 open the menu.
 */
export const TodoRow = memo(function TodoRow({
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
  density = "phone",
  dragging = false,
  bodyProps,
  bodyRef,
  rowRef,
}: TodoRowProps) {
  const wide = density === "wide";
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
    if (wide || e.button !== 0) return;
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

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    bodyProps?.onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      onMenu(todo);
    }
  };

  const summary = metaSummary(parts);

  return (
    <li
      ref={rowRef}
      data-phone-row
      className={`grid transition-[grid-template-rows,opacity] duration-(--n-duration-base) ease-n-out ${
        collapsing
          ? "grid-rows-[0fr] opacity-0"
          : dragging
            ? "grid-rows-[1fr] opacity-35"
            : "grid-rows-[1fr] opacity-100"
      }`}
      aria-hidden={collapsing || undefined}
    >
      <div
        className={`flex min-h-0 items-start overflow-hidden transition-colors duration-(--n-duration-fast) ${
          wide ? "-mx-2.5 gap-3 rounded-n-field px-2.5" : "gap-3.5 px-5"
        } ${highlighted ? "bg-n-fill" : "pointer-fine:hover:bg-n-surface"}`}
      >
        <button
          type="button"
          aria-pressed={checked}
          aria-label={`Mark “${title}” done`}
          onClick={() => onCheck(todo)}
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
            {checked && (
              <Check size={14} strokeWidth={3.2} aria-hidden="true" />
            )}
          </span>
        </button>
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
          onKeyDown={onKeyDown}
          aria-haspopup="dialog"
          aria-description={summary || undefined}
          className={`min-w-0 flex-1 cursor-pointer touch-pan-y select-none rounded-n-chip text-left n-focus-inset [-webkit-touch-callout:none] ${wide ? "py-2.5" : "py-3"}`}
        >
          <span
            className={`line-clamp-3 block font-medium tracking-[-0.005em] wrap-anywhere transition-colors duration-(--n-duration-fast) ${
              wide
                ? "text-[0.9375rem] leading-[1.4]"
                : "text-[1.0625rem] leading-[1.35]"
            } ${checked ? "text-n-ink-muted line-through" : "text-n-ink"}`}
          >
            {title}
          </span>
          {parts.length > 0 && (
            <span
              aria-hidden="true"
              className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem] leading-[1.125rem] text-n-ink-muted"
            >
              {parts.map((part) => (
                <MetaItem key={part.kind} part={part} />
              ))}
            </span>
          )}
        </button>
      </div>
    </li>
  );
});
