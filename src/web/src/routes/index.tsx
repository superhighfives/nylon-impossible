import { Show } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { BoardChrome } from "@/components/BoardChrome";
import { LandingPage } from "@/components/LandingPage";
import { TodoGrid } from "@/components/TodoGrid";
import {
  useWebSocketConnection,
  WebSocketSyncContext,
} from "@/hooks/useWebSocket";

export const Route = createFileRoute("/")({ component: App });

function SignedInContent() {
  const wsSync = useWebSocketConnection();

  // The board is a fixed full-viewport surface (TodoGrid owns the column
  // grid, the composer, and all board-level overlays); BoardChrome floats the
  // logotype and Settings/account controls above it.
  return (
    <WebSocketSyncContext.Provider value={wsSync}>
      <BoardChrome />
      <TodoGrid />
    </WebSocketSyncContext.Provider>
  );
}

function App() {
  return (
    <>
      <Show when="signed-out">
        <LandingPage />
      </Show>

      <Show when="signed-in">
        <SignedInContent />
      </Show>
    </>
  );
}
