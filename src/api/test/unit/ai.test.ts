import { describe, expect, it, vi } from "vitest";
import {
  enrichTodo,
  type TodoEnrichment,
  urlMentionedInText,
} from "../../src/lib/ai";

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

    it("detects general research intent for questions", async () => {
      const ai = createMockAi({
        title: "How does OAuth work",
        research: { type: "general" },
      });

      const result = await enrichTodo(ai, "How does OAuth work");
      expect(result).not.toBeNull();
      expect(result!.title).toBe("How does OAuth work");
      expect(result!.research).toEqual({ type: "general" });
    });

    it("detects general research intent for comparisons", async () => {
      const ai = createMockAi({
        title: "Dogs ages vs human ages",
        research: { type: "general" },
      });

      const result = await enrichTodo(ai, "Dogs ages vs human ages");
      expect(result!.research).toEqual({ type: "general" });
    });

    it("detects location research intent for venues", async () => {
      const ai = createMockAi({
        title: "Book dinner at San Jalisco",
        research: { type: "location" },
      });

      const result = await enrichTodo(ai, "Book dinner at San Jalisco");
      expect(result!.research).toEqual({ type: "location" });
    });

    it("does not set research for plain action items", async () => {
      const ai = createMockAi({
        title: "Buy milk",
      });

      const result = await enrichTodo(ai, "Buy milk");
      // No enrichment at all, returns null
      expect(result).toBeNull();
    });

    it("returns research-only enrichment (no URLs, date, or priority)", async () => {
      const ai = createMockAi({
        title: "Best practices for React Server Components",
        research: { type: "general" },
      });

      const result = await enrichTodo(
        ai,
        "Best practices for React Server Components",
      );
      // Research alone is sufficient to return non-null
      expect(result).not.toBeNull();
      expect(result!.research).toEqual({ type: "general" });
      expect(result!.urls).toBeUndefined();
      expect(result!.dueDate).toBeUndefined();
      expect(result!.priority).toBeUndefined();
    });
  });

  describe("hallucinated URL filtering", () => {
    it("drops invented domains for topic-only input", async () => {
      // Simulates the model hallucinating domains from the topic even though
      // no URL was ever mentioned (real-world regression: "Research back pain
      // remedies" → ["backpainremedies.com", "painremedies.com", ...]).
      const ai = createMockAi({
        title: "Research back pain remedies",
        urls: [
          "https://backpainremedies.com",
          "https://painremedies.com",
          "https://remedies.com",
          "https://backpain.com",
        ],
        research: { type: "general" },
      });

      const result = await enrichTodo(ai, "Research back pain remedies");
      expect(result).not.toBeNull();
      // All URLs should be filtered out — none of those hostnames appear
      // in the input text.
      expect(result!.urls).toBeUndefined();
      expect(result!.research).toEqual({ type: "general" });
    });

    it("keeps URLs whose hostname appears in the text", async () => {
      const ai = createMockAi({
        title: "Hello",
        urls: ["https://google.com"],
      });

      const result = await enrichTodo(ai, "Hello google.com");
      expect(result!.urls).toEqual(["https://google.com"]);
    });

    it("keeps some and drops others in a mixed list", async () => {
      const ai = createMockAi({
        title: "Compare with",
        urls: [
          "https://github.com/user/repo",
          "https://comparisonsite.com", // invented
        ],
      });

      const result = await enrichTodo(
        ai,
        "Compare github.com/user/repo with",
      );
      expect(result!.urls).toEqual(["https://github.com/user/repo"]);
    });

    it("accepts www-prefixed hostnames when user typed the bare domain", async () => {
      const ai = createMockAi({
        title: "Check out",
        urls: ["https://www.example.com"],
      });

      const result = await enrichTodo(ai, "Check out example.com");
      expect(result!.urls).toEqual(["https://www.example.com"]);
    });

    it("restores the original title when every URL is filtered out", async () => {
      // The model "cleaned" a fake URL from the title — without restoring
      // the title we'd end up with just "Research" which is worse than
      // the original "Research back pain remedies".
      // Include research so the enrichment is non-null and we can assert
      // on the restored title.
      const ai = createMockAi({
        title: "Research",
        urls: ["https://backpainremedies.com"],
        research: { type: "general" },
      });

      const result = await enrichTodo(ai, "Research back pain remedies");
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Research back pain remedies");
      expect(result!.urls).toBeUndefined();
    });

    it("returns null when only hallucinated URLs were extracted from plain text", async () => {
      // No research, no date, no priority, and all urls filtered — equivalent
      // to the model returning nothing useful.
      const ai = createMockAi({
        title: "Back pain remedies",
        urls: ["https://backpainremedies.com"],
      });

      const result = await enrichTodo(ai, "Back pain remedies");
      expect(result).toBeNull();
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
    it("calls ai.run with correct model (no gateway when gatewayId not provided)", async () => {
      const ai = createMockAi({
        title: "Buy milk",
        urls: ["https://example.com"],
      });

      await enrichTodo(ai, "Buy milk https://example.com");

      expect(ai.run).toHaveBeenCalledWith(
        "@cf/zai-org/glm-4.7-flash",
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
        {},
      );
    });

    it("passes gateway option when gatewayId is provided", async () => {
      const ai = createMockAi({
        title: "Buy milk",
        urls: ["https://example.com"],
      });

      await enrichTodo(ai, "Buy milk https://example.com", "my-gateway");

      expect(ai.run).toHaveBeenCalledWith(
        "@cf/zai-org/glm-4.7-flash",
        expect.any(Object),
        { gateway: { id: "my-gateway" } },
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

describe("urlMentionedInText", () => {
  it("accepts URLs whose hostname appears in text", () => {
    expect(urlMentionedInText("https://google.com", "Hello google.com")).toBe(
      true,
    );
  });

  it("accepts URLs with a path when hostname is in text", () => {
    expect(
      urlMentionedInText(
        "https://github.com/user/repo",
        "Review github.com/user/repo tomorrow",
      ),
    ).toBe(true);
  });

  it("is case insensitive", () => {
    expect(urlMentionedInText("https://GOOGLE.com", "check google.com")).toBe(
      true,
    );
    expect(urlMentionedInText("https://google.com", "Check GOOGLE.COM")).toBe(
      true,
    );
  });

  it("accepts www. URLs when text has bare domain", () => {
    expect(
      urlMentionedInText("https://www.example.com", "see example.com"),
    ).toBe(true);
  });

  it("rejects URLs invented from a topic", () => {
    expect(
      urlMentionedInText(
        "https://backpainremedies.com",
        "Research back pain remedies",
      ),
    ).toBe(false);
  });

  it("rejects partial-word matches as hostnames", () => {
    // "pain.com" is NOT mentioned; the presence of the word "pain" is not
    // sufficient — the full hostname must appear.
    expect(
      urlMentionedInText("https://pain.com", "Research back pain remedies"),
    ).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(urlMentionedInText("not-a-url", "anything")).toBe(false);
  });

  it("rejects dotless hostnames invented from a single word", () => {
    // Some models occasionally emit "https://dogs" for input "Research dogs".
    // The hostname matches a word in the text but isn't a real domain.
    expect(urlMentionedInText("https://dogs", "Research dogs")).toBe(false);
  });
});
