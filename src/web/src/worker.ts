// Cloudflare Worker entry (wrangler.jsonc `main` points here). It wraps the
// TanStack Start server handler with @sentry/cloudflare so server-side errors —
// SSR render throws and anything that bubbles out of a server function — are
// captured and flushed via waitUntil. Handled-but-swallowed server-function
// errors are reported separately from our own funnel in lib/utils.ts
// (errorToResponse), which runs inside this same request scope so
// captureException finds the active client.
//
// This mirrors the API worker's `export default Sentry.withSentry(...)` setup.
// The plain `@tanstack/react-start/server-entry` (the framework default handler)
// is imported and wrapped, rather than repointing away from it.
import * as Sentry from "@sentry/cloudflare";
import startEntry from "@tanstack/react-start/server-entry";

// startEntry is { fetch: RequestHandler }, whose fetch is typed (request, opts?)
// but invoked by the runtime as (request, env, ctx). It's structurally an
// ExportedHandler for our purposes; cast to satisfy withSentry.
const handler = startEntry as unknown as ExportedHandler<Env>;

// DSN and environment are build-time client-hint vars (a Sentry DSN is not a
// secret — it already ships in the browser bundle). Vite inlines import.meta.env
// into the SSR build too, so no runtime binding is needed. When VITE_SENTRY_DSN
// is unset (e.g. local dev), withSentry initialises with no DSN and no-ops.
export default Sentry.withSentry(
  () => ({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_IS_PREVIEW
      ? "preview"
      : import.meta.env.MODE,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Strip request body from events (may contain todo titles — PII).
      if (event.request?.data) delete event.request.data;
      return event;
    },
  }),
  handler,
);
