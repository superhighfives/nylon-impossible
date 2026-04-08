import { Show, UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function Header() {
  const { isOnline } = useOnlineStatus();
  // When offline, push header down to make room for the offline banner (~40px)
  const topClass = isOnline === false ? "top-12" : "top-4";

  return (
    <div
      className={`fixed ${topClass} left-0 right-0 z-50 flex justify-center px-4 pointer-events-none transition-[top] duration-200`}
    >
      <header className="pointer-events-auto flex items-center -space-x-2 rounded-full bg-gray-1/80 dark:bg-graydark-2/85 backdrop-blur-xl border border-gray-subtle shadow-lg p-1">
        <Link
          to="/"
          className="overflow-hidden size-7 rounded-full flex items-center justify-center shrink-0"
          aria-label="Nylon Impossible"
        >
          <img src="/logo192.png" alt="Nylon Impossible" className="size-8" />
        </Link>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>
    </div>
  );
}
