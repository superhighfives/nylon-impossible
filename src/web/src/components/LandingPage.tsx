import { SignInButton, SignUpButton } from "@clerk/tanstack-react-start";
import { Button } from "./ui";

const features = [
  {
    title: "AI task creation",
    description:
      "Type naturally — due dates, priorities, and URLs are parsed automatically using Workers AI.",
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
    title: "Optimistic sync",
    description:
      "Optimistic updates keep the UI fast. Changes sync automatically when you're back online.",
  },
];

export function LandingPage() {
  return (
    <div className="container max-w-xl mx-auto px-4 py-16 space-y-16">
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
          <h1 className="text-2xl font-semibold tracking-tight text-gray-12">
            Nylon Impossible
          </h1>
          <p className="text-gray-muted leading-relaxed">
            A todo app for web and iOS. Describe what you need to do — AI
            handles the rest.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-sm max-w-xs mx-auto">
          <SignInButton mode="modal">
            <Button variant="primary" size="lg" className="w-full">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="ghost" size="lg" className="w-full">
              Create account
            </Button>
          </SignUpButton>
        </div>
      </div>

      <ul className="grid gap-4">
        {features.map((feature) => (
          <li
            key={feature.title}
            className="rounded-xl border border-gray-subtle p-4 space-y-1"
          >
            <p className="text-sm font-medium text-gray-12">{feature.title}</p>
            <p className="text-sm text-gray-muted">{feature.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
