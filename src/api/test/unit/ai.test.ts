import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractTodos } from "../../src/lib/ai";

/**
 * Creates a mock AI binding that returns the given tool call arguments.
 */
function createMockAi(responseOrError: object | string | Error) {
  const run = vi.fn().mockImplementation(async () => {
    if (responseOrError instanceof Error) {
      throw responseOrError;
    }

    const args = responseOrError;
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
      text: () => Promise.resolve(""),
    } as Response;
  });

  const gateway = vi.fn().mockReturnValue({ run });

  return { gateway, run } as unknown as Ai;
}

/**
 * Creates a mock AI binding that returns a custom response structure.
 */
function createMockAiWithResponse(response: object, ok = true, status = 200) {
  const run = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  } as Response);

  const gateway = vi.fn().mockReturnValue({ run });

  return { gateway, run } as unknown as Ai;
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
    it("throws when gateway returns non-ok status", async () => {
      const run = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      } as Response);

      const gateway = vi.fn().mockReturnValue({ run });
      const ai = { gateway, run } as unknown as Ai;

      await expect(extractTodos(ai, "Buy milk")).rejects.toThrow(
        "AI Gateway request failed: 500",
      );
    });

    it("throws when response has no tool_calls", async () => {
      const ai = createMockAiWithResponse({
        choices: [{ message: { content: "I can help you with that!" } }],
      });

      await expect(extractTodos(ai, "Buy milk")).rejects.toThrow(
        "AI did not return extracted todos",
      );
    });

    it("throws when tool_calls is an empty array", async () => {
      const ai = createMockAiWithResponse({
        choices: [{ message: { tool_calls: [] } }],
      });

      await expect(extractTodos(ai, "Buy milk")).rejects.toThrow(
        "AI did not return extracted todos",
      );
    });

    it("throws when tool call has a wrong name", async () => {
      const ai = createMockAiWithResponse({
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
      });

      await expect(extractTodos(ai, "Buy milk")).rejects.toThrow(
        "Unexpected tool call: wrong_tool",
      );
    });

    it("throws when arguments JSON string is malformed", async () => {
      const ai = createMockAi("{ bad json }");

      await expect(extractTodos(ai, "Buy milk")).rejects.toThrow(
        "Failed to parse AI response",
      );
    });
  });

  describe("request format", () => {
    it("calls gateway with correct gateway name", async () => {
      const ai = createMockAi({ todos: [{ title: "Buy milk" }] });

      await extractTodos(ai, "Buy milk");

      expect(ai.gateway).toHaveBeenCalledWith("nylon-impossible");
    });

    it("calls run with correct provider and endpoint", async () => {
      const run = vi.fn().mockResolvedValue({
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
                        arguments: JSON.stringify({
                          todos: [{ title: "Buy milk" }],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
      } as Response);

      const gateway = vi.fn().mockReturnValue({ run });
      const ai = { gateway } as unknown as Ai;

      await extractTodos(ai, "Buy milk");

      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "compat",
          endpoint: "chat/completions",
        }),
      );
    });

    it("includes user text in messages", async () => {
      const run = vi.fn().mockResolvedValue({
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
                        arguments: JSON.stringify({
                          todos: [{ title: "Buy milk" }],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
      } as Response);

      const gateway = vi.fn().mockReturnValue({ run });
      const ai = { gateway } as unknown as Ai;

      await extractTodos(ai, "Buy milk and eggs");

      const call = run.mock.calls[0][0];
      expect(call.query.messages).toContainEqual({
        role: "user",
        content: "Buy milk and eggs",
      });
    });

    it("includes tools in request body", async () => {
      const run = vi.fn().mockResolvedValue({
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
                        arguments: JSON.stringify({
                          todos: [{ title: "Buy milk" }],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
      } as Response);

      const gateway = vi.fn().mockReturnValue({ run });
      const ai = { gateway } as unknown as Ai;

      await extractTodos(ai, "Buy milk");

      const call = run.mock.calls[0][0];
      expect(call.query.tools).toBeDefined();
      expect(call.query.tools[0].function.name).toBe("extract_todos");
      expect(call.query.tool_choice).toEqual({
        type: "function",
        function: { name: "extract_todos" },
      });
    });

    it("uses dynamic/default model", async () => {
      const run = vi.fn().mockResolvedValue({
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
                        arguments: JSON.stringify({
                          todos: [{ title: "Buy milk" }],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
      } as Response);

      const gateway = vi.fn().mockReturnValue({ run });
      const ai = { gateway } as unknown as Ai;

      await extractTodos(ai, "Buy milk");

      const call = run.mock.calls[0][0];
      expect(call.query.model).toBe("dynamic/default");
    });
  });
});
