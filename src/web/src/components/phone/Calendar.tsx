import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Month grid for picking a due day — the same picker as the board's due-date
 * popover (`InlineTodoControls`), rebuilt on design tokens for the phone
 * detail sheet. Days are `yyyy-mm-dd` calendar days.
 */
export function Calendar({
  value,
  todayKey,
  onSelect,
}: {
  /** Selected `yyyy-mm-dd`, or null. */
  value: string | null;
  /** Today in the user's zone, `yyyy-mm-dd`. */
  todayKey: string;
  onSelect: (ymd: string) => void;
}) {
  const [y0, m0] = (value ?? todayKey).split("-").map(Number);
  const [view, setView] = useState({ y: y0, m: m0 - 1 });
  const firstWeekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const monthLabel = new Date(Date.UTC(view.y, view.m, 1)).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(Date.UTC(v.y, v.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  const navClass =
    "flex size-11 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus-inset";

  return (
    <div className="select-none">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className={navClass}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className="text-[0.9375rem] font-semibold text-n-ink tabular-nums">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className={navClass}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday order
            key={i}
            aria-hidden="true"
            className="flex h-8 items-center justify-center text-[0.6875rem] font-medium text-n-ink-muted"
          >
            {d}
          </div>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed leading blanks
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const ymd = `${view.y}-${pad2(view.m + 1)}-${pad2(day)}`;
          const selected = value === ymd;
          const isToday = todayKey === ymd;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelect(ymd)}
              aria-label={new Date(`${ymd}T00:00:00Z`).toLocaleDateString(
                "en-US",
                {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  timeZone: "UTC",
                },
              )}
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              className={`flex h-11 cursor-pointer items-center justify-center rounded-n-chip text-[0.9375rem] tabular-nums n-focus-inset ${
                selected
                  ? "bg-n-brand font-semibold text-n-brand-ink"
                  : isToday
                    ? "font-semibold text-n-ink underline decoration-n-ink-subtle underline-offset-4"
                    : "text-n-ink-muted"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
