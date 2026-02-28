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
});
