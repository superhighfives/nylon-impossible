import {
  dueDayKey,
  type ParsedTodoDate,
  parseTodoDate,
} from "@nylon-impossible/shared";
import { useState } from "react";
import { useHints } from "./useHints";

export interface TypedDate {
  /** The parse to apply, or null when there's none or it was dismissed. */
  parsed: (ParsedTodoDate & { dueDay: Date }) | null;
  /** The text with the date words removed (unchanged when `parsed` is null). */
  text: string;
  /** "×" on the chip: keep the words as typed. */
  dismiss: () => void;
  /** Call after submitting so the next todo starts fresh. */
  reset: () => void;
}

/**
 * Runs the typed-date parser over a composer's text as it's typed, so the UI
 * can show a "Due Fri ×" chip. Only the first line is parsed — later lines
 * become notes, matching the server's smart-create. Dismissing keeps the
 * words for as long as the same date phrase is in the text.
 */
export function useTypedDate(input: string): TypedDate {
  const { timeZone } = useHints();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const trimmed = input.trim();
  const newline = trimmed.indexOf("\n");
  const firstLine = newline === -1 ? trimmed : trimmed.slice(0, newline);
  const rest = newline === -1 ? "" : trimmed.slice(newline);
  const result = parseTodoDate(firstLine, { now: new Date(), timeZone });
  const dueDay = result.dueDay;
  const key =
    dueDay && result.matched
      ? `${result.matched.text.toLowerCase()}|${dueDayKey(dueDay)}`
      : null;
  const active = dueDay && key !== dismissedKey ? { ...result, dueDay } : null;

  return {
    parsed: active,
    text: active ? `${active.title}${rest}` : input,
    dismiss: () => setDismissedKey(key),
    reset: () => setDismissedKey(null),
  };
}
