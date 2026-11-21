/** The due words that are lowercase mid-sentence; weekdays and months keep their capitals. */
const RELATIVE_DAYS = new Set(["Today", "Tomorrow", "Yesterday"]);

/** A due label inside a sentence: "today", "tomorrow", "Fri", "Mar 3". */
function dueInSentence(label: string): string {
  return RELATIVE_DAYS.has(label) ? label.toLowerCase() : label;
}

/**
 * The "Added to …" toast, worded the same on the web composer, Gmail and
 * (in Swift, `ToastCopy.added`) the apps: "Added to someday", "3 todos added
 * to Groceries", "Added to this week · due Fri". `list` is the list's name
 * as it reads mid-sentence; `due` is the row's due label, when a day was
 * typed.
 */
export function addedToast(
  count: number,
  list: string,
  due?: string | null,
): string {
  const where =
    count > 1 ? `${count} todos added to ${list}` : `Added to ${list}`;
  return due ? `${where} · due ${dueInSentence(due)}` : where;
}
