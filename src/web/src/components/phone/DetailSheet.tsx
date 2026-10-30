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
import { ICON_BUTTON } from "@/components/ui/styles";
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

/** Wide: "Add subtask" and "Paste a link", like a column's "+ Add". */
const COLUMN_ADD = "flex min-h-11 items-center gap-4 text-n-ink-muted";

/** Wide: a section label like Done's day labels, no rule above it. */
const COLUMN_LABEL =
  "mb-1 block text-[0.8125rem] font-semibold text-n-ink-muted";

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
 * properties chips (List, Due, Repeat, Pin; rows in the `column` variant), Notes, Subtasks, Links, then a
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
            className="absolute inset-0 z-10 flex flex-col bg-n-surface text-n-ink outline-none transition-opacity duration-(--n-duration-fast) data-ending-style:opacity-0 data-starting-style:opacity-0"
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
  // Adding a subtask takes Repeat away, so its choices close with it rather
  // than coming back if the subtasks go.
  if (panel === "repeat" && !canRepeat) setPanel(null);
  const canSubtask = !todo.recurrence;

  const setDue = (day: Date | null) => {
    // Repeat needs a due day to count from.
    save(day ? { dueDate: day } : { dueDate: null, recurrence: null });
    setPanel(null);
    setPicking(false);
  };

  const dueChoices = dueChoicesFor(now, timeZone);

  const choices = (p: Exclude<Panel, null>, className: string) => {
    if (p === "list") {
      return (
        <fieldset aria-label="Move to list" className={className}>
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
      );
    }
    if (p === "due") {
      return (
        <div className={className}>
          <fieldset aria-label="Due" className="flex min-w-0 flex-wrap gap-1.5">
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
      );
    }
    return (
      <fieldset aria-label="Repeat" className={className}>
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
    );
  };

  const titleField = (className: string) => (
    <label className="block min-w-0">
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
        className={`field-sizing-content block w-full resize-none rounded-n-chip bg-transparent p-0 font-n-display font-bold text-n-ink n-focus ${className}`}
      />
    </label>
  );

  const notesField = (label: string, className: string) => (
    <label className="block">
      <span className={label}>Notes</span>
      <textarea
        value={notes.value}
        onChange={(e) => notes.onChange(e.target.value)}
        onBlur={notes.flush}
        placeholder="Add notes"
        rows={columnVariant ? 2 : 3}
        className={`field-sizing-content block w-full resize-none rounded-n-chip bg-transparent p-0 text-n-ink n-focus placeholder:text-n-ink-muted ${className}`}
      />
    </label>
  );

  const footer = (className: string, deleteClass: string) => (
    <div className={`flex items-center justify-between ${className}`}>
      <button
        type="button"
        onClick={() => {
          onClose();
          actions.destroy(todo);
        }}
        className={`-ml-2 min-h-11 cursor-pointer rounded-n-chip px-2 font-medium text-n-overdue n-focus ${deleteClass}`}
      >
        Delete
      </button>
      <span className="text-[0.8125rem] text-n-ink-muted">
        Created {stamp(todo.createdAt, now, timeZone)} · Edited{" "}
        {stamp(todo.updatedAt, now, timeZone)}
      </span>
    </div>
  );

  if (columnVariant) {
    const choicesClass =
      "mt-0.5 mb-2 ml-10 flex min-w-0 animate-n-fade-in flex-wrap gap-1.5";
    return (
      <>
        <Dialog.Title className="sr-only">Todo</Dialog.Title>
        {/* Built like a column's header: the title on the shared baseline,
            the list as its subline, × in the corner where a list's sits. */}
        <header className="relative flex min-h-[10.5rem] shrink-0 flex-col justify-end px-6 pt-14 pb-[1.125rem]">
          {titleField("text-[1.75rem] leading-[1.1] tracking-[-0.025em]")}
          <p className="m-0 mt-2.5 truncate text-[0.8125rem] leading-[1.125rem] text-n-ink-muted">
            In {listName(todo.listId)}
          </p>
          <div className="absolute top-3 right-4">
            <Dialog.Close aria-label="Close" className={ICON_BUTTON}>
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </div>
        </header>
        <div aria-hidden="true" className="mx-6 h-px shrink-0 bg-n-hairline" />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2.5 pb-10 [scrollbar-width:thin]">
          <PropertyRow
            icon={<List size={16} aria-hidden="true" />}
            set
            aria-expanded={panel === "list"}
            aria-label={`List: ${listName(todo.listId)}`}
            onClick={() => toggle("list")}
          >
            {listName(todo.listId)}
          </PropertyRow>
          {panel === "list" && choices("list", choicesClass)}
          <PropertyRow
            icon={<CalendarIcon size={16} aria-hidden="true" />}
            set={!!due}
            overdue={due?.overdue}
            aria-expanded={panel === "due"}
            aria-label={due ? `Due: ${due.text}` : undefined}
            onClick={() => toggle("due")}
          >
            {due ? due.text : "Due date"}
          </PropertyRow>
          {panel === "due" && choices("due", choicesClass)}
          {canRepeat && (
            <>
              <PropertyRow
                icon={<Repeat size={16} aria-hidden="true" />}
                set={!!todo.recurrence}
                aria-expanded={panel === "repeat"}
                onClick={() => toggle("repeat")}
              >
                {todo.recurrence ? repeatLabel(todo.recurrence) : "Repeat"}
              </PropertyRow>
              {panel === "repeat" && choices("repeat", choicesClass)}
            </>
          )}
          <PropertyRow
            icon={<Pin size={16} aria-hidden="true" />}
            set={todo.pinned}
            aria-pressed={todo.pinned}
            onClick={() => actions.togglePin(todo)}
          >
            {todo.pinned ? "Pinned" : "Pin"}
          </PropertyRow>

          <div className="pt-4">
            {notesField(
              COLUMN_LABEL,
              "min-h-[2.625rem] text-[0.9375rem] leading-[1.4]",
            )}
          </div>

          {canSubtask && <Subtasks parent={todo} subtasks={subtasks} column />}

          <Links todo={todo} column />

          {footer("mt-6", "text-[0.8125rem]")}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex shrink-0 items-center justify-between px-3 pt-2">
        <span className="w-11" />
        <span
          aria-hidden="true"
          className="h-[5px] w-[38px] rounded-full bg-n-hairline"
        />
        <Dialog.Close
          aria-label="Close"
          className="flex size-11 cursor-pointer items-center justify-center rounded-full text-n-ink-muted n-focus"
        >
          <span className="flex size-[30px] items-center justify-center rounded-full bg-n-fill">
            <X size={14} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </Dialog.Close>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] [scrollbar-width:none]">
        <Dialog.Title className="sr-only">Todo</Dialog.Title>
        {titleField("mb-4 text-[2rem] leading-[1.08] tracking-[-0.025em]")}

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

        {panel && choices(panel, PANEL_CLASS)}

        <hr className="mt-[1.375rem] mb-4 border-0 border-t border-n-hairline" />
        {notesField(
          SECTION_LABEL,
          "min-h-[4.5rem] text-[1.0625rem] leading-[1.45]",
        )}

        {canSubtask && <Subtasks parent={todo} subtasks={subtasks} />}

        <Links todo={todo} />

        <hr className="mt-[1.375rem] mb-1.5 border-0 border-t border-n-hairline" />
        {footer("", "text-[0.9375rem]")}
      </div>
    </>
  );
}

/**
 * The open todo's properties on wide, read like todo rows: the icon sits in
 * the checkbox's gutter and the label where a title starts. Unset reads muted.
 */
function PropertyRow({
  icon,
  set,
  overdue = false,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  icon: React.ReactNode;
  set: boolean;
  overdue?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`-mx-2.5 flex min-h-11 w-[calc(100%+1.25rem)] cursor-pointer items-center gap-4 rounded-n-field px-2.5 text-left text-[0.9375rem] n-focus-inset transition-colors duration-(--n-duration-fast) pointer-fine:hover:bg-[var(--n-row-hover,var(--color-n-surface))] ${
        overdue
          ? "font-medium text-n-overdue"
          : set
            ? "font-medium text-n-ink"
            : "text-n-ink-muted"
      }`}
    >
      <span className="flex w-6 shrink-0 justify-center text-n-ink-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

function Subtasks({
  parent,
  subtasks,
  column = false,
}: {
  parent: TodoWithUrls;
  subtasks: TodoWithUrls[];
  /** Wide: rows like the board's, under a label with no rule. */
  column?: boolean;
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
    <section aria-labelledby="phone-subtasks" className={column ? "pt-4" : ""}>
      {!column && (
        <hr className="mt-[1.125rem] mb-3.5 border-0 border-t border-n-hairline" />
      )}
      <h2 id="phone-subtasks" className={column ? COLUMN_LABEL : SECTION_LABEL}>
        Subtasks{" "}
        {subtasks.length > 0 && (
          <span className="font-medium">
            {done}/{subtasks.length}
          </span>
        )}
      </h2>
      <ul>
        {sorted.map((s) => (
          <li
            key={s.id}
            className={
              column
                ? "-mx-2.5 flex items-start gap-3 rounded-n-field px-2.5 pointer-fine:hover:bg-[var(--n-row-hover,var(--color-n-surface))]"
                : "flex min-h-11 items-center gap-3"
            }
          >
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
              className={`flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-n-chip n-focus-inset ${
                column ? "-my-0.5 -mr-1.5 -ml-2.5" : "-mr-2.5 -ml-3"
              }`}
            >
              <span
                className={`flex items-center justify-center transition-colors duration-(--n-duration-fast) ${
                  column
                    ? "size-[1.375rem] rounded-[6px] border-[1.75px]"
                    : "size-[18px] rounded-[5px] border-[1.5px]"
                } ${
                  s.completed
                    ? "border-n-brand bg-n-brand text-n-brand-ink"
                    : "border-n-ink"
                }`}
              >
                {s.completed && (
                  <Check
                    size={column ? 14 : 11}
                    strokeWidth={column ? 3.2 : 3.4}
                    aria-hidden="true"
                  />
                )}
              </span>
            </button>
            <span
              className={`min-w-0 flex-1 wrap-anywhere ${
                column
                  ? "-ml-1.5 py-2.5 pl-1.5 text-[0.9375rem] leading-[1.4]"
                  : "text-base"
              } ${
                s.completed ? "text-n-ink-muted line-through" : "text-n-ink"
              }`}
            >
              {s.title}
            </span>
            <button
              type="button"
              aria-label={`Remove subtask “${s.title}”`}
              onClick={() => deleteTodo.mutate(s.id)}
              className={`flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-subtle n-focus-inset ${
                column ? "-my-0.5 -mr-2.5" : "-mr-3"
              }`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <label
        className={
          column
            ? COLUMN_ADD
            : "flex min-h-11 items-center gap-3 text-n-ink-muted"
        }
      >
        {column ? (
          <span className="flex w-6 shrink-0 justify-center">
            <Plus size={16} aria-hidden="true" />
          </span>
        ) : (
          <Plus size={16} aria-hidden="true" className="ml-0.5 shrink-0" />
        )}
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
          className={`min-w-0 flex-1 rounded-n-chip bg-transparent py-2 text-n-ink n-focus placeholder:text-n-ink-muted ${
            column ? "text-[0.9375rem]" : "text-base"
          }`}
        />
      </label>
    </section>
  );
}

/**
 * Links, always shown: a card per link, then "Paste a link" (Enter adds).
 * A new card shows at once with its domain and "Fetching title…".
 */
function Links({
  todo,
  column = false,
}: {
  todo: TodoWithUrls;
  /** Wide: each link a row like the board's, under a label with no rule. */
  column?: boolean;
}) {
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
    <section aria-labelledby="phone-links" className={column ? "pt-4" : ""}>
      {!column && (
        <hr className="mt-[1.125rem] mb-3.5 border-0 border-t border-n-hairline" />
      )}
      <h2 id="phone-links" className={column ? COLUMN_LABEL : SECTION_LABEL}>
        Links
      </h2>
      {urls.length > 0 && (
        <ul
          className={column ? "m-0 list-none p-0" : "mb-1 flex flex-col gap-2"}
        >
          {urls.map((url) => (
            <LinkCard key={url.id} todoId={todo.id} url={url} column={column} />
          ))}
        </ul>
      )}
      <label
        className={
          column
            ? COLUMN_ADD
            : "flex min-h-11 items-center gap-3 text-n-ink-muted"
        }
      >
        {column ? (
          <span className="flex w-6 shrink-0 justify-center">
            <Plus size={16} aria-hidden="true" />
          </span>
        ) : (
          <Link2 size={16} aria-hidden="true" className="ml-0.5 shrink-0" />
        )}
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
          className={`min-w-0 flex-1 rounded-n-chip bg-transparent py-2 text-n-ink n-focus placeholder:text-n-ink-muted ${
            column ? "text-[0.9375rem]" : "text-base"
          }`}
        />
      </label>
      {invalid && (
        <p
          id={errorId}
          role="alert"
          className={`m-0 text-[0.8125rem] text-n-destructive ${column ? "pl-10" : "pl-8"}`}
        >
          That doesn’t look like a link.
        </p>
      )}
    </section>
  );
}

const MENU_ITEM =
  "flex min-h-11 cursor-pointer items-center px-4 text-[0.9375rem] text-n-ink outline-none data-highlighted:bg-n-fill";

function LinkCard({
  todoId,
  url,
  column = false,
}: {
  todoId: string;
  url: SerializedTodoUrl;
  column?: boolean;
}) {
  const updatePreview = useUpdateUrlPreview();
  const processTodo = useProcessTodo();
  const removeUrl = useDeleteTodoUrl();
  const { displayTitle, isPending, isFailed } = getUrlDisplay(url);
  const domain = linkDomain(url.url);
  const title = url.showPreview ? displayTitle : url.url;

  const status = isPending ? (
    <Loader2 size={column ? 16 : 14} className="animate-spin" />
  ) : isFailed ? (
    <AlertCircle size={column ? 16 : 14} className="text-n-overdue" />
  ) : null;

  return (
    <li
      className={
        column
          ? "-mx-2.5 flex items-start gap-1 rounded-n-field pl-2.5 pointer-fine:hover:bg-[var(--n-row-hover,var(--color-n-surface))]"
          : "flex items-center gap-1 rounded-[0.75rem] border border-n-hairline"
      }
    >
      <a
        href={url.url}
        target="_blank"
        rel="noopener noreferrer"
        className={
          column
            ? "flex min-w-0 flex-1 items-start gap-4 rounded-n-field py-2.5 text-n-ink no-underline n-focus-inset"
            : "flex min-w-0 flex-1 items-center gap-3 rounded-[0.75rem] p-3 text-n-ink no-underline n-focus-inset"
        }
      >
        {column ? (
          <span
            aria-hidden="true"
            className="flex h-[1.3125rem] w-6 shrink-0 items-center justify-center text-n-ink-muted"
          >
            {status ?? <Link2 size={16} />}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-n-fill text-[0.8125rem] font-bold text-n-ink-muted"
          >
            {status ?? domain.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span
            className={`block truncate text-[0.9375rem] font-medium ${column ? "leading-[1.4]" : ""}`}
          >
            {title}
          </span>
          <span
            className={`block truncate text-[0.8125rem] text-n-ink-muted ${column ? "mt-0.5 leading-[1.125rem]" : ""}`}
          >
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
          className={`flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus-inset ${
            column ? "mt-0.5" : "mr-0.5"
          }`}
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
