import { Cause } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DatabaseError,
  ForbiddenError,
  ListNotFoundError,
  SystemListImmutableError,
  TodoNotFoundError,
  UnauthorizedError,
  UserNotFoundError,
  ValidationError,
} from "../errors";
import { causeToClientError, ServerFnError } from "../server-errors";

// Sentry.captureException runs against the active request-scoped client, which
// doesn't exist in unit tests — mock it so DatabaseError/unknown/defect paths
// don't throw, and so we can assert what got reported.
const captureException = vi.fn();
vi.mock("@sentry/cloudflare", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

beforeEach(() => {
  captureException.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("causeToClientError", () => {
  it("carries validation messages through to a non-empty client message", () => {
    const err = causeToClientError(
      Cause.fail(
        new ValidationError({
          errors: [
            { path: "listId", message: "No list found" },
            { path: "title", message: "Title is required" },
          ],
        }),
      ),
    );
    expect(err).toBeInstanceOf(ServerFnError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("No list found, Title is required");
    // Expected client error — not reported to Sentry.
    expect(captureException).not.toHaveBeenCalled();
  });

  it("falls back to a generic validation message when none are present", () => {
    const err = causeToClientError(
      Cause.fail(new ValidationError({ errors: [] })),
    );
    expect(err.message).toBe("Validation failed");
    expect(err.status).toBe(400);
  });

  it.each([
    [new UnauthorizedError({}), 401, "Unauthorized"],
    [new UserNotFoundError({ userId: "u1" }), 401, "Unauthorized"],
    [new ForbiddenError({ resource: "todo", userId: "u1" }), 403, "Forbidden"],
    [new TodoNotFoundError({ id: "t1" }), 404, "Not found"],
    [new ListNotFoundError({ id: "l1" }), 404, "Not found"],
    [
      new SystemListImmutableError({ id: "l1" }),
      403,
      "System lists can't be renamed, deleted, or reordered",
    ],
  ])("maps %s to status %i without reporting", (error, status, message) => {
    const err = causeToClientError(Cause.fail(error));
    expect(err.status).toBe(status);
    expect(err.message).toBe(message);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports DatabaseError to Sentry but returns a generic client message", () => {
    const err = causeToClientError(
      Cause.fail(
        new DatabaseError({ operation: "createTodo", cause: new Error("D1") }),
      ),
    );
    expect(err.status).toBe(500);
    expect(err.message).toBe("Something went wrong. Try again.");
    expect(err.message).not.toBe("");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({
          area: "web-server-fn",
          operation: "createTodo",
        }),
      }),
    );
  });

  it("reports an unknown (non-tagged) failure as a generic 500", () => {
    const err = causeToClientError(Cause.fail("weird string failure"));
    expect(err.status).toBe(500);
    expect(err.message).toBe("Something went wrong. Try again.");
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("reports a defect (unmapped throw) as a generic 500 tagged as a defect", () => {
    const boom = new Error("generateKeyBetween: a >= b");
    const err = causeToClientError(Cause.die(boom));
    expect(err.status).toBe(500);
    // The message must never be empty — that was the original bug.
    expect(err.message).toBe("Something went wrong. Try again.");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({
        tags: expect.objectContaining({ kind: "defect" }),
      }),
    );
  });
});
