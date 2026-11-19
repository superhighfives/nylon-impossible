import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebSocketConnection } from "../useWebSocket";

// ---------------------------------------------------------------------------
// WebSocket mock
// ---------------------------------------------------------------------------

interface MockWebSocketInstance {
  readonly url: string;
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  simulateOpen(): void;
  simulateMessage(data: unknown): void;
  simulateClose(): void;
}

let lastCreatedWs: MockWebSocketInstance | null = null;

class MockWebSocket implements MockWebSocketInstance {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  send = vi.fn();
  close = vi.fn().mockImplementation(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public readonly url: string) {
    lastCreatedWs = this;
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  simulateMessage(data: unknown): void {
    const event = new MessageEvent("message", {
      data: typeof data === "string" ? data : JSON.stringify(data),
    });
    this.onmessage?.(event);
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockGetToken = vi.fn().mockResolvedValue("test-token");
let mockIsSignedIn = true;

vi.mock("@clerk/tanstack-react-start", () => ({
  useAuth: () => ({
    getToken: mockGetToken,
    get isSignedIn() {
      return mockIsSignedIn;
    },
  }),
}));

vi.mock("@/lib/config", () => ({
  API_URL: "https://api.example.com",
  WS_URL: "wss://api.example.com/ws",
}));

// POST /ws/ticket: a new ticket per call, "ticket-1", "ticket-2"…
let ticketCount = 0;
const fetchMock = vi.fn(async () => {
  ticketCount += 1;
  return new Response(JSON.stringify({ ticket: `ticket-${ticketCount}` }), {
    status: 200,
  });
});

const captureExceptionMock = vi.fn();
vi.mock("@/lib/sentry", () => ({
  Sentry: {
    captureException: (...args: unknown[]) => captureExceptionMock(...args),
  },
}));

// ---------------------------------------------------------------------------
// Helper: flush microtasks / async effects
// ---------------------------------------------------------------------------

async function flushEffects(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      // Use the real (non-mocked) setImmediate / queueMicrotask to yield to
      // the event loop, allowing pending promises (e.g. getToken) to settle.
      queueMicrotask(resolve);
    });
  });
  // A second flush catches any follow-on microtasks triggered by the first.
  await act(async () => {});
}

// ---------------------------------------------------------------------------
// Test wrapper
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useWebSocketConnection", () => {
  beforeEach(() => {
    lastCreatedWs = null;
    mockIsSignedIn = true;
    mockGetToken.mockResolvedValue("test-token");
    captureExceptionMock.mockReset();
    ticketCount = 0;
    fetchMock.mockClear();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a ticket with the session token and connects with only the ticket", async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

    await flushEffects();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/ws/ticket",
      {
        method: "POST",
        headers: { Authorization: "Bearer test-token" },
      },
    );
    expect(lastCreatedWs).not.toBeNull();
    expect(lastCreatedWs?.url).toBe("wss://api.example.com/ws?ticket=ticket-1");
    expect(lastCreatedWs?.url).not.toContain("token");
  });

  it("does not connect when the user is not signed in", async () => {
    mockIsSignedIn = false;

    const { Wrapper } = createWrapper();
    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

    await flushEffects();

    expect(lastCreatedWs).toBeNull();
  });

  it("invalidates todos query on connection open (to catch missed changes)", async () => {
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });
    await flushEffects();

    act(() => {
      lastCreatedWs?.simulateOpen();
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["todos"] }),
    );
  });

  it("invalidates todos query when a sync message is received", async () => {
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });
    await flushEffects();

    act(() => {
      lastCreatedWs?.simulateOpen();
      invalidateSpy.mockClear(); // reset after onopen call
      lastCreatedWs?.simulateMessage({ type: "sync" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["todos"] }),
    );
  });

  it("invalidates the lists query when a sync message is received", async () => {
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });
    await flushEffects();

    act(() => {
      lastCreatedWs?.simulateOpen();
      invalidateSpy.mockClear();
      lastCreatedWs?.simulateMessage({ type: "sync" });
    });

    // A column hidden on another computer leaves this board too.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["lists"] }),
    );
  });

  it("leaves lists alone on sync while a list change is in flight", async () => {
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    vi.spyOn(queryClient, "isMutating").mockReturnValue(1);

    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });
    await flushEffects();

    act(() => {
      lastCreatedWs?.simulateOpen();
      invalidateSpy.mockClear();
      lastCreatedWs?.simulateMessage({ type: "sync" });
    });

    // The hide's own onSettled refetches lists; an earlier refetch could
    // bring the column back before the hide is saved.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["todos"] }),
    );
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["lists"] }),
    );
  });

  it("does not invalidate the query for messages with unknown types", async () => {
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });
    await flushEffects();

    act(() => {
      lastCreatedWs?.simulateOpen();
      invalidateSpy.mockClear(); // reset after onopen call
      lastCreatedWs?.simulateMessage({ type: "unknown-event" });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("silently ignores invalid JSON messages", async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });
    await flushEffects();

    expect(() => {
      act(() => {
        lastCreatedWs?.simulateOpen();
        lastCreatedWs?.simulateMessage("not { valid json");
      });
    }).not.toThrow();
  });

  it("captures token-fetch failures to Sentry and schedules a retry", async () => {
    vi.useFakeTimers();

    try {
      mockGetToken
        .mockRejectedValueOnce(new Error("clerk down"))
        .mockResolvedValueOnce("recovered-token");

      const { Wrapper } = createWrapper();
      renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(lastCreatedWs).toBeNull();
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      const [err, ctx] = captureExceptionMock.mock.calls[0];
      expect((err as Error).message).toBe("clerk down");
      expect(ctx).toEqual(
        expect.objectContaining({
          tags: { area: "websocket", event: "token-fetch-failed" },
        }),
      );

      // Advance past the initial 1s retry delay — the second getToken call resolves.
      await act(async () => {
        vi.advanceTimersByTime(1100);
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(lastCreatedWs).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a failed ticket request, backs off and retries without opening a socket", async () => {
    vi.useFakeTimers();

    try {
      fetchMock.mockImplementationOnce(
        async () => new Response("nope", { status: 503 }),
      );

      const { Wrapper } = createWrapper();
      renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(lastCreatedWs).toBeNull();
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      expect(captureExceptionMock.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          tags: { area: "websocket", event: "ticket-fetch-failed" },
        }),
      );

      // Not before the 1s back-off.
      await act(async () => {
        vi.advanceTimersByTime(900);
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(200);
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(lastCreatedWs?.url).toBe(
        "wss://api.example.com/ws?ticket=ticket-1",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("backs off on a network failure fetching the ticket, and reports it", async () => {
    vi.useFakeTimers();

    try {
      fetchMock.mockImplementationOnce(async () => {
        throw new TypeError("Failed to fetch");
      });

      const { Wrapper } = createWrapper();
      renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(lastCreatedWs).toBeNull();
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      expect(captureExceptionMock.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          tags: { area: "websocket", event: "ticket-fetch-failed" },
        }),
      );

      await act(async () => {
        vi.advanceTimersByTime(1100);
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(lastCreatedWs).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("backs off on a 401 from the ticket request without reporting it", async () => {
    vi.useFakeTimers();

    try {
      fetchMock.mockImplementationOnce(
        async () => new Response("", { status: 401 }),
      );

      const { Wrapper } = createWrapper();
      renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(lastCreatedWs).toBeNull();
      expect(captureExceptionMock).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1100);
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(lastCreatedWs).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("schedules a reconnect after the connection closes", async () => {
    vi.useFakeTimers();

    try {
      const { Wrapper } = createWrapper();
      renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

      // Flush the async getToken() call using microtasks (unaffected by fake timers)
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(lastCreatedWs).not.toBeNull();
      if (!lastCreatedWs) throw new Error("lastCreatedWs is null");
      const firstWs = lastCreatedWs;

      act(() => {
        firstWs.simulateOpen();
        firstWs.simulateClose();
      });

      // Advance past the initial 1 second reconnect delay
      await act(async () => {
        vi.advanceTimersByTime(1100);
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(lastCreatedWs).not.toBe(firstWs);
      // A ticket is single-use, so the reconnect fetched a new one.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(firstWs.url).toBe("wss://api.example.com/ws?ticket=ticket-1");
      expect(lastCreatedWs?.url).toBe(
        "wss://api.example.com/ws?ticket=ticket-2",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("backs off 1, 2, 4… up to 30 s when the server refuses the handshake, without reporting it", async () => {
    vi.useFakeTimers();

    try {
      const { Wrapper } = createWrapper();
      renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      // A refused upgrade (a 401, a 5xx) fires error then close, never open.
      // Each retry should wait twice as long as the last, capped at 30 s.
      for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
        const refused = lastCreatedWs;
        if (!refused) throw new Error("lastCreatedWs is null");
        act(() => {
          refused.onerror?.(new Event("error"));
          refused.simulateClose();
        });

        await act(async () => {
          vi.advanceTimersByTime(delay - 100);
          for (let i = 0; i < 5; i++) await Promise.resolve();
        });
        expect(lastCreatedWs).toBe(refused);

        await act(async () => {
          vi.advanceTimersByTime(100);
          for (let i = 0; i < 5; i++) await Promise.resolve();
        });
        expect(lastCreatedWs).not.toBe(refused);
      }

      // A refused handshake isn't a Sentry event at all on the web.
      expect(captureExceptionMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts the back-off again from 1 s once a connection opens", async () => {
    vi.useFakeTimers();

    try {
      const { Wrapper } = createWrapper();
      renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      // Two refusals grow the delay to 4 s…
      for (const delay of [1000, 2000]) {
        const refused = lastCreatedWs;
        act(() => refused?.simulateClose());
        await act(async () => {
          vi.advanceTimersByTime(delay);
          for (let i = 0; i < 5; i++) await Promise.resolve();
        });
      }

      // …and an accepted one puts it back to 1 s.
      const accepted = lastCreatedWs;
      if (!accepted) throw new Error("lastCreatedWs is null");
      act(() => {
        accepted.simulateOpen();
        accepted.simulateClose();
      });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });

      expect(lastCreatedWs).not.toBe(accepted);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("notifyChanged", () => {
    it("sends a 'changed' message when the WebSocket is open", async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useWebSocketConnection(), {
        wrapper: Wrapper,
      });

      await flushEffects();

      act(() => {
        lastCreatedWs?.simulateOpen();
        result.current.notifyChanged();
      });

      expect(lastCreatedWs?.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "changed" }),
      );
    });

    it("does not send when the WebSocket is still connecting", async () => {
      const { Wrapper } = createWrapper();
      const { result } = renderHook(() => useWebSocketConnection(), {
        wrapper: Wrapper,
      });

      await flushEffects();
      // WebSocket is CONNECTING — don't call simulateOpen()

      act(() => {
        result.current.notifyChanged();
      });

      expect(lastCreatedWs?.send).not.toHaveBeenCalled();
    });
  });

  it("closes the WebSocket on unmount", async () => {
    const { Wrapper } = createWrapper();
    const { unmount } = renderHook(() => useWebSocketConnection(), {
      wrapper: Wrapper,
    });

    await flushEffects();

    if (!lastCreatedWs) throw new Error("lastCreatedWs is null");
    const ws = lastCreatedWs;

    act(() => {
      ws.simulateOpen();
    });

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });
});
