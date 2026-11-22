import { type ReactNode, useEffect, useRef, useState } from "react";
import { Sentry } from "@/lib/sentry";

/**
 * Catches a render error inside one view (a wide column's rows, the phone
 * list, an open todo) so it takes down only that view, not the board. The
 * root boundary in `__root.tsx` stays as the last resort. The error still
 * goes to Sentry, tagged with `view`.
 *
 * `resetKey` is what the view renders from (the todos cache): when it
 * changes, a failed view tries again, so a bad row that a refetch fixes comes
 * back without a reload. Pass something stable between updates, or every
 * render retries (and reports) again.
 */
export function ViewBoundary({
  view,
  resetKey,
  className = "",
  children,
}: {
  view: string;
  resetKey: unknown;
  className?: string;
  children: ReactNode;
}) {
  // The key the view failed on, if it has; a new boundary is a fresh try.
  const failedOn = useRef<{ key: unknown } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (failedOn.current && failedOn.current.key !== resetKey) {
      failedOn.current = null;
      setAttempt((n) => n + 1);
    }
  }, [resetKey]);
  return (
    <Sentry.ErrorBoundary
      key={attempt}
      beforeCapture={(scope) => scope.setTag("view", view)}
      onError={() => {
        failedOn.current = { key: resetKey };
      }}
      fallback={
        <p
          data-view-error
          className={`m-0 py-2.5 text-n-wide-notes text-n-ink-muted ${className}`}
        >
          Couldn’t show this
        </p>
      }
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
