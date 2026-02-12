import { SignedIn, UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";

export default function Header() {
  return (
    <header className="border-b border-kumo-line">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="text-2xl font-bold text-kumo-default">
          Nylon Impossible
        </Link>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </header>
  );
}
