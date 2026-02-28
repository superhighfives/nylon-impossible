import { describe, expect, it } from "vitest";
import {
  DatabaseError,
  ForbiddenError,
  TodoNotFoundError,
  UnauthorizedError,
  UserNotFoundError,
  ValidationError,
} from "../errors";

describe("Tagged errors", () => {
  it("UnauthorizedError has correct _tag", () => {
    const error = new UnauthorizedError({ message: "Not logged in" });
    expect(error._tag).toBe("UnauthorizedError");
    expect(error.message).toBe("Not logged in");
  });

  it("UserNotFoundError stores userId", () => {
    const error = new UserNotFoundError({ userId: "user_123" });
    expect(error._tag).toBe("UserNotFoundError");
    expect(error.userId).toBe("user_123");
  });

  it("DatabaseError stores operation and cause", () => {
    const cause = new Error("connection failed");
    const error = new DatabaseError({ operation: "insert", cause });
    expect(error._tag).toBe("DatabaseError");
    expect(error.operation).toBe("insert");
    expect(error.cause).toBe(cause);
  });

  it("TodoNotFoundError stores id", () => {
    const error = new TodoNotFoundError({ id: "todo_456" });
    expect(error._tag).toBe("TodoNotFoundError");
    expect(error.id).toBe("todo_456");
  });

  it("ValidationError stores errors array", () => {
    const errors = [{ path: "title", message: "Required" }];
    const error = new ValidationError({ errors });
    expect(error._tag).toBe("ValidationError");
    expect(error.errors).toEqual(errors);
  });

  it("ForbiddenError stores resource and userId", () => {
    const error = new ForbiddenError({
      resource: "todo",
      userId: "user_789",
    });
    expect(error._tag).toBe("ForbiddenError");
    expect(error.resource).toBe("todo");
    expect(error.userId).toBe("user_789");
  });
});
