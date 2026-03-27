import { createContext, useContext, useEffect, useState } from "react";

interface OnlineStatusContextValue {
  isOnline: boolean | null;
}

export const OnlineStatusContext = createContext<OnlineStatusContextValue>({
  isOnline: null,
});

export function useOnlineStatus() {
  return useContext(OnlineStatusContext);
}

export function useOnlineStatusValue(): OnlineStatusContextValue {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
