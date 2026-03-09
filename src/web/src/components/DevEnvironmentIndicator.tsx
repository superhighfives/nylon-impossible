import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { API_URL } from "../lib/config";

export default function DevEnvironmentIndicator() {
  const location = useLocation();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (import.meta.env.PROD) return null;

  const currentUrl = `${origin}${location.pathname}${location.searchStr}`;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-1 rounded-lg bg-gray-12/90 px-3 py-2 text-xs font-mono text-gray-1 backdrop-blur-sm">
      <div className="flex gap-2">
        <span className="text-gray-8">url</span>
        <span className="truncate max-w-64">{currentUrl}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-gray-8">api</span>
        <span>{API_URL}</span>
      </div>
    </div>
  );
}
