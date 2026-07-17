import { Menu as BaseMenu } from "@base-ui/react/menu";
import { AlertCircle, Calendar, Flag, X } from "lucide-react";
import { useRef } from "react";

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

interface InlineDueDateProps {
  /** ISO `yyyy-mm-dd` string, or null when there's no due date. */
  value: string | null;
  label: string | null;
  isOverdue: boolean;
  onChange: (date: Date | null) => void;
  disabled?: boolean;
}

/**
 * Quick due-date editor for a todo row. Opens the native date picker via a
 * hidden `<input type="date">`. When set it shows the formatted date badge
 * (red when overdue) with a clear affordance on hover; when unset a faint
 * calendar button appears on row hover.
 */
export function InlineDueDate({
  value,
  label,
  isOverdue,
  onChange,
  disabled = false,
}: InlineDueDateProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    // showPicker is the reliable way to open the native calendar from a custom
    // trigger; fall back to focus where it's unsupported.
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  return (
    <span className="relative inline-flex items-center">
      {value ? (
        <span
          className={`inline-flex items-center gap-1 rounded-md text-xs tabular-nums transition-colors ${
            isOverdue
              ? "bg-red-base text-red-muted"
              : "bg-gray-base text-gray-muted"
          }`}
        >
          <button
            type="button"
            disabled={disabled}
            onClick={openPicker}
            aria-label={`Due ${label}. Change due date`}
            className="inline-flex items-center gap-1 rounded-md py-0.5 pl-1.5 pr-1 transition-colors disabled:opacity-50"
          >
            {isOverdue && <AlertCircle size={10} aria-hidden="true" />}
            {label}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label="Clear due date"
            className="rounded-md py-0.5 pr-1 opacity-60 transition-opacity hover:opacity-100 disabled:opacity-50"
          >
            <X size={11} aria-hidden="true" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={openPicker}
          aria-label="Set due date"
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-gray-muted/60 transition-[color,opacity] hover:text-gray-muted disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Calendar size={11} aria-hidden="true" />
        </button>
      )}
      <input
        ref={inputRef}
        type="date"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value ? new Date(e.target.value) : null)
        }
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        // Kept in layout (not display:none) so showPicker works, but visually
        // collapsed to a point under the trigger.
        className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
      />
    </span>
  );
}
