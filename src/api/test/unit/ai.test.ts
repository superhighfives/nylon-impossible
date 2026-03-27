import { describe, expect, it, vi } from "vitest";
import { enrichTodo, type TodoEnrichment } from "../../src/lib/ai";

/**
 * Creates a mock AI binding that returns the given tool call response.
 * Workers AI returns tool_calls directly with arguments already parsed.
 */
function createMockAi(toolCallArgs: TodoEnrichment | Error) {
  const run = vi.fn().mockImplementation(async () => {
    if (toolCallArgs instanceof Error) {
      throw toolCallArgs;
    }
    return {
      response: null,
      tool_calls: [
        {
          name: "enrich_todo",
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

describe("enrichTodo", () => {
  describe("successful responses", () => {
    it("returns title unchanged when no enrichment needed", async () => {
      const ai = createMockAi({ title: "Buy milk" });

      const result = await enrichTodo(ai, "Buy milk");
      // No enrichment (same title, no urls/date/priority) returns null
      expect(result).toBeNull();
    });

    it("extracts urls and removes them from title", async () => {
      const ai = createMockAi({
        title: "Check this out",
        urls: ["https://example.com"],
      });

      const result = await enrichTodo(ai, "Check this out https://example.com");
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Check this out");
      expect(result!.urls).toEqual(["https://example.com"]);
    });

    it("extracts bare domains with https prefix", async () => {
      const ai = createMockAi({
        title: "Hello",
        urls: ["https://google.com"],
      });

      const result = await enrichTodo(ai, "Hello google.com");
      expect(result!.title).toBe("Hello");
      expect(result!.urls).toEqual(["https://google.com"]);
    });

    it("extracts dueDate from natural language", async () => {
      const ai = createMockAi({
        title: "Finish report",
        dueDate: "2026-03-28",
      });

      const result = await enrichTodo(ai, "Finish report tomorrow");
      expect(result!.dueDate).toBe("2026-03-28");
    });

    it("extracts high priority", async () => {
      const ai = createMockAi({
        title: "Urgent: call mom",
        priority: "high",
      });

      const result = await enrichTodo(ai, "Urgent: call mom");
      expect(result!.priority).toBe("high");
    });

    it("extracts low priority", async () => {
      const ai = createMockAi({
        title: "Low priority fix the bug",
        priority: "low",
      });

      const result = await enrichTodo(ai, "Low priority fix the bug");
      expect(result!.priority).toBe("low");
    });

    it("extracts multiple metadata fields at once", async () => {
      const ai = createMockAi({
        title: "Review this tomorrow",
        urls: ["https://github.com/user/repo/pull/1"],
        dueDate: "2026-03-28",
        priority: "high",
      });

      const result = await enrichTodo(
        ai,
        "Review https://github.com/user/repo/pull/1 tomorrow urgent",
      );
      expect(result!.title).toBe("Review this tomorrow");
      expect(result!.urls).toEqual(["https://github.com/user/repo/pull/1"]);
      expect(result!.dueDate).toBe("2026-03-28");
      expect(result!.priority).toBe("high");
    });
  });

  describe("error handling", () => {
    it("throws when response has no tool_calls", async () => {
      const ai = createMockAiWithResponse({
        response: "I can help you with that!",
      });

      await expect(enrichTodo(ai, "Buy milk")).rejects.toThrow(
        "AI did not return enrichment",
      );
    });

    it("throws when tool_calls is an empty array", async () => {
      const ai = createMockAiWithResponse({
        response: null,
        tool_calls: [],
      });

      await expect(enrichTodo(ai, "Buy milk")).rejects.toThrow(
        "AI did not return enrichment",
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

      await expect(enrichTodo(ai, "Buy milk")).rejects.toThrow(
        "Unexpected tool call: wrong_tool",
      );
    });
  });

  describe("request format", () => {
    it("calls ai.run with correct model and gateway", async () => {
      const ai = createMockAi({
        title: "Buy milk",
        urls: ["https://example.com"],
      });

      await enrichTodo(ai, "Buy milk https://example.com");

      expect(ai.run).toHaveBeenCalledWith(
        "@cf/moonshotai/kimi-k2.5",
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: "Buy milk https://example.com",
            }),
          ]),
          tools: expect.any(Array),
          tool_choice: expect.objectContaining({
            type: "function",
            function: { name: "enrich_todo" },
          }),
        }),
        expect.objectContaining({
          gateway: { id: "nylon-impossible" },
        }),
      );
    });

    it("includes system prompt in messages", async () => {
      const ai = createMockAi({
        title: "Buy milk",
        urls: ["https://example.com"],
      });

      await enrichTodo(ai, "Buy milk https://example.com");

      const call = (ai.run as ReturnType<typeof vi.fn>).mock.calls[0];
      const inputs = call[1];
      expect(inputs.messages[0].role).toBe("system");
      expect(inputs.messages[0].content).toContain("metadata extractor");
    });
  });
});
