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

/**
 * An API response that wasn't ok, carrying the envelope's `code` so a toast
 * can tell a message written for people from a generic failure.
 */
export class ApiError extends Error {
  readonly code: string | undefined;
  readonly status: number;
  constructor(message: string, code: string | undefined, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/** Read the API's `{ error, code }` envelope off a failed response. */
export async function apiErrorFrom(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => undefined);
  const envelope =
    typeof body === "object" && body !== null
      ? (body as { error?: unknown; code?: unknown })
      : {};
  const message =
    typeof envelope.error === "string" && envelope.error
      ? envelope.error
      : `Request failed (${response.status})`;
  const code = typeof envelope.code === "string" ? envelope.code : undefined;
  return new ApiError(message, code, response.status);
}

/**
 * API errors whose message tells you what to do, so the toast shows it in
 * place of the action's own sentence.
 */
const SAYS_WHAT_TO_DO = new Set(["invalid_url", "rate_limited"]);

/**
 * The toast for a failed action: its settled sentence ("Couldn’t add the
 * link"), as the apps say it, not the server's or browser's message ("Request
 * failed (500)", "Failed to fetch"). The exception is an API error written
 * for people that says what to do (`invalid_url`, `rate_limited`).
 */
export function messageFromError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.code && SAYS_WHAT_TO_DO.has(err.code)) {
    return err.message;
  }
  return fallback;
}
