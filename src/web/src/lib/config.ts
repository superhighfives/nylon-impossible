const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "https://api.nylonimpossible.com";

export const API_URL = apiBaseUrl;
export const WS_URL = `${apiBaseUrl.replace(/^http/, "ws")}/ws`;
