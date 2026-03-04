import { describe, expect, it } from "vitest";
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

  it("accepts optional description", () => {
    const result = createTodoSchema.safeParse({
      title: "Task",
      description: "Some details",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null description", () => {
    const result = createTodoSchema.safeParse({
      title: "Task",
      description: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional dueDate as Date", () => {
    const result = createTodoSchema.safeParse({
      title: "Task",
      dueDate: new Date("2026-03-15"),
    });
    expect(result.success).toBe(true);
  });

  it("coerces dueDate from string", () => {
    const result = createTodoSchema.safeParse({
      title: "Task",
      dueDate: "2026-03-15",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueDate).toBeInstanceOf(Date);
    }
  });

  it("accepts priority high", () => {
    const result = createTodoSchema.safeParse({
      title: "Task",
      priority: "high",
    });
    expect(result.success).toBe(true);
  });

  it("accepts priority low", () => {
    const result = createTodoSchema.safeParse({
      title: "Task",
      priority: "low",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid priority", () => {
    const result = createTodoSchema.safeParse({
      title: "Task",
      priority: "medium",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null priority", () => {
    const result = createTodoSchema.safeParse({
      title: "Task",
      priority: null,
    });
    expect(result.success).toBe(true);
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

  it("rejects empty title string", () => {
    const result = updateTodoSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("accepts empty object (no updates)", () => {
    const result = updateTodoSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with description", () => {
    const result = updateTodoSchema.safeParse({ description: "Updated desc" });
    expect(result.success).toBe(true);
  });

  it("accepts clearing description with null", () => {
    const result = updateTodoSchema.safeParse({ description: null });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with dueDate", () => {
    const result = updateTodoSchema.safeParse({
      dueDate: new Date("2026-03-20"),
    });
    expect(result.success).toBe(true);
  });

  it("accepts clearing dueDate with null", () => {
    const result = updateTodoSchema.safeParse({ dueDate: null });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with priority", () => {
    const result = updateTodoSchema.safeParse({ priority: "high" });
    expect(result.success).toBe(true);
  });

  it("accepts clearing priority with null", () => {
    const result = updateTodoSchema.safeParse({ priority: null });
    expect(result.success).toBe(true);
  });

  it("accepts full update with all new fields", () => {
    const result = updateTodoSchema.safeParse({
      title: "Updated task",
      description: "New description",
      completed: false,
      dueDate: new Date("2026-04-01"),
      priority: "low",
    });
    expect(result.success).toBe(true);
  });
});
