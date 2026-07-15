import { Popover } from "@base-ui/react/popover";
import { useLocation } from "@tanstack/react-router";
import { Terminal } from "lucide-react";
import { API_URL } from "../lib/config";
import { Button } from "./ui";

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
  // don't sit on top of the composer input. Tucked behind an icon so they stay
  // out of the way until you reach for them.
  return (
    <Popover.Root>
      <div className="fixed bottom-4 left-4 z-50 hidden sm:block">
        <Popover.Trigger
          render={
            <Button
              variant="outline"
              size="sm"
              shape="square"
              aria-label="Environment details"
            >
              <Terminal size={16} />
            </Button>
          }
        />
      </div>
      <Popover.Portal>
        <Popover.Positioner side="top" align="start" sideOffset={4}>
          <Popover.Popup className="z-50 flex flex-col gap-1 rounded-lg border border-gray-subtle bg-gray-surface px-3 py-2 text-xs font-mono text-gray-muted shadow-lg">
            <DevEnvironmentDetails origin={origin} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
