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

export default function DevEnvironmentIndicator({ origin }: Props) {
  const env = useDevEnvironment(origin);
  if (!env) return null;

  // Desktop only — on mobile these details live in the Settings modal so they
  // don't sit on top of the composer input.
  return (
    <div className="fixed bottom-4 left-4 z-50 hidden sm:flex flex-col gap-1 rounded-lg bg-surface/90 px-3 py-2 text-xs font-mono text-surface backdrop-blur-sm">
      <DevEnvironmentDetails origin={origin} />
    </div>
  );
}
