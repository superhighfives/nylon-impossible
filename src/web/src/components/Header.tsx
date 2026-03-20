import { SignedIn, UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";

export default function Header() {
  return (
    <div className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <header className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-full bg-gray-1/80 dark:bg-graydark-2/85 backdrop-blur-xl border border-gray-subtle shadow-lg">
        <Link
          to="/"
          className="size-8 rounded-full bg-gray-base flex items-center justify-center shrink-0"
          aria-label="Nylon Impossible"
        >
          <span className="text-xs font-bold text-gray select-none">N</span>
        </Link>
        <nav className="flex items-center gap-1 px-1">
          <Link
            to="/"
            className="px-3 py-1.5 text-sm font-medium text-gray-muted hover:text-gray rounded-full hover:bg-gray-base transition-colors"
          >
            Home
          </Link>
        </nav>
        <SignedIn>
          <div className="pl-1">
            <UserButton />
          </div>
        </SignedIn>
      </header>
    </div>
  );
}
