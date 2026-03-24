import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractTodos } from "../../src/lib/ai";

const TEST_CONFIG = {
  accountId: "test-account",
  gatewayId: "test-gateway",
  token: "test-token",
};

const EXPECTED_URL = `https://gateway.ai.cloudflare.com/v1/${TEST_CONFIG.accountId}/${TEST_CONFIG.gatewayId}/openai/chat/completions`;

/**
 * Creates a mock fetch response with the given tool call arguments.
 */
function mockFetchResponse(args: object | string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  type: "function",
                  function: {
                    name: "extract_todos",
                    arguments:
                      typeof args === "string" ? args : JSON.stringify(args),
                  },
                },
              ],
            },
          },
        ],
      }),
  };
}

describe("extractTodos", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("successful responses", () => {
    it("parses a single todo", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse({ todos: [{ title: "Buy milk" }] }) as Response,
      );

      const result = await extractTodos(TEST_CONFIG, "Buy milk");
      expect(result).toHaveLength(1);
      expect(result![0].title).toBe("Buy milk");
    });

    it("extracts urls from a todo item", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse({
          todos: [
            {
              title: "Review pull request",
              urls: ["https://github.com/user/repo/pull/1"],
            },
          ],
        }) as Response,
      );

      const result = await extractTodos(TEST_CONFIG, "Review PR");
      expect(result![0].urls).toEqual(["https://github.com/user/repo/pull/1"]);
    });

    it("extracts dueDate from a todo item", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse({
          todos: [{ title: "Finish report", dueDate: "2026-03-28" }],
        }) as Response,
      );

      const result = await extractTodos(TEST_CONFIG, "Finish report by Friday");
      expect(result![0].dueDate).toBe("2026-03-28");
    });

    it("returns null when todos array is empty", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse({ todos: [] }) as Response,
      );

      const result = await extractTodos(TEST_CONFIG, "random text");
      expect(result).toBeNull();
    });

    it("maps multiple todos from a single response", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse({
          todos: [
            { title: "Buy milk" },
            { title: "Call mom" },
            { title: "Pick up dry cleaning", dueDate: "2026-03-23" },
          ],
        }) as Response,
      );

      const result = await extractTodos(
        TEST_CONFIG,
        "Buy milk, call mom, pick up dry cleaning tomorrow",
      );
      expect(result).toHaveLength(3);
      expect(result![0].title).toBe("Buy milk");
      expect(result![1].title).toBe("Call mom");
      expect(result![2].dueDate).toBe("2026-03-23");
    });

    it("omits urls property when AI returns empty urls array", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse({
          todos: [{ title: "Task without URL", urls: [] }],
        }) as Response,
      );

      const result = await extractTodos(TEST_CONFIG, "Task without URL");
      expect(result![0].urls).toBeUndefined();
    });

    it("omits dueDate property when AI does not return one", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse({ todos: [{ title: "No date task" }] }) as Response,
      );

      const result = await extractTodos(TEST_CONFIG, "No date task");
      expect(result![0].dueDate).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("throws when fetch returns non-ok status", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      } as Response);

      await expect(extractTodos(TEST_CONFIG, "Buy milk")).rejects.toThrow(
        "AI Gateway request failed: 500",
      );
    });

    it("throws when response has no tool_calls", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "I can help you with that!" } }],
          }),
      } as Response);

      await expect(extractTodos(TEST_CONFIG, "Buy milk")).rejects.toThrow(
        "AI did not return extracted todos",
      );
    });

    it("throws when tool_calls is an empty array", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { tool_calls: [] } }],
          }),
      } as Response);

      await expect(extractTodos(TEST_CONFIG, "Buy milk")).rejects.toThrow(
        "AI did not return extracted todos",
      );
    });

    it("throws when tool call has a wrong name", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      type: "function",
                      function: { name: "wrong_tool", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          }),
      } as Response);

      await expect(extractTodos(TEST_CONFIG, "Buy milk")).rejects.toThrow(
        "Unexpected tool call: wrong_tool",
      );
    });

    it("throws when arguments JSON string is malformed", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse("{ bad json }") as Response,
      );

      await expect(extractTodos(TEST_CONFIG, "Buy milk")).rejects.toThrow(
        "Failed to parse AI response",
      );
    });
  });

  describe("request format", () => {
    it("sends correct request to AI Gateway", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse({ todos: [{ title: "Buy milk" }] }) as Response,
      );

      await extractTodos(TEST_CONFIG, "Buy milk");

      expect(fetch).toHaveBeenCalledWith(EXPECTED_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-aig-authorization": `Bearer ${TEST_CONFIG.token}`,
        },
        body: expect.stringContaining('"model":"dynamic/default"'),
      });
    });

    it("includes user text in messages", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse({ todos: [{ title: "Buy milk" }] }) as Response,
      );

      await extractTodos(TEST_CONFIG, "Buy milk and eggs");

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.messages).toContainEqual({
        role: "user",
        content: "Buy milk and eggs",
      });
    });

    it("includes tools in request body", async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse({ todos: [{ title: "Buy milk" }] }) as Response,
      );

      await extractTodos(TEST_CONFIG, "Buy milk");

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.tools).toBeDefined();
      expect(body.tools[0].function.name).toBe("extract_todos");
      expect(body.tool_choice).toEqual({
        type: "function",
        function: { name: "extract_todos" },
      });
    });
  });
});
