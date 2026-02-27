import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";

const TODOS_QUERY_KEY = ["todos"];

const WS_URL =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "ws://localhost:8787/ws"
    : "wss://api.nylonimpossible.com/ws";

const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;

interface WebSocketSync {
  notifyChanged: () => void;
}

export const WebSocketSyncContext = createContext<WebSocketSync>({
  notifyChanged: () => {},
});

export function useWebSocketSync() {
  return useContext(WebSocketSyncContext);
}

export function useWebSocketConnection(): WebSocketSync {
  const { getToken, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notifyChanged = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "changed" }));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!isSignedIn) return;

    async function connect() {
      if (!mountedRef.current) return;

      try {
        const token = await getToken();
        if (!token || !mountedRef.current) return;

        const ws = new WebSocket(`${WS_URL}?token=${token}`);

        ws.onopen = () => {
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
          // Fetch latest on connect/reconnect to catch missed changes
          queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "sync") {
              queryClient.invalidateQueries({ queryKey: TODOS_QUERY_KEY });
            }
          } catch {
            // Invalid JSON, ignore
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (mountedRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              reconnectDelayRef.current = Math.min(
                reconnectDelayRef.current * 2,
                MAX_RECONNECT_DELAY,
              );
              connect();
            }, reconnectDelayRef.current);
          }
        };

        ws.onerror = () => {
          // onclose will fire after onerror, handling reconnection
        };

        wsRef.current = ws;
      } catch {
        // Token fetch failed, retry
        if (mountedRef.current) {
          reconnectTimerRef.current = setTimeout(
            connect,
            reconnectDelayRef.current,
          );
        }
      }
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [isSignedIn, getToken, queryClient]);

  return { notifyChanged };
}
