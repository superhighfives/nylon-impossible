import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (isOnline) return null;

  return (
    <output
      aria-live="polite"
      className="block w-full bg-yellow-base px-4 py-2 text-center text-sm font-medium text-yellow"
    >
      You're offline — changes will sync when you reconnect.
    </output>
  );
}
