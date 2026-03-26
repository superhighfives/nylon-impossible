import { SignedIn, UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { AiToggle } from "./AiToggle";

export default function Header() {
  return (
    <div className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <header className="pointer-events-auto flex items-center -space-x-2 rounded-full bg-gray-1/80 dark:bg-graydark-2/85 backdrop-blur-xl border border-gray-subtle shadow-lg p-1">
        <Link
          to="/"
          className="overflow-hidden size-7 rounded-full flex items-center justify-center shrink-0"
          aria-label="Nylon Impossible"
        >
          <img src="/logo192.png" alt="Nylon Impossible" className="size-8" />
        </Link>
        <SignedIn>
          <AiToggle />
          <UserButton />
        </SignedIn>
      </header>
    </div>
  );
}
