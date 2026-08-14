import * as Sentry from "@sentry/cloudflare";
import { Cause, Option } from "effect";

/**
 * Client-facing error thrown out of a server function.
 *
 * Its whole point is a non-empty `.message`. TanStack Start serializes a thrown
 * Error's message to the client (via seroval's ShallowErrorPlugin), so failing
 * with a bare `Response` — which has no `.message` — surfaces on the client as
 * `Error: No error message` and tells Sentry nothing. `status` is carried for
 * context/debugging; it's dropped by the shallow serializer, which is fine
 * because no client code reads it off these errors (they only feed
 * `messageFromError` toasts and `Sentry.captureException`).
 */
export class ServerFnError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ServerFnError";
    this.status = status;
  }
}

/** Map a known tagged domain error to the client-facing ServerFnError. */
const taggedErrorToClientError = (error: {
  readonly _tag: string;
  readonly [k: string]: unknown;
}): ServerFnError => {
  switch (error._tag) {
    case "UnauthorizedError":
    case "UserNotFoundError":
      return new ServerFnError("Unauthorized", 401);

    case "ForbiddenError":
      return new ServerFnError("Forbidden", 403);

    case "TodoNotFoundError":
    case "ListNotFoundError":
      return new ServerFnError("Not found", 404);

    case "SystemListImmutableError":
      return new ServerFnError(
        "System lists can't be renamed, deleted, or reordered",
        403,
      );

    case "ValidationError": {
      // Validation messages are user-facing (they already went out in the old
      // Response body) — surface them so the toast/Sentry say what was wrong.
      const errors = Array.isArray(error.errors)
        ? (error.errors as Array<{ message?: string }>)
        : [];
      const message =
        errors
          .map((e) => e.message)
          .filter((m): m is string => Boolean(m))
          .join(", ") || "Validation failed";
      return new ServerFnError(message, 400);
    }

    case "DatabaseError":
      console.error("Database error:", error);
      // Server fault (5xx) — report it with the operation. Auth/validation/
      // not-found above are expected client errors and deliberately aren't sent
      // to Sentry. This is the funnel that previously swallowed the D1
      // bound-param overflow. The real cause stays in this Sentry event; the
      // client only gets a generic-but-non-empty message (no DB internals).
      Sentry.captureException(error, {
        tags: {
          area: "web-server-fn",
          operation:
            typeof error.operation === "string" ? error.operation : "unknown",
        },
      });
      return new ServerFnError("Something went wrong. Try again.", 500);

    default:
      console.error("Unknown tagged error:", error);
      Sentry.captureException(error, { tags: { area: "web-server-fn" } });
      return new ServerFnError("Something went wrong. Try again.", 500);
  }
};

/**
 * Translate an Effect failure cause into the Error thrown out of the server
 * function. Handles both expected failures (tagged domain errors) and defects
 * — an unmapped synchronous throw deep in a library (e.g. `generateKeyBetween`)
 * used to bypass error handling entirely and surface as an opaque, messageless
 * 500. Defects are captured and reported; the client gets a generic message.
 */
export const causeToClientError = (
  cause: Cause.Cause<unknown>,
): ServerFnError => {
  const failure = Cause.failureOption(cause);
  if (Option.isSome(failure)) {
    const error = failure.value;
    if (typeof error === "object" && error !== null && "_tag" in error) {
      return taggedErrorToClientError(
        error as { readonly _tag: string; readonly [k: string]: unknown },
      );
    }
    console.error("Unknown server error:", error);
    Sentry.captureException(error, { tags: { area: "web-server-fn" } });
    return new ServerFnError("Something went wrong. Try again.", 500);
  }

  // Defect (die) or interrupt: capture the raw cause and return a generic 500.
  const defect = Cause.dieOption(cause);
  const captured = Option.isSome(defect) ? defect.value : Cause.squash(cause);
  console.error("Server defect:", captured);
  Sentry.captureException(captured, {
    tags: { area: "web-server-fn", kind: "defect" },
  });
  return new ServerFnError("Something went wrong. Try again.", 500);
};
