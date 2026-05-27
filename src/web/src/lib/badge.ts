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
  const cutoff = startOfTomorrowLocal();
  let count = 0;
  for (const todo of todos) {
    if (todo.completed) continue;
    if (!todo.dueDate) continue;
    if (new Date(todo.dueDate) < cutoff) count += 1;
  }
  return count;
}

// Midnight at the start of the next calendar day in the user's local
// timezone. dueDate is a UTC timestamp, so each surface converts it to its
// local day before comparing.
function startOfTomorrowLocal(): Date {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() + 1);
  return start;
}
