import { Moon, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useHints } from "@/hooks/useHints";
import { useUser } from "@/hooks/useUser";
import {
  overnightNote,
  readDismissedAt,
  writeDismissedAt,
} from "@/lib/overnight";
import type { TodoWithUrls } from "@/types/database";

/**
 * Today's overnight note, from `GET /users/me`'s `lastSweep`: the line to
 * show (or null) and a dismiss that's remembered per sweep.
 */
export function useOvernightNote(
  todos: TodoWithUrls[],
  todayListId: string | undefined,
) {
  const { data: user } = useUser();
  const hints = useHints();
  // Read once on mount; after that the state is the source of truth, so a
  // dismissal sticks even when storage is unavailable.
  const [dismissedAt, setDismissedAt] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readDismissedAt(),
  );

  const sweep = user?.lastSweep;
  const text = overnightNote({
    sweep,
    now: new Date(),
    timeZone: user?.timezone ?? hints.timeZone,
    dismissedAt,
    addedToTodaySince: (at) =>
      !!todayListId &&
      todos.some(
        (t) =>
          t.listId === todayListId &&
          t.parentId == null &&
          new Date(t.createdAt).getTime() > at.getTime(),
      ),
  });

  const dismiss = useCallback(() => {
    if (!sweep) return;
    setDismissedAt(sweep.at);
    writeDismissedAt(sweep.at);
  }, [sweep]);

  return { text, dismiss };
}

/** The quiet line under Today's title. Same on phone and wide. */
export function OvernightNote({
  text,
  onDismiss,
  className = "",
}: {
  text: string;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div
      data-overnight-note
      className={`flex animate-n-fade-in items-center gap-2 text-[0.8125rem] leading-[1.125rem] text-n-ink-muted ${className}`}
    >
      <Moon size={13} aria-hidden="true" className="shrink-0" />
      <p className="m-0 min-w-0 flex-1 truncate" title={text}>
        {text}
      </p>
      <button
        type="button"
        aria-label="Dismiss overnight note"
        onClick={onDismiss}
        className="n-hit -mr-1.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus pointer-fine:hover:bg-n-fill"
      >
        <X size={13} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}
