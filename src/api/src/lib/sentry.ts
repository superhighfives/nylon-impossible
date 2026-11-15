import type { ErrorEvent } from "@sentry/cloudflare";

/**
 * Scrub an API event before it leaves for Sentry: the request body (it may
 * hold todo titles) and the Authorization header. A personal API token,
 * unlike a session JWT, stays valid for months.
 */
export function beforeSend(event: ErrorEvent): ErrorEvent {
  if (event.request?.data) delete event.request.data;
  const headers = event.request?.headers;
  if (headers) {
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === "authorization") delete headers[name];
    }
  }
  return event;
}
