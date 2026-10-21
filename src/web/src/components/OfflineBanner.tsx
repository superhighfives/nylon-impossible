import { useLayoutEffect, useRef } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Variable the full-screen layouts read to start below the banner. */
export const OFFLINE_INSET_VAR = "--n-offline-inset";

/**
 * Shows a banner when the browser reports being offline. It sits at the top
 * and publishes its height, so the phone and wide layouts (fixed,
 * full-viewport) move down under it instead of losing their top row to it.
 */
export default function OfflineBanner() {
  const { isOnline } = useOnlineStatus();
  const ref = useRef<HTMLOutputElement>(null);
  const offline = isOnline === false;

  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!offline || !el) return;
    const publish = () =>
      root.style.setProperty(OFFLINE_INSET_VAR, `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(OFFLINE_INSET_VAR);
    };
  }, [offline]);

  // Don't render during SSR or when online
  if (!offline) return null;

  return (
    <output
      ref={ref}
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[60] bg-n-brand px-4 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-2 text-center text-sm font-medium text-n-brand-ink"
    >
      You’re offline. Changes will sync when you reconnect.
    </output>
  );
}
