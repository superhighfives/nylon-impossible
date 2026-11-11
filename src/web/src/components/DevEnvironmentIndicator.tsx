import { useLocation } from "@tanstack/react-router";
import { API_URL } from "../lib/config";

const isPreviewDeploy = (hostname: string) =>
  /^pr-\d+\.nylonimpossible\.com$/.test(hostname);

/**
 * The current page URL and API base, but only in local dev and preview
 * deploys — returns null in production so callers render nothing. Used by the
 * Settings modal's dev-environment section.
 */
export function useDevEnvironment(
  origin: string,
): { currentUrl: string; apiUrl: string } | null {
  const location = useLocation();
  const hostname = new URL(origin).hostname;

  if (import.meta.env.PROD && !isPreviewDeploy(hostname)) return null;

  return { currentUrl: `${origin}${location.href}`, apiUrl: API_URL };
}
