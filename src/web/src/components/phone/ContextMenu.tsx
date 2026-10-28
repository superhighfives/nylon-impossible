import { Dialog } from "@base-ui/react/dialog";
import { dayKeyIn, dueDayKey } from "@nylon-impossible/shared";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { TodoWithUrls } from "@/types/database";
import { Calendar } from "./Calendar";
import { displayTitle, dueChoices, dueLabel } from "./model";

export interface MenuTarget {
  id: string;
  label: string;
}

/**
 * One item of the wide board's menu, from its command registry: the label,
 * the key that does the same thing, and what it runs. `due` opens the Due
 * view in place.
 */
export interface MenuCommand {
  id: string;
  label: string;
  hint: string;
  run: (todo: TodoWithUrls) => void;
}

function commandIcon(id: string, pinned: boolean, size: number) {
  if (id === "done") return <Check size={size} aria-hidden="true" />;
  if (id === "due") return <CalendarIcon size={size} aria-hidden="true" />;
  if (id === "pin") {
    return pinned ? (
      <PinOff size={size} aria-hidden="true" />
    ) : (
      <Pin size={size} aria-hidden="true" />
    );
  }
  if (id === "delete") return <Trash2 size={size} aria-hidden="true" />;
  return <ArrowRight size={size} aria-hidden="true" />;
}

/** Arrow keys, Home and End move between a menu's items. */
export function moveMenuFocus(e: KeyboardEvent<HTMLElement>) {
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemradio"]',
    ),
  );
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  let next = -1;
  if (e.key === "ArrowDown") next = (at + 1) % items.length;
  else if (e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = items.length - 1;
  if (next === -1) return;
  e.preventDefault();
  items[next]?.focus();
}

const ITEM_CLASS =
  "flex h-[3.125rem] w-full cursor-pointer items-center gap-2.5 border-t border-n-hairline px-4 text-left text-base first:border-t-0 n-focus-inset active:bg-n-fill pointer-fine:hover:bg-n-surface";

/** The pointer-anchored menu (wide) uses denser items. */
const COMPACT_ITEM_CLASS =
  "flex h-10 w-full cursor-pointer items-center gap-2.5 border-t border-n-hairline px-3.5 text-left text-[0.9375rem] first:border-t-0 n-focus-soft active:bg-n-fill pointer-fine:hover:bg-n-surface";

const CARD =
  "overflow-hidden rounded-[0.875rem] bg-n-canvas shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)] dark:bg-n-fill";

const MENU_WIDTH = 288;

export type MenuView = "main" | "due";

/**
 * The row's context menu, from a long-press, right-click, the context-menu
 * key or Shift+F10 (and `d` on wide, straight into Due): Move to …, Due…,
 * Pin/Unpin, Delete. Delete isn't confirmed — it shows an Undo toast instead.
 *
 * On phone it floats centred over a blurred backdrop. Given an `anchor` (a
 * right-click or a focused row on wide) it opens beside that point instead.
 */
export function ContextMenu({
  todo,
  where,
  moveTargets,
  onClose,
  onMove,
  onTogglePin,
  onDelete,
  onSetDue,
  timeZone = "UTC",
  anchor = null,
  initialView = "main",
  commands,
}: {
  todo: TodoWithUrls | null;
  /** The name of the list the todo is in. */
  where: string;
  /** Every list except the one it's in. */
  moveTargets: MenuTarget[];
  onClose: () => void;
  onMove: (todo: TodoWithUrls, listId: string) => void;
  onTogglePin: (todo: TodoWithUrls) => void;
  onDelete: (todo: TodoWithUrls) => void;
  /** Shows "Due…" when given. */
  onSetDue?: (todo: TodoWithUrls, day: Date | null) => void;
  timeZone?: string;
  /** Viewport point to open beside, instead of centred. */
  anchor?: { x: number; y: number } | null;
  initialView?: MenuView;
  /**
   * Wide: the items, from the board's command registry, with their keys.
   * Replaces the phone's Move to …, Due…, Pin and Delete.
   */
  commands?: MenuCommand[];
}) {
  const firstItem = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<MenuView>(initialView);
  const [picking, setPicking] = useState(false);
  // Keep the last todo (and where it opened) while the close animation runs.
  const shown = useRef<TodoWithUrls | null>(null);
  const shownAnchor = useRef(anchor);
  if (todo) {
    shown.current = todo;
    shownAnchor.current = anchor;
  }
  const current = todo ?? shown.current;
  const at = todo ? anchor : shownAnchor.current;
  const compact = !!at;
  const item = compact ? COMPACT_ITEM_CLASS : ITEM_CLASS;
  const iconSize = compact ? 15 : 17;

  // Each opening starts on the view it was asked for.
  const openId = todo?.id ?? null;
  useEffect(() => {
    if (openId) {
      setView(initialView);
      setPicking(false);
    }
  }, [openId, initialView]);

  // Moving between views keeps focus inside the menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus on view change
  useEffect(() => {
    if (openId) firstItem.current?.focus();
  }, [view]);

  const run = (fn: (t: TodoWithUrls) => void) => {
    if (!current) return;
    fn(current);
    onClose();
  };

  const now = new Date();
  const dueKey = current?.dueDate ? dueDayKey(current.dueDate) : null;
  const due = current?.dueDate
    ? dueLabel(current.dueDate, now, timeZone)
    : null;

  const position = at
    ? {
        left: Math.max(
          8,
          Math.min(at.x, (globalThis.innerWidth ?? 1024) - MENU_WIDTH - 8),
        ),
        top: Math.max(8, Math.min(at.y, (globalThis.innerHeight ?? 768) - 420)),
        width: MENU_WIDTH,
      }
    : undefined;

  return (
    <Dialog.Root
      open={!!todo}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={`fixed inset-0 z-50 transition-opacity duration-(--n-duration-fast) data-ending-style:opacity-0 data-starting-style:opacity-0 ${
            compact
              ? "bg-transparent"
              : "bg-[color-mix(in_srgb,var(--n-color-canvas)_55%,transparent)] backdrop-blur-[6px]"
          }`}
        />
        <Dialog.Popup
          initialFocus={firstItem}
          style={position}
          className={`fixed z-50 text-n-ink outline-none transition-[opacity,translate] duration-(--n-duration-base) ease-n-out data-ending-style:opacity-0 data-starting-style:opacity-0 ${
            compact
              ? "data-ending-style:translate-y-1 data-starting-style:translate-y-1"
              : "inset-x-6 top-[28vh] mx-auto max-w-md data-ending-style:translate-y-3 data-starting-style:translate-y-3"
          }`}
        >
          {current && (
            <>
              <div
                className={`${compact ? "mb-1.5 px-3.5 py-2.5" : "mb-2.5 px-4 py-3.5"} rounded-[0.875rem] bg-n-canvas shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)] dark:bg-n-fill`}
              >
                <Dialog.Title
                  className={`line-clamp-3 leading-[1.35] font-medium ${compact ? "text-[0.9375rem]" : "text-[1.0625rem]"}`}
                >
                  {displayTitle(current)}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-[0.8125rem] text-n-ink-muted">
                  {where}
                  {due && ` · ${due.text}`}
                </Dialog.Description>
              </div>
              {view === "main" && commands ? (
                <div
                  role="menu"
                  aria-label="Todo actions"
                  tabIndex={-1}
                  onKeyDown={moveMenuFocus}
                  className={CARD}
                >
                  {commands.map((c, i) => (
                    <button
                      key={c.id}
                      ref={i === 0 ? firstItem : undefined}
                      type="button"
                      role="menuitem"
                      aria-haspopup={c.id === "due" ? "menu" : undefined}
                      aria-keyshortcuts={c.hint}
                      onClick={() =>
                        c.id === "due" ? setView("due") : run(c.run)
                      }
                      className={`${item} ${c.id === "delete" ? "text-n-destructive" : ""}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      <span
                        aria-hidden="true"
                        className="font-n-text text-[0.8125rem] text-n-ink-muted"
                      >
                        {c.hint}
                      </span>
                      {commandIcon(c.id, current.pinned, iconSize)}
                    </button>
                  ))}
                </div>
              ) : view === "main" ? (
                <div
                  role="menu"
                  aria-label="Todo actions"
                  tabIndex={-1}
                  onKeyDown={moveMenuFocus}
                  className={CARD}
                >
                  {moveTargets.map((target, i) => (
                    <button
                      key={target.id}
                      ref={i === 0 ? firstItem : undefined}
                      type="button"
                      role="menuitem"
                      onClick={() => run((t) => onMove(t, target.id))}
                      className={item}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        Move to {target.label}
                      </span>
                      <ArrowRight size={iconSize} aria-hidden="true" />
                    </button>
                  ))}
                  {onSetDue && (
                    <button
                      ref={moveTargets.length === 0 ? firstItem : undefined}
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      onClick={() => setView("due")}
                      className={item}
                    >
                      <span className="flex-1">Due…</span>
                      <CalendarIcon size={iconSize} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    ref={
                      moveTargets.length === 0 && !onSetDue
                        ? firstItem
                        : undefined
                    }
                    type="button"
                    role="menuitem"
                    onClick={() => run(onTogglePin)}
                    className={item}
                  >
                    <span className="flex-1">
                      {current.pinned ? "Unpin" : "Pin to top"}
                    </span>
                    {current.pinned ? (
                      <PinOff size={iconSize} aria-hidden="true" />
                    ) : (
                      <Pin size={iconSize} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => run(onDelete)}
                    className={`${item} text-n-overdue`}
                  >
                    <span className="flex-1">Delete</span>
                    <Trash2 size={iconSize} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className={CARD}>
                  <div
                    role="menu"
                    aria-label="Due"
                    tabIndex={-1}
                    onKeyDown={moveMenuFocus}
                  >
                    <button
                      ref={firstItem}
                      type="button"
                      role="menuitem"
                      onClick={() => setView("main")}
                      className={`${item} text-n-ink-muted`}
                    >
                      <ChevronLeft size={iconSize} aria-hidden="true" />
                      <span className="flex-1">Due</span>
                    </button>
                    {dueChoices(now, timeZone).map((c) => {
                      const selected = c.day
                        ? dueKey === dueDayKey(c.day)
                        : dueKey === null;
                      return (
                        <button
                          key={c.label}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          onClick={() =>
                            run((t) => onSetDue?.(t, c.day ?? null))
                          }
                          className={`${item} ${selected ? "font-semibold" : ""}`}
                        >
                          <span className="flex-1">{c.label}</span>
                          {selected && (
                            <span
                              aria-hidden="true"
                              className="size-2 rounded-full bg-n-brand"
                            />
                          )}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      role="menuitem"
                      aria-expanded={picking}
                      onClick={() => setPicking((p) => !p)}
                      className={item}
                    >
                      <span className="flex-1">Pick a date…</span>
                      <CalendarIcon size={iconSize} aria-hidden="true" />
                    </button>
                  </div>
                  {picking && (
                    <div className="border-t border-n-hairline p-2">
                      <Calendar
                        value={dueKey}
                        todayKey={dayKeyIn(now, timeZone)}
                        onSelect={(ymd) =>
                          run((t) =>
                            onSetDue?.(t, new Date(`${ymd}T00:00:00.000Z`)),
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
