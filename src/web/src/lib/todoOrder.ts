import { isEffectivelyCompleted } from "@/lib/date";
import type { TodoWithUrls } from "@/types/database";

/**
 * Sort a set of top-level todos (subtasks excluded — callers group those by
 * `parentId` separately) the same way every list column on the board does:
 * sticky-first among incomplete (by position within each tier), then
 * completed (most recently completed first).
 *
 * Shared by `TodoList` (sorting its own already list-scoped todos for
 * display) and `TodoGrid` (sorting a *candidate target list's* todos to work
 * out where a cross-list drag should land) so the two never drift apart.
 */
export function sortTopLevelTodos(
  todos: TodoWithUrls[],
  timeZone: string,
  now: Date = new Date(),
): { incomplete: TodoWithUrls[]; completed: TodoWithUrls[] } {
  const topLevel = todos.filter((t) => t.parentId == null);

  // Computed once per todo — the comparator and the two filters below would
  // otherwise re-run the (Intl-formatting) derivation many times per render.
  const effectiveCompletedById = new Map(
    topLevel.map((t) => [t.id, isEffectivelyCompleted(t, timeZone, now)]),
  );
  const effectiveCompleted = (t: TodoWithUrls) =>
    effectiveCompletedById.get(t.id) ??
    isEffectivelyCompleted(t, timeZone, now);

  const sorted = [...topLevel].sort((a, b) => {
    const aDone = effectiveCompleted(a);
    const bDone = effectiveCompleted(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (!aDone) {
      if (a.sticky !== b.sticky) return a.sticky ? -1 : 1;
      const aPos = a.position ?? "a0";
      const bPos = b.position ?? "a0";
      if (aPos < bPos) return -1;
      if (aPos > bPos) return 1;
      return 0;
    }
    const aUpdated = new Date(a.completedAt ?? a.updatedAt).getTime();
    const bUpdated = new Date(b.completedAt ?? b.updatedAt).getTime();
    return bUpdated - aUpdated;
  });

  return {
    incomplete: sorted.filter((t) => !effectiveCompleted(t)),
    completed: sorted.filter((t) => effectiveCompleted(t)),
  };
}
