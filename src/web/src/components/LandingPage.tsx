import { SignInButton, SignUpButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "./ui";

const features = [
  {
    title: "Capture in a keystroke",
    description:
      "Jot down anything and it's saved instantly. Paste a link and get a rich preview automatically.",
  },
  {
    title: "Real-time sync",
    description:
      "Changes appear instantly across all your devices via WebSockets and Cloudflare Durable Objects.",
  },
  {
    title: "iOS native",
    description:
      "A SwiftUI app with Siri integration and Share Sheet support, synced to the same account.",
  },
  {
    title: "Works offline",
    description:
      "Optimistic updates keep the UI fast. Changes sync automatically when you're back online.",
  },
];

export function LandingPage() {
  return (
    <div className="container max-w-sm mx-auto px-4 py-16 space-y-16">
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <picture>
            <source
              media="(prefers-color-scheme: dark)"
              srcSet="/favicon-dark.svg"
            />
            <img
              src="/favicon.svg"
              width={64}
              height={64}
              alt="Nylon Impossible"
              className="rounded-2xl"
            />
          </picture>
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Nylon Impossible
          </h1>
          <p className="text-gray-muted leading-relaxed max-w-xs mx-auto">
            A fast todo app for web and iOS. Capture anything, and keep it in
            sync everywhere.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <SignInButton mode="modal">
            <Button variant="primary" size="lg" className="w-full">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="outline" size="lg" className="w-full">
              Create account
            </Button>
          </SignUpButton>
        </div>
      </div>

      <hr className="border-gray-subtle" />

      <ul className="grid gap-4">
        {features.map((feature) => (
          <li
            key={feature.title}
            className="rounded-xl border border-gray-subtle bg-gray-app/70 backdrop-blur-sm p-4 space-y-1"
          >
            <p className="text-sm font-medium">{feature.title}</p>
            <p className="text-sm text-gray-muted">{feature.description}</p>
          </li>
        ))}
      </ul>

      <footer className="flex justify-center gap-4 text-xs text-gray-muted">
        <Link to="/privacy" className="hover:text-gray transition-colors">
          Privacy
        </Link>
        <Link to="/terms" className="hover:text-gray transition-colors">
          Terms
        </Link>
      </footer>
    </div>
  );
}
