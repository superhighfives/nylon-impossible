import * as Sentry from "@sentry/react";

/**
 * The browser couldn't reach the server at all: offline, a dropped
 * connection, or a request cut off by sleep or navigation. Each browser words
 * it differently. The action has already toasted and rolled back, and server
 * faults are reported from the worker, so these only add noise.
 */
const NETWORK_FAILURES = [
  "Failed to fetch", // Chrome, Edge
  "Load failed", // Safari
  "NetworkError when attempting to fetch resource.", // Firefox
];

export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError && NETWORK_FAILURES.includes(error.message);
}

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
    beforeSend(event, hint) {
      // Don't send in dev
      if (import.meta.env.DEV) return null;
      if (isNetworkFailure(hint.originalException)) return null;
      return event;
    },
  });
}

export { Sentry };
