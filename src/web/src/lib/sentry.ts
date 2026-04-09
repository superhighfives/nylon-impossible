import * as Sentry from "@sentry/react";

export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
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
