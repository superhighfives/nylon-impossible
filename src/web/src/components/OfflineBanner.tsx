import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Shows a banner when the browser reports being offline.
 * Positioned fixed at top, above the header.
 */
export default function OfflineBanner() {
  const { isOnline } = useOnlineStatus();

  // Don't render during SSR or when online
  if (isOnline !== false) return null;

  return (
    <output
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[60] bg-yellow-base px-4 py-2 text-center text-sm font-medium text-yellow"
    >
      You're offline — changes will sync when you reconnect.
    </output>
  );
}
