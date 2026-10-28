import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import {
  dayKeyIn,
  daysBetweenKeys,
  dueDayKey,
  normalizeLink,
  type RecurrenceFrequency,
  TODO_TITLE_MAX,
} from "@nylon-impossible/shared";
import { generateKeyBetween } from "fractional-indexing";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Link2,
  List,
  Loader2,
  MoreHorizontal,
  Pin,
  Plus,
  Repeat,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  useAddTodoUrl,
  useCreateTodo,
  useDeleteTodo,
  useDeleteTodoUrl,
  useProcessTodo,
  useUpdateTodo,
  useUpdateUrlPreview,
} from "@/hooks/useTodos";
import { getUrlDisplay } from "@/lib/url-display";
import type { SerializedTodoUrl, TodoWithUrls } from "@/types/database";
import { Calendar } from "./Calendar";
import {
  dayFromToday,
  dueChoices as dueChoicesFor,
  dueLabel,
  linkDomain,
  repeatLabel,
} from "./model";
import { useAutosaveField } from "./useAutosaveField";
import type { TodoActions } from "./useTodoActions";

const DAY_MS = 86_400_000;

function chipClass(selected: boolean, strong = false) {
  const tone = selected
    ? strong
      ? "border-n-brand bg-n-brand text-n-brand-ink"
      : "border-n-fill bg-n-fill text-n-ink"
    : "border-n-hairline bg-transparent text-n-ink-muted";
  return `n-hit flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-n-chip border px-3 text-sm font-medium whitespace-nowrap n-focus transition-colors duration-(--n-duration-fast) ${tone}`;
}

const PANEL_CLASS =
  "mt-2.5 flex min-w-0 animate-n-fade-in flex-wrap gap-1.5 rounded-n-field bg-n-surface p-2.5";

const SECTION_LABEL =
  "mb-1.5 block text-[0.8125rem] font-semibold text-n-ink-muted";

function stamp(iso: string, now: Date, timeZone: string): string {
  const key = dayKeyIn(new Date(iso), timeZone);
  const today = dayKeyIn(now, timeZone);
  if (key === today) return "today";
  if (key === dayKeyIn(new Date(now.getTime() - DAY_MS), timeZone)) {
    return "yesterday";
  }
  // Within the week, the weekday ("Created Thursday"), as on iOS.
  if (daysBetweenKeys(key, today) <= 6) {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      timeZone,
    });
  }
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

const REPEATS: RecurrenceFrequency[] = ["daily", "weekly", "monthly", "yearly"];

type Panel = "list" | "due" | "repeat" | null;

export interface DetailSheetProps {
  todo: TodoWithUrls | null;
  subtasks: TodoWithUrls[];
  listTargets: { id: string; label: string }[];
  listName: (id: string) => string;
  timeZone: string;
  actions: TodoActions;
  onClose: () => void;
  /**
   * `sheet` (phone): full height from the bottom, over a dimmed backdrop.
   * `column` (wide): fills the board's fourth column (`container`), which
   * stays live — the detail follows the selection, and focus stays where it
   * was, so arrowing through rows shows each one.
   */
  variant?: "sheet" | "column";
  /** `column`: the element the detail renders into. */
  container?: HTMLElement | null;
}

/**
 * The full-height detail sheet. Same order as every platform: title, the
 * properties chips (List, Due, Repeat, Pin), Notes, Subtasks, Links, then a
 * quiet Delete with the created/edited times. Every edit saves as it's made;
 * closing is the only way to finish.
 */
export function DetailSheet(props: DetailSheetProps) {
  const { todo, onClose, variant = "sheet", container } = props;
  if (variant === "column") {
    return (
      <Dialog.Root
        open={!!todo && !!container}
        modal={false}
        disablePointerDismissal
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Dialog.Portal container={container}>
          <Dialog.Popup
            data-detail-column
            initialFocus={false}
            finalFocus={false}
            className="absolute inset-0 z-10 flex flex-col bg-n-canvas text-n-ink outline-none transition-opacity duration-(--n-duration-fast) data-ending-style:opacity-0 data-starting-style:opacity-0"
          >
            {todo && <DetailBody key={todo.id} {...props} todo={todo} />}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
  return (
    <Dialog.Root
      open={!!todo}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-[color-mix(in_srgb,black_28%,transparent)] transition-opacity duration-(--n-duration-base) data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-[color-mix(in_srgb,black_55%,transparent)]" />
        <Dialog.Popup className="fixed inset-x-0 top-[3.375rem] bottom-0 z-40 mx-auto flex max-w-[42rem] flex-col rounded-t-[1.375rem] bg-n-canvas text-n-ink shadow-[0_-10px_40px_color-mix(in_srgb,black_14%,transparent)] outline-none transition-[translate,opacity] duration-(--n-duration-slow) ease-n-out data-ending-style:translate-y-full data-starting-style:translate-y-full dark:bg-n-surface">
          {/* Keyed so each todo gets fresh field state. */}
          {todo && <DetailBody key={todo.id} {...props} todo={todo} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailBody({
  todo,
  subtasks,
  listTargets,
  listName,
  timeZone,
  actions,
  onClose,
  variant = "sheet",
}: DetailSheetProps & { todo: TodoWithUrls }) {
  const columnVariant = variant === "column";
  const [panel, setPanel] = useState<Panel>(null);
  const [picking, setPicking] = useState(false);
  const now = new Date();
  const save = (input: Parameters<TodoActions["save"]>[1]) =>
    actions.save(todo.id, input);

  const title = useAutosaveField(todo.title, (value) => {
    const next = value.replace(/\s+/g, " ").trim().slice(0, TODO_TITLE_MAX);
    if (next && next !== todo.title) save({ title: next });
  });
  const notes = useAutosaveField(todo.notes ?? "", (value) => {
    const next = value.trim() ? value : null;
    if (next !== todo.notes) save({ notes: next });
  });

  const toggle = (p: Panel) => {
    setPicking(false);
    setPanel((current) => (current === p ? null : p));
  };

  const due = todo.dueDate ? dueLabel(todo.dueDate, now, timeZone) : null;
  const dueKey = todo.dueDate ? dueDayKey(todo.dueDate) : null;
  const canRepeat = subtasks.length === 0;
  const canSubtask = !todo.recurrence;

  const setDue = (day: Date | null) => {
    // Repeat needs a due day to count from.
    save(day ? { dueDate: day } : { dueDate: null, recurrence: null });
    setPanel(null);
    setPicking(false);
  };

  const dueChoices = dueChoicesFor(now, timeZone);

  return (
    <>
      <div
        className={`flex shrink-0 items-center justify-between px-3 ${columnVariant ? "pt-4" : "pt-2"}`}
      >
        <span className="w-11" />
        {!columnVariant && (
          <span
            aria-hidden="true"
            className="h-[5px] w-[38px] rounded-full bg-n-hairline"
          />
        )}
        <Dialog.Close
          aria-label="Close"
          className={`flex size-11 cursor-pointer items-center justify-center rounded-full text-n-ink-muted ${columnVariant ? "n-focus-soft" : "n-focus"}`}
        >
          <span className="flex size-[30px] items-center justify-center rounded-full bg-n-fill">
            <X size={14} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </Dialog.Close>
      </div>
      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(3rem+env(safe-area-inset-bottom,0px))] [scrollbar-width:none] ${columnVariant ? "px-7" : "px-5"}`}
      >
        <Dialog.Title className="sr-only">Todo</Dialog.Title>
        <label className="block">
          <span className="sr-only">Title</span>
          <textarea
            value={title.value}
            onChange={(e) => title.onChange(e.target.value)}
            onBlur={title.flush}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            rows={1}
            className="field-sizing-content mb-4 block w-full resize-none rounded-n-chip bg-transparent p-0 font-n-display text-[2rem] leading-[1.08] font-bold tracking-[-0.025em] text-n-ink n-focus"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-expanded={panel === "list"}
            aria-label={`List: ${listName(todo.listId)}`}
            onClick={() => toggle("list")}
            className={chipClass(true)}
          >
            <List size={14} aria-hidden="true" />
            {listName(todo.listId)}
            <ChevronDown size={14} aria-hidden="true" className="-mr-0.5" />
          </button>
          <button
            type="button"
            aria-expanded={panel === "due"}
            aria-label={due ? `Due: ${due.text}` : undefined}
            onClick={() => toggle("due")}
            className={`${chipClass(!!due)} ${due?.overdue ? "text-n-overdue" : ""}`}
          >
            <CalendarIcon size={14} aria-hidden="true" />
            {due ? due.text : "Due"}
            <ChevronDown size={14} aria-hidden="true" className="-mr-0.5" />
          </button>
          {canRepeat && (
            <button
              type="button"
              aria-expanded={panel === "repeat"}
              onClick={() => toggle("repeat")}
              className={chipClass(!!todo.recurrence)}
            >
              <Repeat size={14} aria-hidden="true" />
              {todo.recurrence ? repeatLabel(todo.recurrence) : "Repeat"}
              <ChevronDown size={14} aria-hidden="true" className="-mr-0.5" />
            </button>
          )}
          <button
            type="button"
            aria-pressed={todo.pinned}
            onClick={() => actions.togglePin(todo)}
            className={chipClass(todo.pinned)}
          >
            <Pin size={14} aria-hidden="true" />
            {todo.pinned ? "Pinned" : "Pin"}
          </button>
        </div>

        {panel === "list" && (
          <fieldset aria-label="Move to list" className={PANEL_CLASS}>
            {listTargets.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={todo.listId === t.id}
                onClick={() => {
                  actions.move(todo, t.id, { quiet: true });
                  setPanel(null);
                }}
                className={chipClass(todo.listId === t.id, true)}
              >
                {t.label}
              </button>
            ))}
          </fieldset>
        )}

        {panel === "due" && (
          <div className={PANEL_CLASS}>
            <fieldset
              aria-label="Due"
              className="flex min-w-0 flex-wrap gap-1.5"
            >
              {dueChoices.map((c) => {
                const selected = c.day
                  ? dueKey === dueDayKey(c.day)
                  : dueKey === null;
                return (
                  <button
                    key={c.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDue(c.day)}
                    className={chipClass(selected, true)}
                  >
                    {c.label}
                  </button>
                );
              })}
              <button
                type="button"
                aria-expanded={picking}
                onClick={() => setPicking((p) => !p)}
                className={chipClass(picking)}
              >
                Pick a date…
              </button>
            </fieldset>
            {picking && (
              <div className="mt-2 w-full">
                <Calendar
                  value={dueKey}
                  todayKey={dayKeyIn(now, timeZone)}
                  onSelect={(ymd) => setDue(new Date(`${ymd}T00:00:00.000Z`))}
                />
              </div>
            )}
          </div>
        )}

        {panel === "repeat" && canRepeat && (
          <fieldset aria-label="Repeat" className={PANEL_CLASS}>
            <button
              type="button"
              aria-pressed={!todo.recurrence}
              onClick={() => {
                save({ recurrence: null });
                setPanel(null);
              }}
              className={chipClass(!todo.recurrence, true)}
            >
              Never
            </button>
            {REPEATS.map((frequency) => (
              <button
                key={frequency}
                type="button"
                aria-pressed={todo.recurrence?.frequency === frequency}
                onClick={() => {
                  save({
                    recurrence: { frequency },
                    // Repeat counts from the due day; start today if unset.
                    ...(!todo.dueDate && {
                      dueDate: dayFromToday(now, timeZone, 0),
                    }),
                  });
                  setPanel(null);
                }}
                className={chipClass(
                  todo.recurrence?.frequency === frequency,
                  true,
                )}
              >
                {repeatLabel({ frequency })}
              </button>
            ))}
          </fieldset>
        )}

        <hr className="mt-[1.375rem] mb-4 border-0 border-t border-n-hairline" />
        <label className="block">
          <span className={SECTION_LABEL}>Notes</span>
          <textarea
            value={notes.value}
            onChange={(e) => notes.onChange(e.target.value)}
            onBlur={notes.flush}
            placeholder="Add notes"
            rows={3}
            className="field-sizing-content block min-h-[4.5rem] w-full resize-none rounded-n-chip bg-transparent p-0 text-[1.0625rem] leading-[1.45] text-n-ink n-focus placeholder:text-n-ink-muted"
          />
        </label>

        {canSubtask && <Subtasks parent={todo} subtasks={subtasks} />}

        <Links todo={todo} />

        <hr className="mt-[1.375rem] mb-1.5 border-0 border-t border-n-hairline" />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onClose();
              actions.destroy(todo);
            }}
            className="-ml-2 min-h-11 cursor-pointer rounded-n-chip px-2 text-[0.9375rem] font-medium text-n-overdue n-focus"
          >
            Delete
          </button>
          <span className="text-[0.8125rem] text-n-ink-muted">
            Created {stamp(todo.createdAt, now, timeZone)} · Edited{" "}
            {stamp(todo.updatedAt, now, timeZone)}
          </span>
        </div>
      </div>
    </>
  );
}

function Subtasks({
  parent,
  subtasks,
}: {
  parent: TodoWithUrls;
  subtasks: TodoWithUrls[];
}) {
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [draft, setDraft] = useState("");
  const sorted = [...subtasks].sort((a, b) =>
    a.completed !== b.completed
      ? a.completed
        ? 1
        : -1
      : a.position.localeCompare(b.position),
  );
  const done = subtasks.filter((s) => s.completed).length;

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    const last = [...subtasks].sort((a, b) =>
      a.position.localeCompare(b.position),
    )[subtasks.length - 1];
    createTodo.mutate({
      title,
      parentId: parent.id,
      listId: parent.listId,
      position: generateKeyBetween(last?.position ?? null, null),
    });
    setDraft("");
  };

  return (
    <section aria-labelledby="phone-subtasks">
      <hr className="mt-[1.125rem] mb-3.5 border-0 border-t border-n-hairline" />
      <h2 id="phone-subtasks" className={SECTION_LABEL}>
        Subtasks{" "}
        {subtasks.length > 0 && (
          <span className="font-medium">
            {done}/{subtasks.length}
          </span>
        )}
      </h2>
      <ul>
        {sorted.map((s) => (
          <li key={s.id} className="flex min-h-11 items-center gap-3">
            <button
              type="button"
              aria-pressed={s.completed}
              aria-label={s.title}
              onClick={() =>
                updateTodo.mutate({
                  id: s.id,
                  input: { completed: !s.completed },
                })
              }
              className="-mr-2.5 -ml-3 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-n-chip n-focus-inset"
            >
              <span
                className={`flex size-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors duration-(--n-duration-fast) ${
                  s.completed
                    ? "border-n-brand bg-n-brand text-n-brand-ink"
                    : "border-n-ink"
                }`}
              >
                {s.completed && (
                  <Check size={11} strokeWidth={3.4} aria-hidden="true" />
                )}
              </span>
            </button>
            <span
              className={`min-w-0 flex-1 text-base wrap-anywhere ${
                s.completed ? "text-n-ink-muted line-through" : "text-n-ink"
              }`}
            >
              {s.title}
            </span>
            <button
              type="button"
              aria-label={`Remove subtask “${s.title}”`}
              onClick={() => deleteTodo.mutate(s.id)}
              className="-mr-3 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-subtle n-focus-inset"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <label className="flex min-h-11 items-center gap-3 text-n-ink-muted">
        <Plus size={16} aria-hidden="true" className="ml-0.5 shrink-0" />
        <span className="sr-only">New subtask</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          enterKeyHint="done"
          placeholder="Add subtask"
          className="min-w-0 flex-1 rounded-n-chip bg-transparent py-2 text-base text-n-ink n-focus placeholder:text-n-ink-muted"
        />
      </label>
    </section>
  );
}

/**
 * Links, always shown: a card per link, then "Paste a link" (Enter adds).
 * A new card shows at once with its domain and "Fetching title…".
 */
function Links({ todo }: { todo: TodoWithUrls }) {
  const addUrl = useAddTodoUrl();
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const urls = [...todo.urls].sort((a, b) =>
    a.position.localeCompare(b.position),
  );
  const errorId = `link-error-${todo.id}`;

  const add = () => {
    if (!draft.trim()) return;
    const url = normalizeLink(draft);
    if (!url) {
      setInvalid(true);
      return;
    }
    // Already there: the card is on screen, so just clear the field.
    if (!todo.urls.some((u) => u.url === url)) {
      addUrl.mutate({ todoId: todo.id, url });
    }
    setDraft("");
  };

  return (
    <section aria-labelledby="phone-links">
      <hr className="mt-[1.125rem] mb-3.5 border-0 border-t border-n-hairline" />
      <h2 id="phone-links" className={SECTION_LABEL}>
        Links
      </h2>
      {urls.length > 0 && (
        <ul className="mb-1 flex flex-col gap-2">
          {urls.map((url) => (
            <LinkCard key={url.id} todoId={todo.id} url={url} />
          ))}
        </ul>
      )}
      <label className="flex min-h-11 items-center gap-3 text-n-ink-muted">
        <Link2 size={16} aria-hidden="true" className="ml-0.5 shrink-0" />
        <span className="sr-only">Add a link</span>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="Paste a link"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className="min-w-0 flex-1 rounded-n-chip bg-transparent py-2 text-base text-n-ink n-focus placeholder:text-n-ink-muted"
        />
      </label>
      {invalid && (
        <p
          id={errorId}
          role="alert"
          className="m-0 pl-8 text-[0.8125rem] text-n-destructive"
        >
          That doesn’t look like a link.
        </p>
      )}
    </section>
  );
}

const MENU_ITEM =
  "flex min-h-11 cursor-pointer items-center px-4 text-[0.9375rem] text-n-ink outline-none data-highlighted:bg-n-fill";

function LinkCard({ todoId, url }: { todoId: string; url: SerializedTodoUrl }) {
  const updatePreview = useUpdateUrlPreview();
  const processTodo = useProcessTodo();
  const removeUrl = useDeleteTodoUrl();
  const { displayTitle, isPending, isFailed } = getUrlDisplay(url);
  const domain = linkDomain(url.url);
  const title = url.showPreview ? displayTitle : url.url;

  return (
    <li className="flex items-center gap-1 rounded-[0.75rem] border border-n-hairline">
      <a
        href={url.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[0.75rem] p-3 text-n-ink no-underline n-focus-inset"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-n-fill text-[0.8125rem] font-bold text-n-ink-muted"
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isFailed ? (
            <AlertCircle size={14} className="text-n-overdue" />
          ) : (
            domain.charAt(0).toUpperCase()
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[0.9375rem] font-medium">
            {title}
          </span>
          <span className="block truncate text-[0.8125rem] text-n-ink-muted">
            {isPending
              ? "Fetching title…"
              : isFailed
                ? `${domain} · Couldn’t fetch`
                : domain}
          </span>
        </span>
      </a>
      <Menu.Root>
        <Menu.Trigger
          aria-label={`Link options for ${domain}`}
          className="mr-0.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus-inset"
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4} align="end" className="z-[60]">
            <Menu.Popup className="popup-motion min-w-44 overflow-hidden rounded-[0.875rem] bg-n-canvas py-1 shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)] outline-none dark:bg-n-fill">
              <Menu.Item
                className={MENU_ITEM}
                onClick={() =>
                  updatePreview.mutate({
                    id: url.id,
                    showPreview: !url.showPreview,
                  })
                }
              >
                {url.showPreview ? "Show as URL" : "Show preview"}
              </Menu.Item>
              {isFailed && (
                <Menu.Item
                  className={MENU_ITEM}
                  onClick={() => processTodo.mutate(todoId)}
                >
                  Retry
                </Menu.Item>
              )}
              <Menu.Item
                className={`${MENU_ITEM} text-n-overdue`}
                onClick={() => removeUrl.mutate(url.id)}
              >
                Remove
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </li>
  );
}
