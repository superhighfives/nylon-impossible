import { SignedIn, UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";

export default function Header() {
  return (
    <header className="border-b border-color">
      <div className="container max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link
          to="/"
          className="text-sm font-medium tracking-tight text-surface"
        >
          Nylon Impossible
        </Link>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </header>
  );
}
