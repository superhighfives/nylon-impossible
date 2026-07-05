import { subscribeToSchemeChange } from "@epic-web/client-hints/color-scheme";
import { subscribeToMotionChange } from "@epic-web/client-hints/reduced-motion";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { hintsUtils } from "@/lib/client-hints";

/**
 * Renders the epic-web client-hint check script and keeps route data fresh.
 *
 * The inline script must run as early as possible in <head>: it compares the
 * OS color scheme against the `CH-prefers-color-scheme` cookie and, if they
 * differ (or on first visit), sets the cookie and reloads once so the server
 * can render the correct values. The effects revalidate on live OS changes
 * (color scheme, reduced motion) so a "system" preference re-resolves without a
 * manual reload.
 */
export function ClientHintCheck() {
  const router = useRouter();
  useEffect(() => {
    const invalidate = () => router.invalidate();
    const cleanups = [
      subscribeToSchemeChange(invalidate),
      subscribeToMotionChange(invalidate),
    ];
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [router]);
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: epic-web client hint check script, no user input
      dangerouslySetInnerHTML={{
        __html: hintsUtils.getClientHintCheckScript(),
      }}
    />
  );
}
