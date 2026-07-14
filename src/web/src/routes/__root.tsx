import { ClerkProvider, Show, useUser } from "@clerk/tanstack-react-start";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  getRequest,
  getRequestUrl,
} from "@tanstack/react-start/server";
import { useEffect } from "react";
import { ClientHintCheck } from "../components/ClientHintCheck";
import DevEnvironmentIndicator from "../components/DevEnvironmentIndicator";
import { ErrorView } from "../components/ErrorView";
import Header from "../components/Header";
import { ImportReviewModal } from "../components/ImportReviewModal";
import { NotFound } from "../components/NotFound";
import OfflineBanner from "../components/OfflineBanner";
import { SettingsModal } from "../components/SettingsModal";
import {
  THEME_COLOR,
  THEME_STORAGE_KEY,
  ThemeSync,
} from "../components/ThemeSync";
import { Toaster } from "../components/ui";
import { HintsProvider } from "../hooks/useHints";
import {
  ImportReviewContext,
  useImportReviewValue,
} from "../hooks/useImportReview";
import {
  OnlineStatusContext,
  useOnlineStatusValue,
} from "../hooks/useOnlineStatus";
import { SettingsContext, useSettingsValue } from "../hooks/useSettings";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import { getHints } from "../lib/client-hints";
import { initSentry, Sentry } from "../lib/sentry";
import appCss from "../styles.css?url";

initSentry();

interface MyRouterContext {
  queryClient: QueryClient;
}

// Resolve client hints on the server so the SSR HTML is themed/formatted
// correctly on first paint (no flash, no hydration mismatch). Color scheme gets
// an extra layer: the explicit light/dark/system preference rides in a cookie
// written by ThemeSync and wins over the OS hint; "system" (or no preference)
// falls back to the hint. time-zone and reduced-motion come straight from the
// hints. The resolved scheme is folded back into the hints object so
// useHints().colorScheme matches what's applied to <html>.
const getRootData = createServerFn({ method: "GET" }).handler(() => {
  const hints = getHints(getRequest());
  const pref = getCookie(THEME_STORAGE_KEY);
  const colorScheme: "light" | "dark" =
    pref === "light" || pref === "dark" ? pref : hints.colorScheme;
  return {
    origin: getRequestUrl().origin,
    hints: { ...hints, colorScheme },
  };
});

export const Route = createRootRouteWithContext<MyRouterContext>()({
  loader: () => getRootData(),
  notFoundComponent: NotFound,
  errorComponent: ({ reset }) => <ErrorView reset={reset} />,
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Nylon Impossible",
      },
      // theme-color is rendered in <head> below from the resolved scheme so it
      // tracks explicit light/dark overrides; ThemeSync keeps it live at runtime.
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
        sizes: "any",
      },
      {
        rel: "icon",
        type: "image/x-icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
        sizes: "180x180",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
    ],
  }),

  component: RootDocument,
});

function SentryUserSync() {
  const { user } = useUser();
  useEffect(() => {
    if (user?.id) {
      Sentry.setUser({ id: user.id });
    } else {
      Sentry.setUser(null);
    }
  }, [user?.id]);
  return null;
}

function RootDocument() {
  const { origin, hints } = Route.useLoaderData();
  const onlineStatus = useOnlineStatusValue();
  const importReview = useImportReviewValue();
  const settings = useSettingsValue();

  return (
    <html
      lang="en"
      className={hints.colorScheme}
      data-reduced-motion={hints.reducedMotion}
    >
      <head>
        {/* Must run before paint to reconcile the client-hint cookies. */}
        <ClientHintCheck />
        <HeadContent />
        <meta name="theme-color" content={THEME_COLOR[hints.colorScheme]} />
      </head>
      <body className="min-h-full bg-gray-app text-gray antialiased">
        <HintsProvider hints={hints}>
          <ClerkProvider>
            <SentryUserSync />
            <ThemeSync />
            <Sentry.ErrorBoundary
              fallback={({ resetError }) => <ErrorView reset={resetError} />}
            >
              <OnlineStatusContext.Provider value={onlineStatus}>
                <ImportReviewContext.Provider value={importReview}>
                  <SettingsContext.Provider value={settings}>
                    <OfflineBanner />
                    <Header />
                    <div className="pt-header-offset">
                      <Outlet />
                    </div>
                    <DevEnvironmentIndicator origin={origin} />
                    <Show when="signed-in">
                      <SettingsModal origin={origin} />
                      <ImportReviewModal />
                    </Show>
                    <Toaster />
                  </SettingsContext.Provider>
                </ImportReviewContext.Provider>
              </OnlineStatusContext.Provider>
            </Sentry.ErrorBoundary>
            <TanStackDevtools
              config={{
                position: "bottom-right",
              }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
                TanStackQueryDevtools,
              ]}
            />
          </ClerkProvider>
        </HintsProvider>
        <Scripts />
      </body>
    </html>
  );
}
