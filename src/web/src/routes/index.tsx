import { Show } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/LandingPage";
import { LayoutSwitch } from "@/components/phone/LayoutSwitch";
import { PhoneApp } from "@/components/phone/PhoneApp";
import { WideApp } from "@/components/wide/WideApp";
import {
  useWebSocketConnection,
  WebSocketSyncContext,
} from "@/hooks/useWebSocket";

export const Route = createFileRoute("/")({ component: App });

function SignedInContent() {
  const wsSync = useWebSocketConnection();
  // Under 1024px the phone layout; at 1024px and up the wide board. Both are
  // fixed full-viewport surfaces drawing their own chrome.
  return (
    <WebSocketSyncContext.Provider value={wsSync}>
      <LayoutSwitch phone={<PhoneApp />} wide={<WideApp />} />
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
