// 127.0.0.1 counts too — otherwise a dev session opened by IP silently
// points AI/agent calls at the production API with a dev-instance token.
const isLocalhost =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const apiBaseUrl = isLocalhost
  ? "http://localhost:8787"
  : (import.meta.env.VITE_API_BASE_URL ?? "https://api.nylonimpossible.com");

export const API_URL = apiBaseUrl;
export const WS_URL = `${apiBaseUrl.replace(/^http/, "ws")}/ws`;
