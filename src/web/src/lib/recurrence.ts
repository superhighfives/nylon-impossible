import type { SelectItem } from "@/components/ui/Select";

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
 * supplied, so the schedule reads unambiguously.
 */
export function buildRecurrenceItems(anchor: Date | null): SelectItem[] {
  const weeklyLabel = anchor
    ? `Weekly on ${anchor.toLocaleDateString(undefined, { weekday: "long" })}`
    : "Weekly";
  const monthlyLabel = anchor
    ? `Monthly on the ${ordinal(anchor.getDate())}`
    : "Monthly";
  return [
    { value: "none", label: "None" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: weeklyLabel },
    { value: "monthly", label: monthlyLabel },
    { value: "yearly", label: "Yearly" },
  ];
}
