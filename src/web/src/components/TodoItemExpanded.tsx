import {
  AlertCircle,
  Calendar,
  ExternalLink,
  Link2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useHints } from "@/hooks/useHints";
import { useUser } from "@/hooks/useUser";
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
import { Button, Input, Loader, Select, Textarea } from "./ui";
import { SocialPreviewCard } from "./ui/SocialPreviewCard";

interface TodoItemExpandedProps {
  todo: TodoWithUrls;
  onUpdate: (updates: {
    title?: string;
    notes?: string | null;
    dueDate?: Date | null;
    priority?: "high" | "low" | null;
    recurrence?: Recurrence | null;
  }) => void;
  isUpdating: boolean;
  onDelete: (id: string) => void;
  deletePending: boolean;
}

function formatDate(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toISOString().split("T")[0];
}

function UrlCard({ url }: { url: SerializedTodoUrl }) {
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
  onUpdate,
  isUpdating,
  onDelete,
  deletePending,
}: TodoItemExpandedProps) {
  const { data: user } = useUser();
  const { timeZone } = useHints();

  // Local state for form fields. We track which fields the user has touched
  // so that background updates to the todo (e.g. AI re-enrichment after a
  // conversation reply) propagate into untouched fields, while preserving any
  // edits the user has actually made in this form.
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [dueDate, setDueDate] = useState(formatDate(todo.dueDate));
  const [priority, setPriority] = useState<"high" | "low" | "none">(
    todo.priority ?? "none",
  );
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency | "none">(
    todo.recurrence?.frequency ?? "none",
  );
  const [touched, setTouched] = useState<{
    title?: boolean;
    notes?: boolean;
    dueDate?: boolean;
    priority?: boolean;
    recurrence?: boolean;
  }>({});

  const todoTitle = todo.title;
  const todoNotes = todo.notes ?? "";
  const todoDueDate = formatDate(todo.dueDate);
  const todoPriority = todo.priority ?? "none";
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
    if (!touched.priority) setPriority(todoPriority);
  }, [todoPriority, touched.priority]);
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

  // Only fields the user has touched count as "changes" — untouched fields
  // are kept in sync with the server via the effects above.
  const hasChanges =
    (touched.title && title.trim() !== todoTitle) ||
    (touched.notes && notes.trim() !== todoNotes) ||
    (touched.dueDate && dueDate !== todoDueDate) ||
    (touched.priority && priority !== todoPriority) ||
    (touched.recurrence && effectiveRecurrence !== todoRecurrence);

  const canSave = hasChanges && title.trim().length > 0;

  const handleSave = () => {
    const updates: {
      title?: string;
      notes?: string | null;
      dueDate?: Date | null;
      priority?: "high" | "low" | null;
      recurrence?: Recurrence | null;
    } = {};

    if (touched.title) {
      const trimmedTitle = title.trim();
      if (trimmedTitle !== todoTitle) updates.title = trimmedTitle;
    }

    if (touched.notes) {
      const trimmedNotes = notes.trim();
      if (trimmedNotes !== todoNotes) updates.notes = trimmedNotes || null;
    }

    if (touched.dueDate && dueDate !== todoDueDate) {
      updates.dueDate = dueDate ? new Date(dueDate) : null;
    }

    if (touched.priority && priority !== todoPriority) {
      updates.priority = priority === "none" ? null : priority;
    }

    if (touched.recurrence && effectiveRecurrence !== todoRecurrence) {
      updates.recurrence =
        effectiveRecurrence === "none"
          ? null
          : { frequency: effectiveRecurrence };
    }

    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    }
    setTouched({});
  };

  const handleClearDueDate = () => {
    setDueDate("");
    setTouched((t) => ({ ...t, dueDate: true }));
  };

  const handlePriorityChange = (value: unknown) => {
    if (value === null || value === undefined) return;
    setPriority(value as "high" | "low" | "none");
    setTouched((t) => ({ ...t, priority: true }));
  };

  const handleRecurrenceChange = (value: unknown) => {
    if (value === null || value === undefined) return;
    setRecurrence(value as RecurrenceFrequency | "none");
    setTouched((t) => ({ ...t, recurrence: true }));
  };

  // Label reflects the anchor — "Weekly on Wednesday", "Monthly on the 14th".
  const recurrenceItems = buildRecurrenceItems(
    dueDate ? new Date(`${dueDate}T00:00:00`) : null,
    timeZone,
  );

  return (
    <div className="mt-3 space-y-5 rounded-xl border border-gray-subtle bg-gray-app/70 backdrop-blur-sm p-4">
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
          }}
          className="w-full"
          inputSize="sm"
          disabled={isUpdating}
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
          {user?.aiEnabled && (
            <span className="text-xs text-gray-muted">Not used by AI</span>
          )}
        </div>
        <Textarea
          id={`notes-${todo.id}`}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setTouched((t) => ({ ...t, notes: true }));
          }}
          placeholder="Add a note..."
          className="resize-y"
          disabled={isUpdating}
        />
      </div>

      {/* Due Date and Priority row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              onChange={(e) => {
                setDueDate(e.target.value);
                setTouched((t) => ({ ...t, dueDate: true }));
              }}
              className="flex-1 min-w-0"
              inputSize="sm"
              disabled={isUpdating}
            />
            {dueDate && (
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                onClick={handleClearDueDate}
                disabled={isUpdating}
                aria-label="Clear due date"
              >
                <X size={14} />
              </Button>
            )}
          </div>
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <label
            htmlFor={`priority-${todo.id}`}
            className="text-xs font-medium text-gray-muted"
          >
            Priority
          </label>
          <Select
            size="sm"
            value={priority}
            onValueChange={handlePriorityChange}
            disabled={isUpdating}
            items={[
              { value: "none", label: "None" },
              { value: "high", label: "High" },
              { value: "low", label: "Low" },
            ]}
          />
        </div>
      </div>

      {/* Repeat — disabled until a due date is set, since the rule has no
          anchor without one. */}
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
          disabled={isUpdating || recurrenceDisabled}
          items={recurrenceItems}
        />
        {recurrenceDisabled && (
          <p className="text-xs text-gray-muted">
            Set a due date to enable repeats.
          </p>
        )}
      </div>

      {/* Save / Delete row */}
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
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!canSave || isUpdating}
          loading={isUpdating}
        >
          Save changes
        </Button>
      </div>

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
                <UrlCard key={url.id} url={url} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
