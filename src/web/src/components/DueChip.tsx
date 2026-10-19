import { X } from "lucide-react";
import { useHints } from "@/hooks/useHints";
import { dueChipLabel } from "@/lib/date";

/**
 * "Due Fri ×" — shows the date the composer parsed out of the typed text.
 * × keeps the words as typed. Minimal on purpose; the redesigned composer
 * (Phase 3) gives it the full chip-row treatment.
 */
export function DueChip({
  dueDay,
  onDismiss,
}: {
  dueDay: Date;
  onDismiss: () => void;
}) {
  const { timeZone } = useHints();
  const label = dueChipLabel(dueDay, timeZone, new Date());
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-gray-base py-0.5 pr-0.5 pl-2 text-xs font-medium text-gray">
      Due {label}
      <button
        type="button"
        onClick={onDismiss}
        // Keep focus in the field so typing carries on.
        onMouseDown={(e) => e.preventDefault()}
        aria-label={`Keep "${label}" in the title`}
        className="flex size-5 items-center justify-center rounded text-gray-muted hover:bg-gray-subtle hover:text-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
      >
        <X size={12} />
      </button>
    </span>
  );
}
