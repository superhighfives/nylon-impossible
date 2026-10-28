import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { GROUPS, visibleCommands } from "./commands";

/** `?`: the wide board's keyboard map, read from the command registry. */
export function ShortcutsOverlay({
  open,
  onClose,
  feedback = false,
}: {
  open: boolean;
  onClose: () => void;
  /** List `f` too: the account can send feedback. */
  feedback?: boolean;
}) {
  const commands = visibleCommands(feedback);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--n-color-canvas)_55%,transparent)] backdrop-blur-[6px] transition-opacity duration-(--n-duration-fast) data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100vh-4rem)] w-[30rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[0.875rem] bg-n-canvas p-5 text-n-ink shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)] outline-none transition-opacity duration-(--n-duration-base) ease-n-out data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-n-fill">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="m-0 font-n-display text-[1.375rem] font-semibold tracking-[-0.01em]">
              Keyboard shortcuts
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-mr-2 flex size-9 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus pointer-fine:hover:bg-n-surface"
            >
              <X size={15} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Shortcuts work when focus isn’t in a text field.
          </Dialog.Description>
          {GROUPS.map((group) => {
            const rows = commands.filter((c) => c.group === group);
            if (rows.length === 0) return null;
            return (
              <section key={group} className="mt-4 first-of-type:mt-0">
                <h3 className="m-0 mb-1.5 text-[0.8125rem] font-semibold text-n-ink-muted">
                  {group}
                </h3>
                <dl className="m-0 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 text-[0.9375rem]">
                  {rows.map((c) => (
                    <div key={c.id} className="contents">
                      <dt className="text-n-ink">{c.label}</dt>
                      <dd className="m-0 flex flex-wrap justify-end gap-1.5 text-[0.8125rem] text-n-ink-muted">
                        {c.keys.map((combo, i) => (
                          <span key={combo.join("+")} className="flex gap-1">
                            {i > 0 && <span className="self-center">or</span>}
                            {combo.map((k) => (
                              <kbd
                                key={k}
                                className="inline-flex h-6 min-w-6 items-center justify-center rounded-n-chip border border-n-hairline bg-n-surface px-1.5 font-n-text font-medium text-n-ink"
                              >
                                {k}
                              </kbd>
                            ))}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
