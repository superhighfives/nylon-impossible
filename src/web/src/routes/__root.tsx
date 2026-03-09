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
import DevEnvironmentIndicator from "../components/DevEnvironmentIndicator";
import Header from "../components/Header";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
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
        content: "#0a0a0a",
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
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: inline theme detection script with no user input
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const mq = window.matchMedia('(prefers-color-scheme: dark)');
                document.documentElement.classList.toggle('dark', mq.matches);
                document.documentElement.classList.toggle('light', !mq.matches);
                function updateFavicon(isDark) {
                  const link = document.querySelector("link[rel='icon'][type='image/svg+xml']");
                  if (link) link.href = isDark ? '/favicon-dark.svg' : '/favicon.svg';
                }
                updateFavicon(mq.matches);
                mq.addEventListener('change', (e) => {
                  document.documentElement.classList.toggle('dark', e.matches);
                  document.documentElement.classList.toggle('light', !e.matches);
                  updateFavicon(e.matches);
                });
              })();
            `,
          }}
        />
      </head>
      <body className="bg-gray-app text-gray-normal antialiased">
        <ClerkProvider>
          <Header />
          <Outlet />
          {!import.meta.env.PROD && <DevEnvironmentIndicator />}
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
