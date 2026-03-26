import { vi } from "vitest";
import type { AIGatewayConfig } from "../../src/lib/ai";

/**
 * Mock for src/lib/ai.ts - provides deterministic AI responses for testing.
 *
 * Usage in tests:
 *   import { mockExtractTodos, resetAIMock } from "../__mocks__/ai";
 *
 *   beforeEach(() => resetAIMock());
 *
 *   it("handles AI extraction", async () => {
 *     mockExtractTodos([{ title: "Buy milk" }]);
 *     // ... test code
 *   });
 */

export interface MockTodo {
  title: string;
  urls?: string[];
  dueDate?: string;
}

// The actual mock function that will replace extractTodos
export const extractTodos = vi.fn<
  [config: AIGatewayConfig, text: string],
  Promise<MockTodo[] | null>
>();

// Re-export the real isAIGatewayConfigured function
export { isAIGatewayConfigured } from "../../src/lib/ai";

/**
 * Configure the mock to return specific todos.
 * Call this before making a request that triggers AI extraction.
 */
export function mockExtractTodos(todos: MockTodo[]): void {
  extractTodos.mockResolvedValueOnce(todos);
}

/**
 * Configure the mock to return null (AI found no todos).
 * Handler should fall back to single todo creation.
 */
export function mockExtractTodosEmpty(): void {
  extractTodos.mockResolvedValueOnce(null);
}

/**
 * Configure the mock to throw an error.
 * Handler should fall back to single todo creation.
 */
export function mockExtractTodosError(
  error: Error = new Error("AI unavailable"),
): void {
  extractTodos.mockRejectedValueOnce(error);
}

/**
 * Reset all mock state. Call in beforeEach to ensure clean state.
 */
export function resetAIMock(): void {
  extractTodos.mockReset();
  // Default: return null (fall back to single todo)
  extractTodos.mockResolvedValue(null);
}
