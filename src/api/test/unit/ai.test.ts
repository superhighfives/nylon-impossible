import { describe, expect, it, vi } from "vitest";
import { extractTodos } from "../../src/lib/ai";

/**
 * Creates a mock AI binding that returns the given tool call response.
 * Workers AI returns tool_calls directly with arguments already parsed.
 */
function createMockAi(
  toolCallArgs:
    | { todos: Array<{ title: string; urls?: string[]; dueDate?: string }> }
    | Error,
) {
  const run = vi.fn().mockImplementation(async () => {
    if (toolCallArgs instanceof Error) {
      throw toolCallArgs;
    }
    return {
      response: null,
      tool_calls: [
        {
          name: "extract_todos",
          arguments: toolCallArgs,
        },
      ],
    };
  });

  return { run } as unknown as Ai;
}

/**
 * Creates a mock AI binding that returns a custom response structure.
 */
function createMockAiWithResponse(response: object) {
  const run = vi.fn().mockResolvedValue(response);
  return { run } as unknown as Ai;
}

describe("extractTodos", () => {
  describe("successful responses", () => {
    it("parses a single todo", async () => {
      const ai = createMockAi({ todos: [{ title: "Buy milk" }] });

      const result = await extractTodos(ai, "Buy milk");
      expect(result).toHaveLength(1);
      expect(result![0].title).toBe("Buy milk");
    });

    it("extracts urls from a todo item", async () => {
      const ai = createMockAi({
        todos: [
          {
            title: "Review pull request",
            urls: ["https://github.com/user/repo/pull/1"],
          },
        ],
      });

      const result = await extractTodos(ai, "Review PR");
      expect(result![0].urls).toEqual(["https://github.com/user/repo/pull/1"]);
    });

    it("extracts dueDate from a todo item", async () => {
      const ai = createMockAi({
        todos: [{ title: "Finish report", dueDate: "2026-03-28" }],
      });

      const result = await extractTodos(ai, "Finish report by Friday");
      expect(result![0].dueDate).toBe("2026-03-28");
    });

    it("returns null when todos array is empty", async () => {
      const ai = createMockAi({ todos: [] });

      const result = await extractTodos(ai, "random text");
      expect(result).toBeNull();
    });

    it("maps multiple todos from a single response", async () => {
      const ai = createMockAi({
        todos: [
          { title: "Buy milk" },
          { title: "Call mom" },
          { title: "Pick up dry cleaning", dueDate: "2026-03-23" },
        ],
      });

      const result = await extractTodos(
        ai,
        "Buy milk, call mom, pick up dry cleaning tomorrow",
      );
      expect(result).toHaveLength(3);
      expect(result![0].title).toBe("Buy milk");
      expect(result![1].title).toBe("Call mom");
      expect(result![2].dueDate).toBe("2026-03-23");
    });

    it("omits urls property when AI returns empty urls array", async () => {
      const ai = createMockAi({
        todos: [{ title: "Task without URL", urls: [] }],
      });

      const result = await extractTodos(ai, "Task without URL");
      expect(result![0].urls).toBeUndefined();
    });

    it("omits dueDate property when AI does not return one", async () => {
      const ai = createMockAi({ todos: [{ title: "No date task" }] });

      const result = await extractTodos(ai, "No date task");
      expect(result![0].dueDate).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("throws when response has no tool_calls", async () => {
      const ai = createMockAiWithResponse({
        response: "I can help you with that!",
      });

      await expect(extractTodos(ai, "Buy milk")).rejects.toThrow(
        "AI did not return extracted todos",
      );
    });

    it("throws when tool_calls is an empty array", async () => {
      const ai = createMockAiWithResponse({
        response: null,
        tool_calls: [],
      });

      await expect(extractTodos(ai, "Buy milk")).rejects.toThrow(
        "AI did not return extracted todos",
      );
    });

    it("throws when tool call has a wrong name", async () => {
      const ai = createMockAiWithResponse({
        response: null,
        tool_calls: [
          {
            name: "wrong_tool",
            arguments: {},
          },
        ],
      });

      await expect(extractTodos(ai, "Buy milk")).rejects.toThrow(
        "Unexpected tool call: wrong_tool",
      );
    });
  });

  describe("request format", () => {
    it("calls ai.run with correct model and gateway", async () => {
      const ai = createMockAi({ todos: [{ title: "Buy milk" }] });

      await extractTodos(ai, "Buy milk");

      expect(ai.run).toHaveBeenCalledWith(
        "@cf/moonshotai/kimi-k2.5",
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "user", content: "Buy milk" }),
          ]),
          tools: expect.any(Array),
          tool_choice: expect.objectContaining({
            type: "function",
            function: { name: "extract_todos" },
          }),
        }),
        expect.objectContaining({
          gateway: { id: "nylon-impossible" },
        }),
      );
    });

    it("includes system prompt in messages", async () => {
      const ai = createMockAi({ todos: [{ title: "Buy milk" }] });

      await extractTodos(ai, "Buy milk");

      const call = (ai.run as ReturnType<typeof vi.fn>).mock.calls[0];
      const inputs = call[1];
      expect(inputs.messages[0].role).toBe("system");
      expect(inputs.messages[0].content).toContain(
        "extracts actionable todo items",
      );
    });
  });
});
