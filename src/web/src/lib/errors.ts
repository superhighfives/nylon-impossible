import { Data } from "effect";

/**
 * Tagged error types for type-safe error handling with Effect
 *
 * Each error type is tracked in the Effect type signature, making
 * all possible failures explicit and compile-time checked.
 */

/**
 * Thrown when user is not authenticated
 */
export class UnauthorizedError extends Data.TaggedError("UnauthorizedError")<{
  readonly message?: string;
}> {}

/**
 * Thrown when a user is not found in Clerk
 */
export class UserNotFoundError extends Data.TaggedError("UserNotFoundError")<{
  readonly userId: string;
}> {}

/**
 * Thrown when database operations fail
 */
export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

/**
 * Thrown when a todo is not found
 */
export class TodoNotFoundError extends Data.TaggedError("TodoNotFoundError")<{
  readonly id: string;
}> {}

/**
 * Thrown when validation fails
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly errors: Array<{ path: string; message: string }>;
}> {
  // Server-fn `.validator()`s throw this synchronously, before the handler's
  // `causeToClientError` mapping runs — so the raw error is what TanStack
  // serializes to the client. Without this, `.message` is "" and the client
  // shows `Error: No error message`.
  override get message(): string {
    return (
      this.errors
        .map((e) => e.message)
        .filter(Boolean)
        .join(", ") || "Validation failed"
    );
  }
}

/**
 * Thrown when user is not authorized to access a resource
 */
export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly resource: string;
  readonly userId: string;
}> {}

/**
 * Thrown when a list is not found
 */
export class ListNotFoundError extends Data.TaggedError("ListNotFoundError")<{
  readonly id: string;
}> {}

/**
 * Thrown when an operation tries to rename, delete, or reorder a system list
 * (Today/This Week/Sometime), which is immutable from the client.
 */
export class SystemListImmutableError extends Data.TaggedError(
  "SystemListImmutableError",
)<{
  readonly id: string;
}> {}
