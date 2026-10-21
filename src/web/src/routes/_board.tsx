import { Show } from "@clerk/tanstack-react-start";
import {
  type BoardView,
  boardPath,
  parseBoardPath,
} from "@nylon-impossible/shared";
import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { LandingPage } from "@/components/LandingPage";
import { LayoutSwitch } from "@/components/phone/LayoutSwitch";
import { PhoneApp } from "@/components/phone/PhoneApp";
import { WideApp } from "@/components/wide/WideApp";
import {
  useWebSocketConnection,
  WebSocketSyncContext,
} from "@/hooks/useWebSocket";

/**
 * The app's one surface. A pathless layout, so `/`, `/today`, `/this-week`,
 * `/someday`, `/lists` and `/list/:id` (the child routes) all render this
 * same tree: moving between them changes the view, it doesn't remount the
 * board or drop the sync connection.
 */
export const Route = createFileRoute("/_board")({ component: App });

function SignedInContent() {
  const wsSync = useWebSocketConnection();
  const pathname = useLocation({ select: (l) => l.pathname });
  const view = useMemo(() => parseBoardPath(pathname), [pathname]);
  const navigate = useNavigate();
  // The board keeps the address bar in step with what's on screen, without
  // adding a history entry per swipe.
  const onNavigate = useCallback(
    (next: BoardView | null) => {
      const href = next ? boardPath(next) : "/";
      if (href !== pathname) void navigate({ href, replace: true });
    },
    [navigate, pathname],
  );
  // Under 1024px the phone layout; at 1024px and up the wide board. Both are
  // fixed full-viewport surfaces drawing their own chrome.
  return (
    <WebSocketSyncContext.Provider value={wsSync}>
      <LayoutSwitch
        phone={<PhoneApp view={view} onNavigate={onNavigate} />}
        wide={<WideApp view={view} onNavigate={onNavigate} />}
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
      <Outlet />
    </>
  );
}
