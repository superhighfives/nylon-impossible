import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Shared layout for static legal pages (privacy, terms). Keeps the two routes
 * thin so their content is the only thing that differs.
 */
export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <div className="container max-w-2xl mx-auto px-4 py-16 space-y-8">
      <div className="space-y-2">
        <h1 className="font-n-display text-[2rem] leading-tight font-bold tracking-[-0.025em] text-n-ink">
          {title}
        </h1>
        <p className="text-sm text-n-ink-muted">Last updated: {lastUpdated}</p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-n-ink">
        {children}
      </div>

      <hr className="border-n-hairline" />

      <div className="flex flex-wrap gap-4 text-sm text-n-ink-muted">
        <Link
          to="/"
          className="rounded-sm transition-colors active:text-n-ink pointer-fine:hover:text-n-ink n-focus"
        >
          Home
        </Link>
        <Link
          to="/privacy"
          className="rounded-sm transition-colors active:text-n-ink pointer-fine:hover:text-n-ink n-focus"
        >
          Privacy
        </Link>
        <Link
          to="/terms"
          className="rounded-sm transition-colors active:text-n-ink pointer-fine:hover:text-n-ink n-focus"
        >
          Terms
        </Link>
      </div>
    </div>
  );
}

/** A titled section within a legal page. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-medium text-n-ink">{heading}</h2>
      {children}
    </section>
  );
}
