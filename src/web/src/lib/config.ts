const isLocalhost =
  typeof window !== "undefined" && window.location.hostname === "localhost";

const apiBaseUrl = isLocalhost
  ? "http://localhost:8787"
  : (import.meta.env.VITE_API_BASE_URL ?? "https://api.nylonimpossible.com");

export const API_URL = apiBaseUrl;
export const WS_URL = `${apiBaseUrl.replace(/^http/, "ws")}/ws`;
