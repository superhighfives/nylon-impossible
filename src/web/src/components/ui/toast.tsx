import { Toast } from "@base-ui/react/toast";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { type ToastType, toastManager } from "@/lib/toast";

const TYPE_STYLES: Record<
  ToastType,
  { accent: string; icon: typeof CheckCircle2; iconClass: string }
> = {
  success: {
    accent: "bg-yellow-base ring-yellow-subtle",
    icon: CheckCircle2,
    iconClass: "text-yellow-11 dark:text-yellowdark-11",
  },
  error: {
    accent: "bg-red-base ring-red-subtle",
    icon: AlertCircle,
    iconClass: "text-red-11 dark:text-reddark-11",
  },
  info: {
    accent: "bg-gray-surface ring-gray-subtle",
    icon: Info,
    iconClass: "text-gray-muted",
  },
};

function ToastItem({ toast }: { toast: Toast.Root.ToastObject }) {
  const type = (toast.type as ToastType) ?? "info";
  const styles = TYPE_STYLES[type] ?? TYPE_STYLES.info;
  const Icon = styles.icon;

  return (
    <Toast.Root
      toast={toast}
      className={`group pointer-events-auto absolute right-0 left-0 flex items-start gap-3 rounded-xl px-4 py-3 shadow-base ring-1 backdrop-blur-sm transition-all ${styles.accent} bottom-[calc(var(--toast-offset-y)+var(--toast-swipe-movement-y))] translate-x-[calc(var(--toast-swipe-movement-x))] data-[expanded]:bottom-[calc(var(--toast-offset-y)+var(--toast-index)*var(--gap))] data-[ending-style]:opacity-0 data-[limited]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-2 data-[starting-style]:translate-y-2 [transition-property:transform,opacity,background,bottom] duration-200`}
      style={
        {
          "--gap": "0.75rem",
          height: "var(--toast-height)",
        } as React.CSSProperties
      }
    >
      <Icon
        size={18}
        className={`mt-0.5 shrink-0 ${styles.iconClass}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        {toast.title ? (
          <Toast.Title className="text-sm font-medium leading-snug text-gray">
            {toast.title}
          </Toast.Title>
        ) : null}
        {toast.description ? (
          <Toast.Description className="mt-0.5 text-xs leading-relaxed text-gray-muted">
            {toast.description}
          </Toast.Description>
        ) : null}
      </div>
      <Toast.Close
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-gray-muted transition-colors hover:bg-gray-hover hover:text-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong"
      >
        <X size={14} />
      </Toast.Close>
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
 * Global toast viewport. Render once near the app root inside a ToastProvider.
 * The viewport is fixed to the bottom-right on desktop, bottom-center on mobile,
 * and respects iOS safe-area insets so it doesn't collide with the input pill.
 */
export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <Toast.Viewport
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] mx-auto flex w-full max-w-sm flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:pb-4"
        style={
          {
            ["--viewport-padding" as string]: "1rem",
          } as React.CSSProperties
        }
      >
        <ToastList />
      </Toast.Viewport>
    </Toast.Provider>
  );
}
