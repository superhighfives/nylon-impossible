import type { Recurrence } from "@nylon-impossible/shared/schema";

/**
 * Pre-rendered human strings for suggestion buttons. The server renders these
 * once so web and iOS display identical copy without duplicating formatting
 * logic on each client.
 */

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { day: "numeric" });
const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short" });

export function formatSuggestedDate(date: Date): string {
  return `${WEEKDAY_FORMAT.format(date)} ${DAY_FORMAT.format(date)} ${MONTH_FORMAT.format(date)}`;
}

export function dueDateSuggestionLabel(date: Date): string {
  return `Set due date to ${formatSuggestedDate(date)}`;
}

export function recurrenceSuggestionLabel(recurrence: Recurrence): string {
  return `Repeat ${recurrence.frequency}`;
}

export function titleSuggestionLabel(title: string): string {
  return `Rename to "${title}"`;
}

export function subtasksSuggestionLabel(titles: string[]): string {
  const preview = titles.slice(0, 3).join(", ");
  const suffix = titles.length > 3 ? ", …" : "";
  const noun = titles.length === 1 ? "subtask" : "subtasks";
  return `Add ${titles.length} ${noun}: ${preview}${suffix}`;
}

export function researchSuggestionLabel(): string {
  return "Research this";
}
