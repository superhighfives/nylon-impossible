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
 * `pushed` pages (a collection, Done, Settings) sit closer under their back
 * control.
 */
export function Masthead({
  title,
  subline,
  pushed = false,
  id,
  children,
}: {
  title: ReactNode;
  subline: ReactNode;
  pushed?: boolean;
  id?: string;
  children?: ReactNode;
}) {
  return (
    <header>
      <h1
        id={id}
        className={`mx-5 font-n-display text-[2.875rem] leading-none font-bold tracking-[-0.03em] text-n-ink ${
          pushed ? "mt-2" : "mt-[1.875rem]"
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
