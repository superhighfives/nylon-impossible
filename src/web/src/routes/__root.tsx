import { ClerkProvider } from "@clerk/tanstack-react-start";
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
import { getRequestUrl } from "@tanstack/react-start/server";
import DevEnvironmentIndicator from "../components/DevEnvironmentIndicator";
import { ErrorView } from "../components/ErrorView";
import Header from "../components/Header";
import { NotFound } from "../components/NotFound";
import OfflineBanner from "../components/OfflineBanner";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

const getOrigin = createServerFn({ method: "GET" }).handler(
  () => getRequestUrl().origin,
);

export const Route = createRootRouteWithContext<MyRouterContext>()({
  loader: () => getOrigin(),
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
      {
        name: "theme-color",
        content: "#fdfdf9",
        media: "(prefers-color-scheme: light)",
      },
      {
        name: "theme-color",
        content: "#14120b",
        media: "(prefers-color-scheme: dark)",
      },
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

function RootDocument() {
  const origin = Route.useLoaderData();

  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: inline theme detection script with no user input
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.classList.toggle('dark', isDark);
                document.documentElement.classList.toggle('light', !isDark);
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                  document.documentElement.classList.toggle('dark', e.matches);
                  document.documentElement.classList.toggle('light', !e.matches);
                });
              })();
            `,
          }}
        />
      </head>
      <body className="bg-gray-app text-gray antialiased">
        <ClerkProvider>
          <Header />
          <OfflineBanner />
          <div className="pt-header-offset">
            <Outlet />
          </div>
          <DevEnvironmentIndicator origin={origin} />
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
        <Scripts />
      </body>
    </html>
  );
}
