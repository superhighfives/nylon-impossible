import { useLocation } from "@tanstack/react-router";
import { API_URL } from "../lib/config";

const isPreviewDeploy = (hostname: string) =>
  /^pr-\d+\.nylonimpossible\.com$/.test(hostname);

interface Props {
  origin: string;
}

export default function DevEnvironmentIndicator({ origin }: Props) {
  const location = useLocation();
  const hostname = new URL(origin).hostname;

  if (import.meta.env.PROD && !isPreviewDeploy(hostname)) return null;

  const currentUrl = `${origin}${location.href}`;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-1 rounded-lg bg-surface/90 px-3 py-2 text-xs font-mono text-surface backdrop-blur-sm">
      <div className="flex gap-2">
        <span className="text-muted">url</span>
        <span className="max-w-64 truncate">{currentUrl}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-muted">api</span>
        <span>{API_URL}</span>
      </div>
    </div>
  );
}
