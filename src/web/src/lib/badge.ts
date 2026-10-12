import { dayKeyIn, dueDayKey } from "@nylon-impossible/shared";
import type { TodoWithUrls } from "@/types/database";

/**
 * Update the web app badge (PWA / installed dock icon) with the count of
 * todos due today or overdue. Feature-detected; silently no-ops in browsers
 * without `navigator.setAppBadge` (Firefox, Safari without an installed PWA).
 *
 * "Due today" and "overdue" are treated the same way for badging — same as
 * the iOS surface.
 */
export function updateAppBadge(todos: TodoWithUrls[]): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (!nav.setAppBadge) return;
  const count = countDueByEndOfToday(todos);
  // Some implementations only fully drop the badge via clearAppBadge();
  // setAppBadge(0) can leave a lingering "0" pip on platforms like macOS.
  // Errors here are non-fatal (e.g. denied permission); swallow them.
  if (count === 0) {
    void nav.clearAppBadge?.().catch(() => undefined);
    return;
  }
  void nav.setAppBadge(count).catch(() => undefined);
}

function countDueByEndOfToday(todos: TodoWithUrls[]): number {
  // Due dates are calendar days; "today" is the browser's local day.
  const today = dayKeyIn(
    new Date(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  let count = 0;
  for (const todo of todos) {
    if (todo.completed) continue;
    if (!todo.dueDate) continue;
    if (dueDayKey(todo.dueDate) <= today) count += 1;
  }
  return count;
}
