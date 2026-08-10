import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSendTodoAgentMessage, useTodoAgentMessages } from "../useTodoAgent";

vi.mock("@clerk/tanstack-react-start", () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("test-token") }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  }

  return { queryClient, Wrapper };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("useTodoAgentMessages", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("treats a 404 (never-dispatched instance) as an empty conversation", async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}, 404));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTodoAgentMessages("todo-1", true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ messages: [], settlements: [] });
  });

  it("does not fetch while disabled", async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValue(
      jsonResponse({ messages: [], settlements: [] }),
    );

    const { Wrapper } = createWrapper();
    renderHook(() => useTodoAgentMessages("todo-1", false), {
      wrapper: Wrapper,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("surfaces a settled conversation's messages", async () => {
    const conversation = {
      messages: [
        {
          id: "m1",
          role: "user",
          submissionId: "sub_1",
          parts: [{ type: "text", text: "hi" }],
        },
        {
          id: "m2",
          role: "assistant",
          submissionId: "sub_1",
          parts: [{ type: "text", text: "hello!" }],
        },
      ],
      settlements: [],
    };
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse(conversation));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTodoAgentMessages("todo-1", true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(conversation));
  });
});

describe("useSendTodoAgentMessage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts { message } to the src/api message route", async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValue(jsonResponse({ submissionId: "sub_1" }));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSendTodoAgentMessage("todo-1"), {
      wrapper: Wrapper,
    });

    result.current.mutate("Book the DMV visit");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/todos/todo-1/agent/message"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Book the DMV visit" }),
      }),
    );
  });

  it("surfaces an error on a non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}, 500));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSendTodoAgentMessage("todo-1"), {
      wrapper: Wrapper,
    });

    result.current.mutate("hi");

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
