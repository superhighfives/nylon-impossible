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
  WS_URL: "wss://api.example.com/ws",
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
    return createElement(QueryClientProvider, { client: queryClient }, children);
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
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects to the WebSocket URL with the auth token appended", async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

    await flushEffects();

    expect(lastCreatedWs).not.toBeNull();
    expect(lastCreatedWs!.url).toBe(
      "wss://api.example.com/ws?token=test-token",
    );
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
      lastCreatedWs!.simulateOpen();
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
      lastCreatedWs!.simulateOpen();
      invalidateSpy.mockClear(); // reset after onopen call
      lastCreatedWs!.simulateMessage({ type: "sync" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["todos"] }),
    );
  });

  it("does not invalidate the query for messages with unknown types", async () => {
    const { queryClient, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });
    await flushEffects();

    act(() => {
      lastCreatedWs!.simulateOpen();
      invalidateSpy.mockClear(); // reset after onopen call
      lastCreatedWs!.simulateMessage({ type: "unknown-event" });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("silently ignores invalid JSON messages", async () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });
    await flushEffects();

    expect(() => {
      act(() => {
        lastCreatedWs!.simulateOpen();
        lastCreatedWs!.simulateMessage("not { valid json");
      });
    }).not.toThrow();
  });

  it("schedules a reconnect after the connection closes", async () => {
    vi.useFakeTimers();

    try {
      const { Wrapper } = createWrapper();
      renderHook(() => useWebSocketConnection(), { wrapper: Wrapper });

      // Flush the async getToken() call using microtasks (unaffected by fake timers)
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(lastCreatedWs).not.toBeNull();
      const firstWs = lastCreatedWs!;

      act(() => {
        firstWs.simulateOpen();
        firstWs.simulateClose();
      });

      // Advance past the initial 1 second reconnect delay
      await act(async () => {
        vi.advanceTimersByTime(1100);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(lastCreatedWs).not.toBe(firstWs);
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
        lastCreatedWs!.simulateOpen();
        result.current.notifyChanged();
      });

      expect(lastCreatedWs!.send).toHaveBeenCalledWith(
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

      expect(lastCreatedWs!.send).not.toHaveBeenCalled();
    });
  });

  it("closes the WebSocket on unmount", async () => {
    const { Wrapper } = createWrapper();
    const { unmount } = renderHook(() => useWebSocketConnection(), {
      wrapper: Wrapper,
    });

    await flushEffects();

    const ws = lastCreatedWs!;

    act(() => {
      ws.simulateOpen();
    });

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });
});
