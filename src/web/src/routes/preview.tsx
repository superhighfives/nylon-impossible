import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppMock } from "@/components/AppMock";

// Render client-side only — the SSR environment crashes on this route
// (Clerk's FAPI initialisation raises an HTTPError for unregistered paths).
// Returning null server-side produces a clean empty shell; React hydration
// then mounts AppMock on the client.
function PreviewPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return <AppMock />;
}

export const Route = createFileRoute("/preview")({ component: PreviewPage });
