import { Link } from "@tanstack/react-router";
import { Button } from "./ui";

export function NotFound() {
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
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-gray-muted leading-relaxed max-w-xs mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      <Link to="/">
        <Button variant="primary" size="lg" className="w-full">
          Go home
        </Button>
      </Link>
    </div>
  );
}
