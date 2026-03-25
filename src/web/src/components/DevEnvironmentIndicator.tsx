import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { API_URL } from "../lib/config";

const isPreviewDeploy = () =>
  /^pr-\d+\.nylonimpossible\.com$/.test(window.location.hostname);

export default function DevEnvironmentIndicator() {
  const location = useLocation();
  const [origin, setOrigin] = useState("");
  const [show, setShow] = useState(!import.meta.env.PROD);

  useEffect(() => {
    setOrigin(window.location.origin);
    if (import.meta.env.PROD) {
      setShow(isPreviewDeploy());
    }
  }, []);

  if (!show) return null;

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
