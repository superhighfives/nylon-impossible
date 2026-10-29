import { Moon, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useHints } from "@/hooks/useHints";
import { useUser } from "@/hooks/useUser";
import {
  overnightNote,
  overnightPillText,
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

  // Where "See" goes: This week if anything moved there, else Someday.
  const seeKind: "thisWeek" | "someday" =
    (sweep?.movedToThisWeek ?? 0) > 0 ? "thisWeek" : "someday";

  return { text, dismiss, seeKind };
}

/**
 * The overnight note as a small orange pill, above Today's title in the
 * space every column (and every top-level phone page) keeps for it. Its text selects the first todo in the
 * list they moved to; × dismisses it. Up to two lines, then truncated.
 */
export function OvernightPill({
  text,
  onSee,
  onDismiss,
}: {
  text: string;
  onSee: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      data-overnight-note
      className="flex max-w-full animate-n-fade-in items-center gap-1.5 self-start rounded-[0.5rem] bg-n-notice-fill py-1 pr-0.5 pl-2.5 text-[0.8125rem] font-medium text-n-notice"
    >
      <Moon size={13} aria-hidden="true" className="shrink-0" />
      <button
        type="button"
        onClick={onSee}
        className="line-clamp-2 min-w-0 flex-1 cursor-pointer rounded-[0.25rem] text-left leading-[1.125rem] underline-offset-2 n-focus-soft pointer-fine:hover:underline"
      >
        {overnightPillText(text)}
      </button>
      <button
        type="button"
        aria-label="Dismiss overnight note"
        onClick={onDismiss}
        className="flex size-[1.625rem] shrink-0 cursor-pointer items-center justify-center rounded-[0.375rem] n-focus-soft"
      >
        <X size={12} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}
