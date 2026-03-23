import { describe, expect, it, vi } from "vitest";
import { extractTodos } from "../../src/lib/ai";

/**
 * Creates a minimal mock of the Cloudflare Workers AI binding.
 * The mock returns the provided response from ai.run().
 */
function makeMockAi(response: object): Ai {
  return { run: vi.fn().mockResolvedValue(response) } as unknown as Ai;
}

const GATEWAY_ID = "test-gateway";

describe("extractTodos", () => {
  describe("Workers AI native format (top-level tool_calls)", () => {
    it("parses a single todo from JSON string arguments", async () => {
      const ai = makeMockAi({
        tool_calls: [
          {
            name: "extract_todos",
            arguments: JSON.stringify({ todos: [{ title: "Buy milk" }] }),
          },
        ],
      });

      const result = await extractTodos(ai, GATEWAY_ID, "Buy milk");
      expect(result).toHaveLength(1);
      expect(result![0].title).toBe("Buy milk");
    });

    it("parses arguments when they are already an object (not a string)", async () => {
      const ai = makeMockAi({
        tool_calls: [
          {
            name: "extract_todos",
            arguments: { todos: [{ title: "Call mom" }] },
          },
        ],
      });

      const result = await extractTodos(ai, GATEWAY_ID, "Call mom");
      expect(result).toHaveLength(1);
      expect(result![0].title).toBe("Call mom");
    });

    it("extracts urls from a todo item", async () => {
      const ai = makeMockAi({
        tool_calls: [
          {
            name: "extract_todos",
            arguments: {
              todos: [
                {
                  title: "Review pull request",
                  urls: ["https://github.com/user/repo/pull/1"],
                },
              ],
            },
          },
        ],
      });

      const result = await extractTodos(ai, GATEWAY_ID, "Review PR");
      expect(result![0].urls).toEqual(["https://github.com/user/repo/pull/1"]);
    });

    it("extracts dueDate from a todo item", async () => {
      const ai = makeMockAi({
        tool_calls: [
          {
            name: "extract_todos",
            arguments: {
              todos: [{ title: "Finish report", dueDate: "2026-03-28" }],
            },
          },
        ],
      });

      const result = await extractTodos(
        ai,
        GATEWAY_ID,
        "Finish report by Friday",
      );
      expect(result![0].dueDate).toBe("2026-03-28");
    });

    it("returns null when todos array is empty", async () => {
      const ai = makeMockAi({
        tool_calls: [
          { name: "extract_todos", arguments: { todos: [] } },
        ],
      });

      const result = await extractTodos(ai, GATEWAY_ID, "random text");
      expect(result).toBeNull();
    });

    it("maps multiple todos from a single response", async () => {
      const ai = makeMockAi({
        tool_calls: [
          {
            name: "extract_todos",
            arguments: {
              todos: [
                { title: "Buy milk" },
                { title: "Call mom" },
                { title: "Pick up dry cleaning", dueDate: "2026-03-23" },
              ],
            },
          },
        ],
      });

      const result = await extractTodos(
        ai,
        GATEWAY_ID,
        "Buy milk, call mom, pick up dry cleaning tomorrow",
      );
      expect(result).toHaveLength(3);
      expect(result![0].title).toBe("Buy milk");
      expect(result![1].title).toBe("Call mom");
      expect(result![2].dueDate).toBe("2026-03-23");
    });

    it("omits urls property when AI returns empty urls array", async () => {
      const ai = makeMockAi({
        tool_calls: [
          {
            name: "extract_todos",
            arguments: { todos: [{ title: "Task without URL", urls: [] }] },
          },
        ],
      });

      const result = await extractTodos(ai, GATEWAY_ID, "Task without URL");
      expect(result![0].urls).toBeUndefined();
    });

    it("omits dueDate property when AI does not return one", async () => {
      const ai = makeMockAi({
        tool_calls: [
          {
            name: "extract_todos",
            arguments: { todos: [{ title: "No date task" }] },
          },
        ],
      });

      const result = await extractTodos(ai, GATEWAY_ID, "No date task");
      expect(result![0].dueDate).toBeUndefined();
    });
  });

  describe("OpenAI-compatible format (choices[0].message.tool_calls)", () => {
    it("parses todos from choices format with JSON string arguments", async () => {
      const ai = makeMockAi({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  type: "function",
                  function: {
                    name: "extract_todos",
                    arguments: JSON.stringify({
                      todos: [{ title: "Buy milk" }],
                    }),
                  },
                },
              ],
            },
          },
        ],
      });

      const result = await extractTodos(ai, GATEWAY_ID, "Buy milk");
      expect(result).toHaveLength(1);
      expect(result![0].title).toBe("Buy milk");
    });

    it("ignores choices format when tool type is not 'function'", async () => {
      const ai = makeMockAi({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  type: "retrieval",
                  function: {
                    name: "extract_todos",
                    arguments: JSON.stringify({ todos: [{ title: "Buy milk" }] }),
                  },
                },
              ],
            },
          },
        ],
      });

      await expect(extractTodos(ai, GATEWAY_ID, "Buy milk")).rejects.toThrow(
        "AI did not return extracted todos",
      );
    });
  });

  describe("error handling", () => {
    it("throws when the response has no tool_calls and no choices", async () => {
      const ai = makeMockAi({ response: "I can help you with that!" });

      await expect(extractTodos(ai, GATEWAY_ID, "Buy milk")).rejects.toThrow(
        "AI did not return extracted todos",
      );
    });

    it("throws when tool_calls is an empty array", async () => {
      const ai = makeMockAi({ tool_calls: [] });

      await expect(extractTodos(ai, GATEWAY_ID, "Buy milk")).rejects.toThrow(
        "AI did not return extracted todos",
      );
    });

    it("throws when tool call has a wrong name", async () => {
      const ai = makeMockAi({
        tool_calls: [{ name: "wrong_tool", arguments: "{}" }],
      });

      await expect(extractTodos(ai, GATEWAY_ID, "Buy milk")).rejects.toThrow(
        "Unexpected tool call: wrong_tool",
      );
    });

    it("throws when arguments JSON string is malformed", async () => {
      const ai = makeMockAi({
        tool_calls: [{ name: "extract_todos", arguments: "{ bad json }" }],
      });

      await expect(extractTodos(ai, GATEWAY_ID, "Buy milk")).rejects.toThrow(
        "Failed to parse AI response",
      );
    });

    it("passes the gateway id to the AI binding", async () => {
      const mockRun = vi.fn().mockResolvedValue({
        tool_calls: [
          {
            name: "extract_todos",
            arguments: { todos: [{ title: "Buy milk" }] },
          },
        ],
      });
      const ai = { run: mockRun } as unknown as Ai;

      await extractTodos(ai, "my-gateway", "Buy milk");

      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          gateway: expect.objectContaining({ id: "my-gateway" }),
        }),
      );
    });
  });
});
