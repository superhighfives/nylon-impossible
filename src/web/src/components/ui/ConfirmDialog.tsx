import { Dialog } from "@base-ui/react/dialog";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  confirmPending?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  confirmPending = false,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-90" />
        <Dialog.Popup className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-gray-surface rounded-xl shadow-lg p-6 space-y-4">
            <div className="space-y-1.5">
              <Dialog.Title className="text-base font-semibold text-gray">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm text-gray-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Dialog.Close
                render={
                  <Button variant="secondary" size="sm" type="button">
                    {cancelLabel}
                  </Button>
                }
              />
              <Button
                variant="destructive"
                size="sm"
                type="button"
                onClick={onConfirm}
                disabled={confirmPending}
                loading={confirmPending}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
