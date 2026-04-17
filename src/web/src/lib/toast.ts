import type { ToastManagerAddOptions } from "@base-ui/react/toast";
import { Toast } from "@base-ui/react/toast";

export type ToastType = "success" | "error" | "info";

interface ToastData {
  type: ToastType;
}

export const toastManager = Toast.createToastManager<ToastData>();

type AddOptions = Omit<ToastManagerAddOptions<ToastData>, "type" | "data">;

function add(type: ToastType, message: string, options?: AddOptions) {
  return toastManager.add({
    title: message,
    type,
    data: { type },
    ...options,
  });
}

export const toast = {
  success: (message: string, options?: AddOptions) =>
    add("success", message, options),
  error: (message: string, options?: AddOptions) =>
    add("error", message, { priority: "high", ...options }),
  info: (message: string, options?: AddOptions) =>
    add("info", message, options),
  dismiss: (id?: string) => toastManager.close(id),
};

export function messageFromError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
