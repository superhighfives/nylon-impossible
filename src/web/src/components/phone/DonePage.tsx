import { Check } from "lucide-react";
import type { TodoWithUrls } from "@/types/database";
import { Masthead } from "./Masthead";
import { displayTitle, groupDoneByDay, mastheadSubline } from "./model";

/**
 * Done: the switcher's last page, finished todos grouped by day. Tapping a
 * check puts the todo back in the list it was finished from.
 */
export function DonePage({
  todos,
  listName,
  timeZone,
  onRestore,
  loading = false,
}: {
  todos: TodoWithUrls[];
  listName: (id: string) => string;
  timeZone: string;
  onRestore: (todo: TodoWithUrls) => void;
  /** Todos haven't arrived: say so, rather than "Nothing done yet." */
  loading?: boolean;
}) {
  const groups = groupDoneByDay(todos, new Date(), timeZone);
  return (
    <>
      <Masthead
        title="Done"
        subline={mastheadSubline("done", 0, new Date(), timeZone)}
      />
      {loading ? (
        <p
          className="mx-5 mt-7 text-[0.9375rem] text-n-ink-muted"
          aria-live="polite"
        >
          Loading…
        </p>
      ) : groups.length === 0 ? (
        <p className="mx-5 mt-7 font-n-display text-[1.375rem] font-semibold tracking-[-0.01em] text-n-ink">
          Nothing done yet.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="px-5 pt-[1.125rem] pb-1">
            <h2 className="mb-1.5 text-[0.8125rem] font-semibold text-n-ink-muted">
              {group.label}
            </h2>
            <ul>
              {group.items.map((todo) => (
                <li key={todo.id} className="flex items-start gap-3 py-1.5">
                  <button
                    type="button"
                    aria-label={`Put “${displayTitle(todo)}” back in ${listName(todo.listId)}`}
                    onClick={() => onRestore(todo)}
                    className="-my-1.5 -mr-1.5 -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-n-field n-focus-inset"
                  >
                    <span className="flex size-6 items-center justify-center rounded-[7px] bg-n-fill text-n-ink-muted">
                      <Check size={16} strokeWidth={3} aria-hidden="true" />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-[1.0625rem] leading-[1.35] text-n-ink-muted line-through wrap-anywhere">
                      {displayTitle(todo)}
                    </div>
                    <div className="mt-[3px] text-[0.8125rem] text-n-ink-muted">
                      {listName(todo.listId)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {groups.length > 0 && (
        <p className="mx-5 my-3 text-[0.8125rem] text-n-ink-muted">
          Tap a check to put a todo back.
        </p>
      )}
    </>
  );
}
