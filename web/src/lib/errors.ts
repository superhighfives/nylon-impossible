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
}> {}

/**
 * Thrown when user is not authorized to access a resource
 */
export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly resource: string;
  readonly userId: string;
}> {}

/**
 * Thrown when AI extraction fails
 */
export class AIExtractionError extends Data.TaggedError("AIExtractionError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Thrown when AI rate limit is exceeded
 */
export class AIRateLimitError extends Data.TaggedError("AIRateLimitError")<{
  readonly message: string;
  readonly retryAfter?: number;
}> {}

/**
 * Thrown when AI request times out
 */
export class AITimeoutError extends Data.TaggedError("AITimeoutError")<{
  readonly message: string;
}> {}
