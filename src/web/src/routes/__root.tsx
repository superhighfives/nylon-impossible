import { ClerkProvider, useUser } from "@clerk/tanstack-react-start";
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
import { getCookie, getRequest } from "@tanstack/react-start/server";
import { useEffect } from "react";
import { ClientHintCheck } from "../components/ClientHintCheck";
import { ErrorView } from "../components/ErrorView";
import { NotFound } from "../components/NotFound";
import OfflineBanner from "../components/OfflineBanner";
import {
  THEME_COLOR,
  THEME_STORAGE_KEY,
  ThemeSync,
} from "../components/ThemeSync";
import { TimezoneSync } from "../components/TimezoneSync";
import { Toaster } from "../components/ui";
import { HintsProvider } from "../hooks/useHints";
import {
  OnlineStatusContext,
  useOnlineStatusValue,
} from "../hooks/useOnlineStatus";
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
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
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
        // Browser chrome renders this directly — it can only ever follow the
        // OS's prefers-color-scheme, unlike the landing page's logo,
        // which swaps files based on the app's own explicit theme. Keep the
        // OS-driven dark-mode CSS isolated to this dedicated file so it can't
        // leak into the app-theme-driven favicon.svg/favicon-dark.svg pair.
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon-tab.svg",
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
  const { hints } = Route.useLoaderData();
  const onlineStatus = useOnlineStatusValue();

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
        <meta
          name="theme-color"
          content={
            hints.colorScheme === "dark" ? THEME_COLOR.dark : THEME_COLOR.light
          }
        />
      </head>
      {/* Background and ink come from tokens.css via styles.css, so the app
          and the static pages share one canvas. */}
      <body className="min-h-full antialiased">
        <HintsProvider hints={hints}>
          <ClerkProvider>
            <SentryUserSync />
            <ThemeSync />
            <TimezoneSync />
            <Sentry.ErrorBoundary
              fallback={({ resetError }) => <ErrorView reset={resetError} />}
            >
              <OnlineStatusContext.Provider value={onlineStatus}>
                <OfflineBanner />
                <Outlet />
                <Toaster />
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
