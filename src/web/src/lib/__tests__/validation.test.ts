import { describe, it, expect } from "vitest";
import { createTodoSchema, updateTodoSchema } from "../validation";

describe("createTodoSchema", () => {
  it("accepts a valid title", () => {
    const result = createTodoSchema.safeParse({ title: "Buy milk" });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = createTodoSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects title over 500 characters", () => {
    const result = createTodoSchema.safeParse({ title: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts title at exactly 500 characters", () => {
    const result = createTodoSchema.safeParse({ title: "a".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("accepts optional dueDate as ISO string", () => {
    const result = createTodoSchema.safeParse({
      title: "Task",
      dueDate: "2025-12-31",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueDate).toBeInstanceOf(Date);
    }
  });

  it("works without dueDate", () => {
    const result = createTodoSchema.safeParse({ title: "No date" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueDate).toBeUndefined();
    }
  });
});

describe("updateTodoSchema", () => {
  it("accepts partial update with title only", () => {
    const result = updateTodoSchema.safeParse({ title: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with completed only", () => {
    const result = updateTodoSchema.safeParse({ completed: true });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with position only", () => {
    const result = updateTodoSchema.safeParse({ position: "a1" });
    expect(result.success).toBe(true);
  });

  it("accepts dueDate as null (clearing)", () => {
    const result = updateTodoSchema.safeParse({ dueDate: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueDate).toBeNull();
    }
  });

  it("rejects empty title string", () => {
    const result = updateTodoSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("accepts empty object (no updates)", () => {
    const result = updateTodoSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
