import { Dialog } from "@base-ui/react/dialog";
import { ArrowRight, Pin, PinOff, Trash2 } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import type { TodoWithUrls } from "@/types/database";

export interface MenuTarget {
  id: string;
  label: string;
}

/** Arrow keys, Home and End move between a menu's items. */
export function moveMenuFocus(e: KeyboardEvent<HTMLElement>) {
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
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

/**
 * The row's context menu, from a long-press, right-click, the context-menu
 * key or Shift+F10: Move to …, Pin/Unpin, Delete. Delete isn't confirmed —
 * it shows an Undo toast instead.
 */
export function ContextMenu({
  todo,
  where,
  moveTargets,
  onClose,
  onMove,
  onTogglePin,
  onDelete,
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
}) {
  const firstItem = useRef<HTMLButtonElement>(null);
  // Keep the last todo while the close animation runs.
  const shown = useRef<TodoWithUrls | null>(null);
  if (todo) shown.current = todo;
  const current = todo ?? shown.current;

  const run = (fn: (t: TodoWithUrls) => void) => {
    if (!current) return;
    fn(current);
    onClose();
  };

  return (
    <Dialog.Root
      open={!!todo}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--n-color-canvas)_55%,transparent)] backdrop-blur-[6px] transition-opacity duration-(--n-duration-fast) data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          initialFocus={firstItem}
          className="fixed inset-x-6 top-[28vh] z-50 mx-auto max-w-md text-n-ink outline-none transition-[opacity,translate] duration-(--n-duration-base) ease-n-out data-ending-style:translate-y-3 data-ending-style:opacity-0 data-starting-style:translate-y-3 data-starting-style:opacity-0"
        >
          {current && (
            <>
              <div className="mb-2.5 rounded-[0.875rem] bg-n-canvas px-4 py-3.5 shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)] dark:bg-n-fill">
                <Dialog.Title className="line-clamp-3 text-[1.0625rem] leading-[1.35] font-medium">
                  {current.title}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-[0.8125rem] text-n-ink-muted">
                  {where}
                </Dialog.Description>
              </div>
              <div
                role="menu"
                aria-label="Todo actions"
                tabIndex={-1}
                onKeyDown={moveMenuFocus}
                className="overflow-hidden rounded-[0.875rem] bg-n-canvas shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)] dark:bg-n-fill"
              >
                {moveTargets.map((target, i) => (
                  <button
                    key={target.id}
                    ref={i === 0 ? firstItem : undefined}
                    type="button"
                    role="menuitem"
                    onClick={() => run((t) => onMove(t, target.id))}
                    className={ITEM_CLASS}
                  >
                    <span className="flex-1">Move to {target.label}</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                ))}
                <button
                  ref={moveTargets.length === 0 ? firstItem : undefined}
                  type="button"
                  role="menuitem"
                  onClick={() => run(onTogglePin)}
                  className={ITEM_CLASS}
                >
                  <span className="flex-1">
                    {current.pinned ? "Unpin" : "Pin to top"}
                  </span>
                  {current.pinned ? (
                    <PinOff size={17} aria-hidden="true" />
                  ) : (
                    <Pin size={17} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => run(onDelete)}
                  className={`${ITEM_CLASS} text-n-overdue`}
                >
                  <span className="flex-1">Delete</span>
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
