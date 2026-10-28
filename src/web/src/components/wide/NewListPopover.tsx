import { Popover } from "@base-ui/react/popover";
import { type ReactElement, useState } from "react";

export const POPOVER_CARD =
  "rounded-[0.875rem] border border-n-hairline bg-n-surface text-n-ink shadow-[0_16px_40px_color-mix(in_srgb,black_18%,transparent)] outline-none transition-[opacity,translate] duration-(--n-duration-fast) ease-n-out data-ending-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0";

/**
 * "New list": a small popover anchored to whichever button opened it (the
 * sidebar's or the toolbar's), with a Name field and Add. Enter or Add
 * creates the list; the board opens it and focuses its Add field.
 */
export function NewListPopover({
  trigger,
  side = "bottom",
  align = "start",
  onCreate,
  open: openProp,
  onOpenChange,
  returnFocus,
}: {
  /** The button that opens it, rendered as the popover's trigger. */
  trigger: ReactElement<Record<string, unknown>>;
  side?: "bottom" | "right";
  align?: "start" | "end";
  onCreate: (name: string) => void;
  /** Controlled, for ⇧N; otherwise the popover keeps its own state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Where focus goes on close, when not back to the trigger. */
  returnFocus?: () => HTMLElement | null;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [name, setName] = useState("");
  const add = () => {
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    setOpen(false);
    setName("");
    onCreate(trimmed);
  };
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setName("");
      }}
    >
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner
          side={side}
          align={align}
          sideOffset={6}
          className="z-50"
        >
          <Popover.Popup
            finalFocus={() => returnFocus?.() ?? true}
            className={`${POPOVER_CARD} w-72 p-3`}
          >
            <Popover.Title className="m-0 mb-2 text-[0.8125rem] font-semibold text-n-ink-muted">
              New list
            </Popover.Title>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Name"
                placeholder="Name"
                className="h-9 min-w-0 flex-1 rounded-n-chip border border-n-hairline bg-transparent px-2.5 text-[0.9375rem] text-n-ink outline-none placeholder:text-n-ink-muted focus-visible:border-n-ink"
              />
              <button
                type="submit"
                disabled={!name.trim()}
                className="h-9 shrink-0 cursor-pointer rounded-n-chip bg-n-brand px-3.5 text-[0.9375rem] font-semibold text-n-brand-ink n-focus disabled:cursor-default disabled:opacity-50"
              >
                Add
              </button>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
