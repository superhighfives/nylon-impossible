import { SignedIn, SignedOut } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppMock } from "@/components/AppMock";
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
        <div className="space-y-4">
          <TodoInput />
          <TodoList />
        </div>
      </div>
    </WebSocketSyncContext.Provider>
  );
}

function App() {
  // Preview mode: detected client-side only so SSR isn't affected.
  // Navigate to /?preview=true to render the self-contained AppMock.
  const [isPreview, setIsPreview] = useState(false);
  useEffect(() => {
    setIsPreview(
      new URLSearchParams(window.location.search).get("preview") === "true",
    );
  }, []);

  if (isPreview) return <AppMock />;

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
