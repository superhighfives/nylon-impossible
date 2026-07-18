import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flag,
  X,
} from "lucide-react";
import { useState } from "react";
import { useHints } from "@/hooks/useHints";

const menuItemBase =
  "flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-gray-hover focus:bg-gray-hover data-disabled:pointer-events-none data-disabled:opacity-50";

type Priority = "high" | "low" | null;

interface InlinePriorityProps {
  value: Priority;
  onChange: (next: Priority) => void;
  disabled?: boolean;
}

/**
 * Quick priority editor for a todo row. When a priority is set it renders as the
 * coloured badge (matching the read-only indicators); when unset it's a faint
 * flag that only appears on row hover (`group-hover`), keeping resting rows
 * clean. Opens a small menu to pick None / High / Low.
 */
export function InlinePriority({
  value,
  onChange,
  disabled = false,
}: InlinePriorityProps) {
  const trigger =
    value === "high" || value === "low" ? (
      <button
        type="button"
        disabled={disabled}
        aria-label={`Priority: ${value === "high" ? "High" : "Low"}. Change priority`}
        className={`rounded-md px-1.5 py-0.5 text-xs transition-colors disabled:opacity-50 ${
          value === "high"
            ? "bg-yellow-base hover:bg-yellow-hover text-yellow-muted"
            : "bg-gray-base hover:bg-gray-hover text-gray-muted"
        }`}
      >
        {value === "high" ? "High" : "Low"}
      </button>
    ) : (
      <button
        type="button"
        disabled={disabled}
        aria-label="Set priority"
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-gray-muted/60 transition-[color,opacity] hover:text-gray-muted disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Flag size={11} aria-hidden="true" />
      </button>
    );

  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4}>
          <BaseMenu.Popup className="z-50 min-w-28 overflow-hidden rounded-lg border border-gray-subtle bg-gray-surface p-1 shadow-lg">
            {(
              [
                { label: "None", next: null },
                { label: "High", next: "high" },
                { label: "Low", next: "low" },
              ] as const
            ).map((item) => (
              <BaseMenu.Item
                key={item.label}
                className={`${menuItemBase} text-gray`}
                onClick={() => onChange(item.next)}
              >
                <Flag size={13} aria-hidden="true" />
                {item.label}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

// --- Date helpers -----------------------------------------------------------
// Due dates are treated as calendar days, not instants. We move values around
// as `yyyy-mm-dd` strings and only cross into `Date` at the API boundary, using
// UTC midnight so `date.toISOString().split("T")[0]` round-trips the same day
// the user picked (matching the previous native `<input type="date">` flow).

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `yyyy-mm-dd` → `{ y, m, d }` with a zero-based month. */
function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}

/** `{ y, m0, d }` → `yyyy-mm-dd` (m0 zero-based). */
function toYmd(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
}

/** `yyyy-mm-dd` → a UTC-midnight `Date` that round-trips back to the same day. */
function ymdToDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/**
 * A compact month-grid calendar, styled after kumo-ui's date picker but built on
 * the app's own tokens. Remounts each time the popover opens (Base UI unmounts
 * the closed portal), so the visible month always resets to the selection.
 */
function DueDateCalendar({
  value,
  timeZone,
  onSelect,
  onClear,
}: {
  value: string | null;
  timeZone: string;
  onSelect: (ymd: string) => void;
  onClear: () => void;
}) {
  // Force explicit 2-digit Y/M/D (matching src/lib/date.ts) so this is always a
  // parseable `yyyy-mm-dd`, not a locale-default format that could break parseYmd.
  const todayYmd = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  });
  const initial = parseYmd(value ?? todayYmd);
  const [view, setView] = useState({ y: initial.y, m: initial.m });

  const firstWeekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const monthLabel = new Date(Date.UTC(view.y, view.m, 1)).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const next = new Date(Date.UTC(v.y, v.m + delta, 1));
      return { y: next.getUTCFullYear(), m: next.getUTCMonth() };
    });
  };

  return (
    <div className="w-60 select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="flex size-7 items-center justify-center rounded-md text-gray-muted transition-colors hover:bg-gray-hover hover:text-gray"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="text-sm font-medium text-gray tabular-nums">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="flex size-7 items-center justify-center rounded-md text-gray-muted transition-colors hover:bg-gray-hover hover:text-gray"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((label, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday order
            key={i}
            className="flex h-7 items-center justify-center text-[10px] font-medium text-gray-muted"
          >
            {label}
          </div>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed leading blanks
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const ymd = toYmd(view.y, view.m, day);
          const isSelected = value === ymd;
          const isToday = todayYmd === ymd;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelect(ymd)}
              aria-label={ymd}
              aria-pressed={isSelected}
              className={`flex size-7 items-center justify-center rounded-md text-xs tabular-nums transition-colors ${
                isSelected
                  ? "bg-yellow-solid text-gray-12 hover:bg-yellow-solid-hover"
                  : isToday
                    ? "text-gray ring-1 ring-yellow-strong ring-inset hover:bg-gray-hover"
                    : "text-gray-muted hover:bg-gray-hover hover:text-gray"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-gray-subtle pt-2">
        <button
          type="button"
          onClick={() => onSelect(todayYmd)}
          className="rounded-md px-2 py-1 text-xs text-gray-muted transition-colors hover:bg-gray-hover hover:text-gray"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!value}
          className="rounded-md px-2 py-1 text-xs text-gray-muted transition-colors hover:bg-gray-hover hover:text-gray disabled:pointer-events-none disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

interface InlineDueDateProps {
  /** ISO `yyyy-mm-dd` string, or null when there's no due date. */
  value: string | null;
  label: string | null;
  isOverdue: boolean;
  onChange: (date: Date | null) => void;
  disabled?: boolean;
}

/**
 * Quick due-date editor for a todo row. Opens a custom calendar popover (styled
 * after kumo-ui's date picker) rather than the native control, so the picker
 * matches the app on every platform. When set it shows the formatted date badge
 * (red when overdue) with a clear affordance; when unset a faint calendar button
 * appears on row hover.
 */
export function InlineDueDate({
  value,
  label,
  isOverdue,
  onChange,
  disabled = false,
}: InlineDueDateProps) {
  const { timeZone } = useHints();
  const [open, setOpen] = useState(false);

  const handleSelect = (ymd: string) => {
    onChange(ymdToDate(ymd));
    setOpen(false);
  };
  const handleClear = () => {
    onChange(null);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {value ? (
        <span
          className={`inline-flex items-center gap-1 rounded-md text-xs tabular-nums transition-colors ${
            isOverdue
              ? "bg-red-base text-red-muted"
              : "bg-gray-base text-gray-muted"
          }`}
        >
          <Popover.Trigger
            render={
              <button
                type="button"
                disabled={disabled}
                aria-label={`Due ${label}. Change due date`}
                className="inline-flex items-center gap-1 rounded-md py-0.5 pl-1.5 pr-1 transition-colors disabled:opacity-50"
              >
                {isOverdue && <AlertCircle size={10} aria-hidden="true" />}
                {label}
              </button>
            }
          />
          <button
            type="button"
            disabled={disabled}
            onClick={handleClear}
            aria-label="Clear due date"
            className="rounded-md py-0.5 pr-1 opacity-60 transition-opacity hover:opacity-100 disabled:opacity-50"
          >
            <X size={11} aria-hidden="true" />
          </button>
        </span>
      ) : (
        <Popover.Trigger
          render={
            <button
              type="button"
              disabled={disabled}
              aria-label="Set due date"
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-gray-muted/60 transition-[color,opacity] hover:text-gray-muted disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Calendar size={11} aria-hidden="true" />
            </button>
          }
        />
      )}
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup className="z-50 rounded-lg border border-gray-subtle bg-gray-surface p-3 shadow-lg outline-none">
            <DueDateCalendar
              value={value}
              timeZone={timeZone}
              onSelect={handleSelect}
              onClear={handleClear}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
