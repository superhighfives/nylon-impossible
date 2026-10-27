import { Toast } from "@base-ui/react/toast";
import { AlertCircle, X } from "lucide-react";
import { toastManager } from "@/lib/toast";

/**
 * One dark pill, "Done · Undo" style, with the action as an outlined
 * button in the same colour as the text.
 * Only the newest shows; a new toast replaces the last. Token colours only.
 */
function ToastItem({ toast }: { toast: Toast.Root.ToastObject }) {
  const error = toast.type === "error";
  return (
    <Toast.Root
      toast={toast}
      className="pointer-events-auto absolute bottom-0 left-1/2 z-[calc(1000-var(--toast-index))] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1.5 rounded-[0.875rem] bg-n-ink py-1.5 pr-1.5 pl-4 font-n-text text-[0.9375rem] text-n-canvas opacity-[calc(1-min(var(--toast-index),1))] data-limited:pointer-events-none data-limited:opacity-0 shadow-[0_8px_24px_color-mix(in_srgb,black_18%,transparent)] transition-[opacity,translate] duration-(--n-duration-base) ease-n-out data-ending-style:translate-y-2.5 data-ending-style:opacity-0 data-starting-style:translate-y-2.5 data-starting-style:opacity-0"
    >
      <Toast.Content className="flex min-h-9 items-center gap-1.5">
        {error && (
          <AlertCircle size={15} aria-hidden="true" className="shrink-0" />
        )}
        <Toast.Title className="truncate">{toast.title}</Toast.Title>
        {/* Renders only when the toast was added with `actionProps`. */}
        <Toast.Action className="min-h-9 shrink-0 cursor-pointer rounded-[0.625rem] border border-current px-3 font-bold n-focus" />
        <Toast.Close
          aria-label="Dismiss"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[0.625rem] text-n-ink-subtle n-focus"
        >
          <X size={14} aria-hidden="true" />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return (
    <>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </>
  );
}

/**
 * Global toast viewport, rendered once near the app root. Centred at the
 * bottom; on the phone layout it sits just above the composer, which
 * publishes `--n-phone-toast-offset`.
 */
export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} limit={1}>
      <Toast.Viewport className="pointer-events-none fixed inset-x-0 bottom-[var(--n-phone-toast-offset,calc(1.75rem+env(safe-area-inset-bottom,0px)))] z-[100] h-0">
        <ToastList />
      </Toast.Viewport>
    </Toast.Provider>
  );
}
