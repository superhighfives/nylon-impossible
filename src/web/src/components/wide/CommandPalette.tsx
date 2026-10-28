import { Dialog } from "@base-ui/react/dialog";
import { Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useState } from "react";

export interface PaletteItem {
  id: string;
  label: string;
  /** Muted, after the label: a count, or the list a todo is in. */
  meta?: string;
  /** The key that does the same thing: "⇧1", "X". */
  hint?: string;
  run: () => void;
}

export interface PaletteGroup {
  label: string;
  items: PaletteItem[];
}

/** Items whose label contains the query, case-blind. */
export function filterItems(items: PaletteItem[], query: string) {
  const q = query.trim().toLowerCase();
  return q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
}

/**
 * The command palette (⌘K), and the same dialog for Move to (M) and Go to a
 * list (G L): a search field that's a combobox over a grouped listbox.
 * ↑ ↓ choose, Enter runs, Esc or ⌘K closes, and focus goes back to the
 * selected row.
 */
export function CommandPalette({
  open,
  onClose,
  title,
  placeholder,
  groups,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  /** Above the field: `Move “Plan Lisbon trip”`, `Go to a list`. */
  title?: string;
  placeholder: string;
  /** The results for what's typed, in order. */
  groups: (query: string) => PaletteGroup[];
  /** Where focus goes on close. */
  returnFocus: () => HTMLElement | null;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  // Each opening starts empty.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const shown = open ? groups(query).filter((g) => g.items.length > 0) : [];
  const items = shown.flatMap((g) => g.items);
  const at = Math.min(active, Math.max(0, items.length - 1));
  const optionId = (i: number) => `${listId}-option-${i}`;

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((at + delta + items.length) % items.length);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      choose(items[at]);
    }
  };

  let index = -1;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--n-color-canvas)_55%,transparent)] backdrop-blur-[6px] transition-opacity duration-(--n-duration-fast) data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          finalFocus={() => returnFocus() ?? true}
          className="fixed top-[16vh] left-1/2 z-50 flex max-h-[min(32rem,70vh)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[1rem] border border-n-hairline bg-n-surface text-n-ink shadow-[0_16px_40px_color-mix(in_srgb,black_18%,transparent)] outline-none transition-[opacity,translate] duration-(--n-duration-fast) ease-n-out data-ending-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0"
        >
          <Dialog.Title
            className={
              title
                ? "m-0 truncate px-[1.125rem] pt-3.5 text-xs font-semibold text-n-ink-muted"
                : "sr-only"
            }
          >
            {title ?? "Search and commands"}
          </Dialog.Title>
          <div className="flex items-center gap-2.5 border-b border-n-hairline px-[1.125rem]">
            <Search
              size={16}
              aria-hidden="true"
              className="shrink-0 text-n-ink-muted"
            />
            <input
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items.length ? optionId(at) : undefined}
              aria-label={placeholder}
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-n-ink outline-none placeholder:text-n-ink-muted"
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label={title ?? "Results"}
            className="min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-width:thin]"
          >
            {items.length === 0 && (
              <p className="m-0 px-3 py-3 text-[0.9375rem] text-n-ink-muted">
                Nothing matches “{query.trim()}”.
              </p>
            )}
            {shown.map((group) => (
              // A group of options inside the listbox, which a fieldset isn't.
              // biome-ignore lint/a11y/useSemanticElements: ARIA listbox group
              <div
                key={group.label}
                role="group"
                aria-label={group.label}
                className="pb-1"
              >
                <p
                  aria-hidden="true"
                  className="m-0 px-3 pt-2 pb-1 text-xs font-semibold text-n-ink-muted"
                >
                  {group.label}
                </p>
                {group.items.map((item) => {
                  index += 1;
                  const i = index;
                  const selected = i === at;
                  return (
                    // Options are pointer targets; the combobox owns keys.
                    // biome-ignore lint/a11y/useKeyWithClickEvents: the field handles keys via aria-activedescendant
                    <div
                      key={item.id}
                      id={optionId(i)}
                      role="option"
                      tabIndex={-1}
                      aria-selected={selected}
                      ref={(el) => {
                        if (selected)
                          el?.scrollIntoView?.({ block: "nearest" });
                      }}
                      onPointerMove={() => setActive(i)}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => choose(item)}
                      className={`flex h-10 cursor-pointer items-center gap-3 rounded-[0.5rem] px-3 text-[0.9375rem] ${
                        selected ? "bg-n-fill" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                      {item.meta && (
                        <span className="max-w-[40%] shrink-0 truncate text-[0.8125rem] text-n-ink-muted tabular-nums">
                          {item.meta}
                        </span>
                      )}
                      {item.hint && (
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-[0.8125rem] text-n-ink-muted"
                        >
                          {item.hint}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p
            aria-hidden="true"
            className="m-0 flex gap-4 border-t border-n-hairline px-[1.125rem] py-2.5 text-xs text-n-ink-muted"
          >
            <span>↑↓ to choose</span>
            <span>↵ to run</span>
            <span>esc to close</span>
          </p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
