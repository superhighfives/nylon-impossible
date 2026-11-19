import { Toast } from "@base-ui/react/toast";
import { AlertCircle, X } from "lucide-react";
import { toastManager } from "@/lib/toast";

/**
 * One coloured pill, "Done · Undo" style, with the action as an outline
 * button in the pill's ink. Success and info are a `brand` yellow pill with
 * `brandInk`: yellow only as a fill with dark ink and dark lines, as Settled
 * "Brand accent" allows. An error is a `destructiveSolid` red pill with
 * white ink and the alert icon (Settled "Destructive and overdue red").
 * The action and × ring focus in the same ink. Only the newest shows; a new
 * toast replaces the last. Token colours only.
 */
function ToastItem({ toast }: { toast: Toast.Root.ToastObject }) {
  const error = toast.type === "error";
  const look = error
    ? "bg-n-destructive-solid text-n-destructive-solid-ink"
    : "bg-n-brand text-n-brand-ink";
  return (
    <Toast.Root
      toast={toast}
      className={`${look} pointer-events-auto absolute bottom-0 left-1/2 z-[calc(1000-var(--toast-index))] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1.5 rounded-[0.875rem] py-1.5 pr-1.5 pl-4 font-n-text text-[0.9375rem] opacity-[calc(1-min(var(--toast-index),1))] data-limited:pointer-events-none data-limited:opacity-0 shadow-[0_8px_24px_color-mix(in_srgb,black_18%,transparent)] transition-[opacity,translate] duration-(--n-duration-base) ease-n-out data-ending-style:translate-y-2.5 data-ending-style:opacity-0 data-starting-style:translate-y-2.5 data-starting-style:opacity-0`}
    >
      <Toast.Content className="flex min-h-9 items-center gap-1.5">
        {error && (
          <AlertCircle size={15} aria-hidden="true" className="shrink-0" />
        )}
        <Toast.Title className="truncate">{toast.title}</Toast.Title>
        {/* Renders only when the toast was added with `actionProps`. */}
        <Toast.Action
          data-toast-action
          className={`h-9 shrink-0 cursor-pointer rounded-[0.6875rem] border px-3.5 font-bold n-focus-toast ${error ? "border-n-destructive-solid-ink text-n-destructive-solid-ink" : "border-n-brand-ink text-n-brand-ink"}`}
        />
        <Toast.Close
          aria-label="Dismiss"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[0.625rem] n-focus-toast"
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
