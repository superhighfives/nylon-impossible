import { Show } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/LandingPage";
import { TodoGrid } from "@/components/TodoGrid";
import { TodoInput } from "@/components/TodoInput";
import {
  useWebSocketConnection,
  WebSocketSyncContext,
} from "@/hooks/useWebSocket";

export const Route = createFileRoute("/")({ component: App });

function SignedInContent() {
  const wsSync = useWebSocketConnection();

  return (
    <WebSocketSyncContext.Provider value={wsSync}>
      <div className="container max-w-4xl mx-auto py-8 px-4 todo-list-ios-offset">
        <div className="max-w-xl mx-auto">
          <TodoInput />
        </div>
        <div className="mt-4">
          <TodoGrid />
        </div>
      </div>
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
