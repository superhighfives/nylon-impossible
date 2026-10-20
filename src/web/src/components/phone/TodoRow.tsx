import {
  Check,
  FileText,
  Link as LinkIcon,
  ListChecks,
  Pin,
  Repeat,
} from "lucide-react";
import {
  type KeyboardEvent,
  memo,
  type PointerEvent,
  useEffect,
  useRef,
} from "react";
import type { TodoWithUrls } from "@/types/database";
import { type MetaPart, metaSummary, rowMeta } from "./model";

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
  onMenu: (todo: TodoWithUrls) => void;
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
}: TodoRowProps) {
  const parts = rowMeta(todo, subtasks, now, timeZone);
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

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      onMenu(todo);
    }
  };

  const summary = metaSummary(parts);

  return (
    <li
      data-phone-row
      className={`grid transition-[grid-template-rows,opacity] duration-(--n-duration-base) ease-n-out ${
        collapsing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      }`}
      aria-hidden={collapsing || undefined}
    >
      <div
        className={`flex min-h-0 items-start gap-3.5 overflow-hidden px-5 transition-colors duration-(--n-duration-fast) ${
          highlighted ? "bg-n-fill" : "pointer-fine:hover:bg-n-surface"
        }`}
      >
        <button
          type="button"
          aria-pressed={checked}
          aria-label={`Mark “${todo.title}” done`}
          onClick={() => onCheck(todo)}
          className="n-focus-inset -mr-1.5 -ml-2.5 mt-0.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-n-field"
        >
          <span
            className={`flex size-6 items-center justify-center rounded-[7px] border-[1.75px] transition-[background-color,border-color] duration-(--n-duration-fast) ${
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
            onMenu(todo);
          }}
          onKeyDown={onKeyDown}
          aria-haspopup="dialog"
          aria-description={summary || undefined}
          className="min-w-0 flex-1 cursor-pointer touch-pan-y select-none rounded-n-chip py-3 text-left n-focus-inset [-webkit-touch-callout:none]"
        >
          <span
            className={`line-clamp-3 block text-[1.0625rem] leading-[1.35] font-medium tracking-[-0.005em] wrap-anywhere transition-colors duration-(--n-duration-fast) ${
              checked ? "text-n-ink-muted line-through" : "text-n-ink"
            }`}
          >
            {todo.title}
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
