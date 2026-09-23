import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

export interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
}

export function SidePanel({
  open,
  onOpenChange,
  title,
  children,
}: SidePanelProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal keepMounted>
        <Dialog.Backdrop className="fixed inset-0 z-70 bg-black/40 transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-80 flex w-full max-w-md flex-col bg-gray-surface shadow-xl outline-none transition-transform duration-300 ease-out focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-inset data-ending-style:translate-x-full data-starting-style:translate-x-full sm:inset-y-2 sm:right-2 sm:rounded-xl sm:border sm:border-gray-subtle">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-subtle px-4 py-3">
            {/* Close comes first in DOM/tab order (order-last visually) so
                tabbing from the panel goes Close -> title -> body content,
                not title first. */}
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  aria-label="Close"
                  className="order-last"
                >
                  <X size={16} />
                </Button>
              }
            />
            <Dialog.Title className="min-w-0 break-words text-sm font-medium text-gray">
              {title}
            </Dialog.Title>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
