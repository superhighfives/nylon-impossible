import { useLocation } from "@tanstack/react-router";
import { API_URL } from "../lib/config";

function DevEnvironmentIndicatorInner() {
  const location = useLocation();

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const currentUrl = `${origin}${location.pathname}${location.searchStr}`;

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

export default function DevEnvironmentIndicator() {
  if (import.meta.env.PROD) return null;
  return <DevEnvironmentIndicatorInner />;
}
