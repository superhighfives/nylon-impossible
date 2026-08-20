import {
  AlertCircle,
  Calendar,
  ExternalLink,
  Link2,
  Pin,
  PinOff,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHints } from "@/hooks/useHints";
import {
  useEnrichTodo,
  useReresearch,
  useUpdateUrlPreview,
} from "@/hooks/useTodos";
import { useUser } from "@/hooks/useUser";
import { getEmailUrlInfo } from "@/lib/email-urls";
import { buildRecurrenceItems } from "@/lib/recurrence";
import { getSocialUrlInfo } from "@/lib/social-urls";
import { buildFaviconErrorHandler, getUrlDisplay } from "@/lib/url-display";
import type {
  Recurrence,
  RecurrenceFrequency,
  SerializedTodoUrl,
  TodoWithUrls,
} from "@/types/database";
import { ConversationSection } from "./ConversationSection";
import { ResearchSection } from "./ResearchSection";
import { SubtaskSection } from "./SubtaskSection";
import { SuggestionsSection } from "./SuggestionsSection";
import { TodoAgentChat } from "./TodoAgentChat";
import { Button, Input, Loader, Select, Textarea } from "./ui";
import { EmailPreviewCard } from "./ui/EmailPreviewCard";
import { SocialPreviewCard } from "./ui/SocialPreviewCard";

interface TodoItemExpandedProps {
  todo: TodoWithUrls;
  subtasks: TodoWithUrls[];
  onUpdate: (updates: {
    title?: string;
    notes?: string | null;
    dueDate?: Date | null;
    recurrence?: Recurrence | null;
    sticky?: boolean;
  }) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
  onAddSubtask: (parentId: string, title: string) => void;
  onToggleSubtask: (id: string, completed: boolean) => void;
  onDeleteSubtask: (id: string) => void;
  onReorderSubtask: (id: string, position: string) => void;
}

function formatDate(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toISOString().split("T")[0];
}

function UrlCard({ url }: { url: SerializedTodoUrl }) {
  // Preview removed — show just the raw URL (favicon + link), no title/description.
  if (!url.showPreview) {
    const { favicon, googleFaviconUrl } = getUrlDisplay(url);
    return (
      <a
        href={url.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 rounded-lg bg-gray-surface shadow-sm transition-shadow hover:shadow-base group/link"
      >
        {favicon ? (
          <img
            src={favicon}
            alt=""
            loading="lazy"
            className="w-4 h-4 shrink-0"
            onError={buildFaviconErrorHandler(url, googleFaviconUrl)}
          />
        ) : (
          <Link2 size={16} className="w-4 h-4 shrink-0 text-gray-muted" />
        )}
        <span className="flex-1 min-w-0 truncate text-sm text-gray group-hover/link:underline">
          {url.url}
        </span>
        <ExternalLink size={14} className="text-gray-muted shrink-0" />
      </a>
    );
  }

  // Attached email links (e.g. a Gmail thread) render as the message subject.
  if (getEmailUrlInfo(url.url)) {
    return <EmailPreviewCard url={url} />;
  }

  // Use rich social card for fetched social URLs
  if (url.fetchStatus === "fetched" && getSocialUrlInfo(url.url)) {
    return <SocialPreviewCard url={url} />;
  }

  const { isPending, isFailed, favicon, googleFaviconUrl, displayTitle } =
    getUrlDisplay(url);

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-3 rounded-lg bg-gray-surface shadow-sm transition-shadow hover:shadow-base group/link"
    >
      {isPending ? (
        <Loader size="sm" className="w-4 h-4 mt-0.5 shrink-0 text-gray-muted" />
      ) : isFailed ? (
        <AlertCircle
          size={16}
          className="w-4 h-4 mt-0.5 shrink-0 text-red-muted"
        />
      ) : favicon ? (
        <img
          src={favicon}
          alt=""
          loading="lazy"
          className="w-4 h-4 mt-0.5 shrink-0"
          onError={buildFaviconErrorHandler(url, googleFaviconUrl)}
        />
      ) : null}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray truncate group-hover/link:underline">
          {displayTitle}
          {isPending && (
            <span className="ml-2 text-xs text-gray-muted font-normal">
              Fetching...
            </span>
          )}
          {isFailed && (
            <span className="ml-2 text-xs text-red-muted font-normal">
              Failed to fetch
            </span>
          )}
        </p>
        {!isPending && !isFailed && url.description && (
          <p className="text-xs text-gray-muted mt-0.5 line-clamp-2">
            {url.description}
          </p>
        )}
        <p className="text-xs text-gray-muted mt-1 truncate">{url.url}</p>
      </div>
      <ExternalLink size={14} className="text-gray-muted shrink-0 mt-0.5" />
    </a>
  );
}

export function TodoItemExpanded({
  todo,
  subtasks,
  onUpdate,
  onDelete,
  deletePending,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onReorderSubtask,
}: TodoItemExpandedProps) {
  const { data: user } = useUser();
  const { timeZone } = useHints();
  const updateUrlPreview = useUpdateUrlPreview();
  const enrichTodo = useEnrichTodo();
  const reresearch = useReresearch();

  // AI is intentional and gated on the aiEnabled master switch; the
  // enrich/research actions only appear when AI is turned on for this user.
  const aiAvailable = user?.aiEnabled === true;
  const aiProcessing =
    todo.aiStatus === "pending" || todo.aiStatus === "processing";
  const aiFailed = todo.aiStatus === "failed";

  // Local state for form fields. We track which fields the user has touched
  // so that background updates to the todo (e.g. AI re-enrichment after a
  // conversation reply) propagate into untouched fields, while preserving any
  // edits the user has actually made in this form.
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [dueDate, setDueDate] = useState(formatDate(todo.dueDate));
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency | "none">(
    todo.recurrence?.frequency ?? "none",
  );
  const [touched, setTouched] = useState<{
    title?: boolean;
    notes?: boolean;
    dueDate?: boolean;
    recurrence?: boolean;
  }>({});

  const todoTitle = todo.title;
  const todoNotes = todo.notes ?? "";
  const todoDueDate = formatDate(todo.dueDate);
  const todoRecurrence = todo.recurrence?.frequency ?? "none";

  useEffect(() => {
    if (!touched.title) setTitle(todoTitle);
  }, [todoTitle, touched.title]);
  useEffect(() => {
    if (!touched.notes) setNotes(todoNotes);
  }, [todoNotes, touched.notes]);
  useEffect(() => {
    if (!touched.dueDate) setDueDate(todoDueDate);
  }, [todoDueDate, touched.dueDate]);
  useEffect(() => {
    if (!touched.recurrence) setRecurrence(todoRecurrence);
  }, [todoRecurrence, touched.recurrence]);

  // Recurrence has no anchor without a due date — disable the picker and
  // treat the selection as "none" while there's no due date. We don't reset
  // the underlying state, so the user's prior choice is preserved if they
  // re-enter a due date in the same session.
  const recurrenceDisabled = !dueDate;
  const effectiveRecurrence: RecurrenceFrequency | "none" = recurrenceDisabled
    ? "none"
    : recurrence;

  // Auto-save. There's no Save button: discrete fields (due date, repeat)
  // commit immediately in their handlers; free-text fields (title,
  // notes) debounce while typing and flush on blur / when the row collapses.
  // `touched` still guards each field so an in-flight server update (e.g. AI
  // re-enrichment) can't clobber a value being edited; committing clears it.
  const AUTOSAVE_DELAY = 700;
  const timers = useRef<{
    title?: ReturnType<typeof setTimeout>;
    notes?: ReturnType<typeof setTimeout>;
  }>({});
  // Latest values / callbacks for the unmount flush, which captures the
  // first-render closure.
  const titleRef = useRef(title);
  titleRef.current = title;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const todoRef = useRef(todo);
  todoRef.current = todo;

  const commitTitle = (value: string) => {
    const trimmed = value.trim();
    // Title is required — never persist a blank; keep the last good value.
    if (!trimmed || trimmed === (todoRef.current.title ?? "")) return;
    onUpdateRef.current({ title: trimmed });
  };
  const commitNotes = (value: string) => {
    const trimmed = value.trim();
    if (trimmed === (todoRef.current.notes ?? "")) return;
    onUpdateRef.current({ notes: trimmed || null });
  };

  const scheduleTextCommit = (field: "title" | "notes", value: string) => {
    const pending = timers.current[field];
    if (pending) clearTimeout(pending);
    timers.current[field] = setTimeout(() => {
      timers.current[field] = undefined;
      if (field === "title") commitTitle(value);
      else commitNotes(value);
      setTouched((t) => ({ ...t, [field]: false }));
    }, AUTOSAVE_DELAY);
  };

  const flushTextCommit = (field: "title" | "notes") => {
    const pending = timers.current[field];
    if (!pending) return;
    clearTimeout(pending);
    timers.current[field] = undefined;
    if (field === "title") commitTitle(titleRef.current);
    else commitNotes(notesRef.current);
    setTouched((t) => ({ ...t, [field]: false }));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once; the cleanup flushes pending text edits via refs when the row unmounts (collapses).
  useEffect(() => {
    return () => {
      if (timers.current.title) {
        clearTimeout(timers.current.title);
        commitTitle(titleRef.current);
      }
      if (timers.current.notes) {
        clearTimeout(timers.current.notes);
        commitNotes(notesRef.current);
      }
    };
  }, []);

  const handleClearDueDate = () => {
    setDueDate("");
    // Clearing the due date also clears any recurrence (a repeat has no anchor
    // without a due date).
    if (todo.recurrence) {
      setRecurrence("none");
      onUpdate({ dueDate: null, recurrence: null });
    } else {
      onUpdate({ dueDate: null });
    }
  };

  const handleDueDateChange = (value: string) => {
    setDueDate(value);
    if (!value) {
      handleClearDueDate();
      return;
    }
    onUpdate({ dueDate: new Date(value) });
  };

  const handleRecurrenceChange = (value: unknown) => {
    if (value === null || value === undefined) return;
    const next = value as RecurrenceFrequency | "none";
    setRecurrence(next);
    // The Repeat control is disabled without a due date, so a change always has
    // an anchor.
    onUpdate({ recurrence: next === "none" ? null : { frequency: next } });
  };

  // Label reflects the anchor — "Weekly on Wednesday", "Monthly on the 14th".
  const recurrenceItems = buildRecurrenceItems(
    dueDate ? new Date(`${dueDate}T00:00:00`) : null,
    timeZone,
  );

  return (
    <div className="mt-3 space-y-5">
      {/* Title */}
      <div className="space-y-1.5">
        <label
          htmlFor={`title-${todo.id}`}
          className="text-xs font-medium text-gray-muted"
        >
          Title
        </label>
        <Input
          id={`title-${todo.id}`}
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTouched((t) => ({ ...t, title: true }));
            scheduleTextCommit("title", e.target.value);
          }}
          onBlur={() => flushTextCommit("title")}
          className="w-full"
          inputSize="sm"
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor={`notes-${todo.id}`}
            className="text-xs font-medium text-gray-muted"
          >
            Notes
          </label>
          {aiAvailable && (
            <span className="text-xs text-gray-muted">Not used by AI</span>
          )}
        </div>
        <Textarea
          id={`notes-${todo.id}`}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setTouched((t) => ({ ...t, notes: true }));
            scheduleTextCommit("notes", e.target.value);
          }}
          onBlur={() => flushTextCommit("notes")}
          placeholder="Add a note..."
          className="resize-y"
        />
      </div>

      {/* Due Date */}
      <div className="space-y-1.5">
        <label
          htmlFor={`due-${todo.id}`}
          className="text-xs font-medium text-gray-muted flex items-center gap-1.5"
        >
          <Calendar size={12} />
          Due date
        </label>
        <div className="flex items-center gap-1.5">
          <Input
            id={`due-${todo.id}`}
            type="date"
            value={dueDate}
            onChange={(e) => handleDueDateChange(e.target.value)}
            className="flex-1 min-w-0"
            inputSize="sm"
          />
          {dueDate && (
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              onClick={handleClearDueDate}
              aria-label="Clear due date"
            >
              <X size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* Sticky — pins the todo above non-sticky ones. Instantly reversible,
          so this commits on click with no debounce, matching how the Repeat
          select commits immediately. */}
      <div className="space-y-1.5">
        <label
          htmlFor={`sticky-${todo.id}`}
          className="text-xs font-medium text-gray-muted"
        >
          Sticky
        </label>
        <Button
          id={`sticky-${todo.id}`}
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => onUpdate({ sticky: !todo.sticky })}
          aria-pressed={todo.sticky}
          className="w-fit"
        >
          {todo.sticky ? <Pin size={14} /> : <PinOff size={14} />}
          {todo.sticky ? "Pinned to top" : "Pin to top"}
        </Button>
      </div>

      {/* Repeat — disabled until a due date is set, since the rule has no
          anchor without one. Hidden when the todo has subtasks: recurrence and
          subtasks are mutually exclusive. */}
      {subtasks.length === 0 && (
        <div className="space-y-1.5">
          <label
            htmlFor={`repeat-${todo.id}`}
            className="text-xs font-medium text-gray-muted"
          >
            Repeat
          </label>
          <Select
            size="sm"
            value={effectiveRecurrence}
            onValueChange={handleRecurrenceChange}
            disabled={recurrenceDisabled}
            items={recurrenceItems}
          />
          {recurrenceDisabled && (
            <p className="text-xs text-gray-muted">
              Set a due date to enable repeats.
            </p>
          )}
        </div>
      )}

      {/* Subtasks — hidden on a recurring todo (mutually exclusive with
          recurrence). Once a subtask is added, the Repeat control above hides. */}
      {!todo.recurrence && (
        <SubtaskSection
          parentId={todo.id}
          subtasks={subtasks}
          onAdd={onAddSubtask}
          onToggle={onToggleSubtask}
          onDelete={onDeleteSubtask}
          onReorder={onReorderSubtask}
        />
      )}

      {/* AI actions — explicit, opt-in enrich / research (nothing runs
          automatically). Pro + aiEnabled only. */}
      {aiAvailable && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-muted">AI</p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => enrichTodo.mutate(todo.id)}
              disabled={enrichTodo.isPending || aiProcessing}
              loading={enrichTodo.isPending}
            >
              {!enrichTodo.isPending && <Sparkles size={14} />}
              Enrich
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => reresearch.mutate(todo.id)}
              disabled={reresearch.isPending}
              loading={reresearch.isPending}
            >
              {!reresearch.isPending && <Search size={14} />}
              Research
            </Button>
          </div>
          {aiFailed && (
            <p className="text-sm text-red-muted">Enrichment failed.</p>
          )}
        </div>
      )}

      {/* Delete row. Edits auto-save (no Save button); the toast in
          useUpdateTodo surfaces any failure. */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-subtle">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => onDelete(todo.id)}
          disabled={deletePending}
          aria-label={`Delete "${todo.title}"`}
          className="text-red-muted hover:text-red hover:bg-red-base"
        >
          <Trash2 size={14} />
          Delete
        </Button>
      </div>

      {/* Suggestions Section — proposed AI enrichment changes awaiting consent */}
      <SuggestionsSection todo={todo} />

      {/* Research Section */}
      {todo.research && (
        <ResearchSection
          todoId={todo.id}
          research={todo.research}
          researchUrls={todo.urls.filter(
            (url) => url.researchId === todo.research?.id,
          )}
        />
      )}

      {/* Conversation Section — agent questions and the user's replies */}
      <ConversationSection todo={todo} />

      {/* Chat — talk to this todo's own agent (research, edits, subtasks,
          completion; delete only ever proposed, never autonomous). Distinct
          from the Conversation section above: this is user-opened, not
          agent-initiated, and backed by src/todo-agent rather than
          todoMessages. Gated the same as the other AI actions. */}
      {aiAvailable && <TodoAgentChat todo={todo} />}

      {/* URLs (user-provided, not research sources) */}
      {todo.urls && todo.urls.filter((url) => !url.researchId).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-muted flex items-center gap-1">
            <Link2 size={12} />
            Links ({todo.urls.filter((url) => !url.researchId).length})
          </p>
          <div className="space-y-2">
            {todo.urls
              .filter((url) => !url.researchId)
              .map((url) => (
                <div key={url.id} className="space-y-1">
                  <UrlCard url={url} />
                  {url.fetchStatus === "fetched" &&
                    (url.title || url.description) && (
                      <button
                        type="button"
                        onClick={() =>
                          updateUrlPreview.mutate({
                            id: url.id,
                            showPreview: !url.showPreview,
                          })
                        }
                        disabled={updateUrlPreview.isPending}
                        // aria-pressed reflects "URL-only mode" being active.
                        aria-pressed={!url.showPreview}
                        className="-mx-1.5 inline-flex min-h-8 items-center px-1.5 py-1 text-xs text-gray-muted transition-colors hover:text-gray disabled:opacity-50"
                      >
                        {url.showPreview ? "Show just the URL" : "Show preview"}
                      </button>
                    )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
