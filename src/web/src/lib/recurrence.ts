import type { SelectItem } from "@/components/ui/Select";
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
 * supplied, so the schedule reads unambiguously. `timeZone` (from the time-zone
 * client hint) resolves the weekday and day-of-month, so the label doesn't shift
 * a day when rendered on the server (UTC) near midnight.
 */
export function buildRecurrenceItems(
  anchor: Date | null,
  timeZone: string,
): SelectItem[] {
  return [
    { value: "none", label: "None" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: weeklyRecurrenceLabel(anchor, timeZone) },
    { value: "monthly", label: monthlyRecurrenceLabel(anchor, timeZone) },
    { value: "yearly", label: "Yearly" },
  ];
}

function weeklyRecurrenceLabel(anchor: Date | null, timeZone: string): string {
  return anchor
    ? `Weekly on ${anchor.toLocaleDateString(undefined, { weekday: "long", timeZone })}`
    : "Weekly";
}

function monthlyRecurrenceLabel(anchor: Date | null, timeZone: string): string {
  return anchor
    ? `Monthly on the ${ordinal(
        Number(
          anchor.toLocaleDateString("en-US", { day: "numeric", timeZone }),
        ),
      )}`
    : "Monthly";
}

/**
 * Human label for a recurrence rule, matching the "Repeat" dropdown wording
 * ("Daily", "Weekly on Wednesday", "Monthly on the 1st", "Yearly"). `anchor`
 * (the todo's due date) resolves the weekday / day-of-month; pass `timeZone`
 * from `useHints()` so it doesn't shift a day when rendered on the server.
 */
export function recurrenceLabel(
  recurrence: Recurrence,
  anchor: Date | null,
  timeZone: string,
): string {
  switch (recurrence.frequency) {
    case "daily":
      return "Daily";
    case "weekly":
      return weeklyRecurrenceLabel(anchor, timeZone);
    case "monthly":
      return monthlyRecurrenceLabel(anchor, timeZone);
    case "yearly":
      return "Yearly";
  }
}
