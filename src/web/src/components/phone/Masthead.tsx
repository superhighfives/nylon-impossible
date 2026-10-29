import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/** A back control above a pushed page's title ("‹ Lists", "‹ Today"). */
export function BackButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2.5 ml-3 inline-flex min-h-11 cursor-pointer items-center gap-0.5 rounded-n-chip px-2 text-[0.9375rem] font-medium text-n-ink-muted n-focus"
    >
      <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * A page's editorial masthead: Archivo title, a muted subline, a hairline.
 * `pushed` pages (a collection, Settings) sit closer under their back
 * control. Top-level pages keep the banner's space (two lines, 20px below
 * the tabs and 20px clear of the title) whether or not it's showing, so
 * titles sit at the same height on every page and don't move when the
 * overnight pill comes or goes.
 */
export function Masthead({
  title,
  subline,
  pushed = false,
  banner,
  id,
  children,
}: {
  title: ReactNode;
  subline: ReactNode;
  pushed?: boolean;
  /** Today's overnight pill, in the space top-level pages keep for it. */
  banner?: ReactNode;
  id?: string;
  children?: ReactNode;
}) {
  return (
    <header>
      {!pushed && (
        <div
          data-banner-slot
          className="mx-5 mt-5 mb-5 flex h-[2.75rem] min-w-0 flex-col justify-end"
        >
          {banner}
        </div>
      )}
      <h1
        id={id}
        className={`mx-5 font-n-display text-[2.875rem] leading-none font-bold tracking-[-0.03em] text-n-ink ${
          pushed ? "mt-2" : ""
        }`}
      >
        {title}
      </h1>
      <p className="mx-5 mt-2.5 mb-5 text-sm text-n-ink-muted">{subline}</p>
      {children}
      <div aria-hidden="true" className="mx-5 h-px bg-n-hairline" />
    </header>
  );
}
