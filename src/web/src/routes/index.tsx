import { SignedIn, SignedOut } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/LandingPage";
import { TodoInput } from "@/components/TodoInput";
import { TodoList } from "@/components/TodoList";
import {
  useWebSocketConnection,
  WebSocketSyncContext,
} from "@/hooks/useWebSocket";

export const Route = createFileRoute("/")({ component: App });

function SignedInContent() {
  const wsSync = useWebSocketConnection();

  return (
    <WebSocketSyncContext.Provider value={wsSync}>
      <div className="container max-w-xl mx-auto py-8 px-4">
        <div className="space-y-8">
          <TodoInput />
          <TodoList />
        </div>
      </div>
    </WebSocketSyncContext.Provider>
  );
}

function App() {
  return (
    <>
      <SignedOut>
        <LandingPage />
      </SignedOut>

      <SignedIn>
        <SignedInContent />
      </SignedIn>
    </>
  );
}
