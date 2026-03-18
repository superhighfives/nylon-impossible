import { SignedIn, UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-subtle bg-gray-1/80 backdrop-blur-sm dark:bg-graydark-1/80">
      <div className="container max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-sm font-semibold tracking-tight text-gray">
          Nylon Impossible
        </Link>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </header>
  );
}
