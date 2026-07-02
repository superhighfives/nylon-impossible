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
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-gray-muted">Last updated: {lastUpdated}</p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-gray">
        {children}
      </div>

      <hr className="border-gray-subtle" />

      <div className="flex flex-wrap gap-4 text-sm text-gray-muted">
        <Link to="/" className="hover:text-gray transition-colors">
          Home
        </Link>
        <Link to="/privacy" className="hover:text-gray transition-colors">
          Privacy
        </Link>
        <Link to="/terms" className="hover:text-gray transition-colors">
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
      <h2 className="text-base font-medium text-gray">{heading}</h2>
      {children}
    </section>
  );
}
