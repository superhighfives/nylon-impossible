import { Link } from "@tanstack/react-router";
import { Button } from "./ui";

interface ErrorViewProps {
  reset?: () => void;
}

export function ErrorView({ reset }: ErrorViewProps) {
  return (
    <div className="container max-w-sm mx-auto px-4 py-16 space-y-8 text-center">
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
          Something went wrong
        </h1>
        <p className="text-gray-muted leading-relaxed max-w-xs mx-auto">
          An unexpected error occurred. Try again, or head back home.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {reset && (
          <Button variant="primary" size="lg" className="w-full" onClick={reset}>
            Try again
          </Button>
        )}
        <Link to="/">
          <Button variant="outline" size="lg" className="w-full">
            Go home
          </Button>
        </Link>
      </div>
    </div>
  );
}
