import type { SelectItem } from "@/components/ui/Select";
import { formatDueDate } from "@/lib/date";
import type { Recurrence } from "@/types/database";

/** "1st", "2nd", "3rd", "14th" — used to label monthly recurrence anchors. */
export function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const mod100 = n % 100;
  const suffix =
    suffixes[(mod100 - 20) % 10] ?? suffixes[mod100] ?? suffixes[0];
  return `${n}${suffix}`;
}

/**
 * Options for the "Repeat" dropdown. Weekly/monthly labels reflect the due
 * date anchor ("Weekly on Wednesday", "Monthly on the 14th") when one is
 * supplied, so the schedule reads unambiguously. The weekday and day-of-month
 * come from the due date's own calendar day (see `formatDueDate`), so they
 * don't shift with the viewer's zone or the server's.
 */
export function buildRecurrenceItems(anchor: Date | null): SelectItem[] {
  return [
    { value: "none", label: "None" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: weeklyRecurrenceLabel(anchor) },
    { value: "monthly", label: monthlyRecurrenceLabel(anchor) },
    { value: "yearly", label: "Yearly" },
  ];
}

function weeklyRecurrenceLabel(anchor: Date | null): string {
  return anchor
    ? `Weekly on ${formatDueDate(anchor, { weekday: "long" })}`
    : "Weekly";
}

function monthlyRecurrenceLabel(anchor: Date | null): string {
  return anchor
    ? `Monthly on the ${ordinal(Number(formatDueDate(anchor, { day: "numeric" })))}`
    : "Monthly";
}

/**
 * Human label for a recurrence rule, matching the "Repeat" dropdown wording
 * ("Daily", "Weekly on Wednesday", "Monthly on the 1st", "Yearly"). `anchor`
 * (the todo's due date) resolves the weekday / day-of-month.
 */
export function recurrenceLabel(
  recurrence: Recurrence,
  anchor: Date | null,
): string {
  switch (recurrence.frequency) {
    case "daily":
      return "Daily";
    case "weekly":
      return weeklyRecurrenceLabel(anchor);
    case "monthly":
      return monthlyRecurrenceLabel(anchor);
    case "yearly":
      return "Yearly";
  }
}
