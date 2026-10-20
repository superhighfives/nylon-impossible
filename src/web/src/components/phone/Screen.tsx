import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { BackButton } from "./Masthead";

/**
 * A pushed full-screen page (Done, Settings) over the pager. Modal, so focus
 * stays inside and Escape or the back control returns to where you were.
 */
export function Screen({
  open,
  onClose,
  backLabel,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  backLabel: string;
  /** Accessible name; the visible title is the page's own masthead. */
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup
          aria-label={title}
          className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-n-canvas text-n-ink outline-none transition-[translate,opacity] duration-(--n-duration-base) ease-n-out data-ending-style:translate-x-8 data-ending-style:opacity-0 data-starting-style:translate-x-8 data-starting-style:opacity-0"
        >
          <div className="mx-auto max-w-[42rem] pt-[env(safe-area-inset-top,0px)] pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
            <BackButton label={backLabel} onClick={onClose} />
            {children}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
