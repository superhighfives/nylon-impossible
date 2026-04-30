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
      className={`group pointer-events-auto absolute right-0 bottom-0 left-auto w-full origin-bottom rounded-xl px-4 py-3 shadow-base ring-1 backdrop-blur-sm ${styles.accent} z-[calc(1000-var(--toast-index))] [--gap:0.75rem] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] h-(--height) data-expanded:h-(--toast-height) transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-starting-style:transform-[translateY(150%)] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:transform-[translateY(150%)] data-ending-style:opacity-0 data-limited:opacity-0 data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))] data-expanded:data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))] data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))] data-expanded:data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))] after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-[''] [transition:transform_0.5s_cubic-bezier(0.22,1,0.36,1),opacity_0.5s,height_0.15s]`}
    >
      <Toast.Content className="flex items-start gap-3 overflow-hidden transition-opacity duration-250 data-behind:pointer-events-none data-behind:opacity-0 data-expanded:pointer-events-auto data-expanded:opacity-100">
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
