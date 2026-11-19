import * as Sentry from "@sentry/react";

export function initSentry() {
  if (typeof window === "undefined") return;
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  // Smoke runs drive PR previews with Playwright and must never page anyone.
  // Only previews are muted: an automated browser on production still reports.
  if (import.meta.env.VITE_IS_PREVIEW && navigator.webdriver) return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_IS_PREVIEW
      ? "preview"
      : import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // No session replay content capture (PII risk)
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0, // off by default
    replaysOnErrorSampleRate: 0.5, // capture replay on error only
    beforeSend(event) {
      // Don't send in dev
      if (import.meta.env.DEV) return null;
      return event;
    },
  });
}

export { Sentry };
