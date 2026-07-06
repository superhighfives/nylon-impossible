const PRODUCTION_API_URL = "https://api.nylonimpossible.com";

const isLocalhost =
  typeof window !== "undefined" && window.location.hostname === "localhost";

// An explicit VITE_API_BASE_URL always wins — this is what lets local dev work
// run against the production API (`pnpm dev:prod`). Without an override we
// default to the local API on localhost and the production API everywhere else.
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  (isLocalhost ? "http://localhost:8787" : PRODUCTION_API_URL);

export const API_URL = apiBaseUrl;
export const WS_URL = `${apiBaseUrl.replace(/^http/, "ws")}/ws`;

// True when the client is talking to the deployed production API. Surfaced in
// the dev environment indicator so it's obvious when dev work is hitting real
// production data.
export const IS_PRODUCTION_API = apiBaseUrl === PRODUCTION_API_URL;
