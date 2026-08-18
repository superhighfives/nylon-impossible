import { useLocation } from "@tanstack/react-router";
import { API_URL } from "../lib/config";

const isPreviewDeploy = (hostname: string) =>
  /^pr-\d+\.nylonimpossible\.com$/.test(hostname);

interface Props {
  origin: string;
}

/**
 * The current page URL and API base, but only in local dev and preview
 * deploys — returns null in production so callers render nothing. Shared by the
 * floating desktop indicator and the Settings modal's mobile section.
 */
export function useDevEnvironment(
  origin: string,
): { currentUrl: string; apiUrl: string } | null {
  const location = useLocation();
  const hostname = new URL(origin).hostname;

  if (import.meta.env.PROD && !isPreviewDeploy(hostname)) return null;

  return { currentUrl: `${origin}${location.href}`, apiUrl: API_URL };
}

/** Small rows listing the current URL + API base. */
export function DevEnvironmentDetails({ origin }: Props) {
  const env = useDevEnvironment(origin);
  if (!env) return null;

  return (
    <>
      <div className="flex gap-2">
        <span className="text-muted">url</span>
        <span className="max-w-64 truncate">{env.currentUrl}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-muted">api</span>
        <span>{env.apiUrl}</span>
      </div>
    </>
  );
}
