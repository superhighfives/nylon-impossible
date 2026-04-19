import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod/v4";

/**
 * Catalog of user-facing API errors. Each entry is a tuple of (status, message)
 * keyed by a stable machine-readable code. Handlers reach for `apiError(c, code)`
 * instead of hard-coding strings so copy stays consistent and tests assert on a
 * single source of truth.
 */
export const API_ERRORS = {
  unauthorized: { status: 401, message: "Unauthorized" },
  websocket_upgrade_required: {
    status: 400,
    message: "Expected WebSocket upgrade",
  },
  todo_id_required: { status: 400, message: "Todo ID required" },
  todo_not_found: { status: 404, message: "Todo not found" },
  user_not_found: { status: 404, message: "User not found" },
  invalid_json: { status: 400, message: "Invalid JSON body" },
  text_required: { status: 400, message: "Text is required" },
  no_valid_fields: { status: 400, message: "No valid fields to update" },
  validation_failed: { status: 400, message: "Request validation failed" },
} as const satisfies Record<string, { status: number; message: string }>;

export type ApiErrorCode = keyof typeof API_ERRORS;

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  details?: unknown;
}

/**
 * Respond with a structured error envelope. The `error` field carries the
 * human-readable message (kept as-is for backwards compatibility) while `code`
 * is a stable slug clients can switch on.
 */
export function apiError(
  c: Context,
  code: ApiErrorCode,
  detail?: { message?: string; details?: unknown },
) {
  const entry = API_ERRORS[code];
  const body: ApiErrorBody = {
    error: detail?.message ?? entry.message,
    code,
  };
  if (detail?.details !== undefined) {
    body.details = detail.details;
  }
  return c.json(body, entry.status as ContentfulStatusCode);
}

/**
 * Respond with `validation_failed`, attaching the Zod issue list under
 * `details` so clients can surface field-specific errors if they care.
 */
export function apiValidationError(c: Context, error: z.ZodError) {
  return apiError(c, "validation_failed", {
    message: error.issues[0]?.message ?? API_ERRORS.validation_failed.message,
    details: error.issues,
  });
}
