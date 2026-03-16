import { vi } from "vitest";

export interface MockAIToolCall {
  name: string;
  arguments: string | Record<string, unknown>;
}

export interface MockAIResponse {
  tool_calls?: MockAIToolCall[];
}

export interface ExtractedTodo {
  title: string;
  urls?: string[];
  dueDate?: string;
}

/**
 * Mock AI binding for testing smart create without real AI calls.
 * Use the helper functions below to set up responses for specific test cases.
 */
export const mockAI = {
  run: vi.fn<
    [string, Record<string, unknown>, Record<string, unknown>?],
    Promise<MockAIResponse>
  >(),
};

/**
 * Configure the mock to return extracted todos.
 * Call this before making a request that will trigger AI extraction.
 */
export function mockAIExtraction(todos: ExtractedTodo[]): void {
  mockAI.run.mockResolvedValueOnce({
    tool_calls: [
      {
        name: "extract_todos",
        arguments: { todos },
      },
    ],
  });
}

/**
 * Configure the mock to simulate AI failure.
 * The smart create handler should fall back to creating a single todo.
 */
export function mockAIFailure(
  error: Error = new Error("AI unavailable"),
): void {
  mockAI.run.mockRejectedValueOnce(error);
}

/**
 * Configure the mock to return an empty todos array.
 * The smart create handler should fall back to creating a single todo.
 */
export function mockAIEmpty(): void {
  mockAI.run.mockResolvedValueOnce({
    tool_calls: [
      {
        name: "extract_todos",
        arguments: { todos: [] },
      },
    ],
  });
}

/**
 * Configure the mock to return a response with no tool calls.
 * This simulates the AI not following instructions properly.
 */
export function mockAINoToolCall(): void {
  mockAI.run.mockResolvedValueOnce({});
}

/**
 * Reset all mock state. Call in beforeEach to ensure clean state.
 */
export function resetAIMock(): void {
  mockAI.run.mockReset();
}
