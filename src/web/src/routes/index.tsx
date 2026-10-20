import { Show } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { BoardChrome } from "@/components/BoardChrome";
import { LandingPage } from "@/components/LandingPage";
import { LayoutSwitch } from "@/components/phone/LayoutSwitch";
import { PhoneApp } from "@/components/phone/PhoneApp";
import { TodoGrid } from "@/components/TodoGrid";
import {
  useWebSocketConnection,
  WebSocketSyncContext,
} from "@/hooks/useWebSocket";

export const Route = createFileRoute("/")({ component: App });

function SignedInContent() {
  const wsSync = useWebSocketConnection();
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Global `n` shortcut: focuses the composer (which creates into Today),
  // unless focus is already inside a text field. Lives here, not TodoGrid,
  // because the composer itself now renders in BoardChrome.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      composerRef.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Under 1024px the phone layout (Phase 3); at 1024px and up the board, a
  // fixed full-viewport surface (TodoGrid owns the column grid and all
  // board-level overlays) with BoardChrome floating the logotype, the
  // quick-add composer, and Settings/account controls above it.
  return (
    <WebSocketSyncContext.Provider value={wsSync}>
      <LayoutSwitch
        phone={<PhoneApp />}
        wide={
          <>
            <BoardChrome composerRef={composerRef} />
            <TodoGrid />
          </>
        }
      />
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
