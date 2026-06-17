import {
  AlertCircle,
  Calendar,
  ExternalLink,
  Link2,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useUser } from "@/hooks/useUser";
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

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const mod100 = n % 100;
  const suffix =
    suffixes[(mod100 - 20) % 10] ?? suffixes[mod100] ?? suffixes[0];
  return `${n}${suffix}`;
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

  // Local state for form fields
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [dueDate, setDueDate] = useState(formatDate(todo.dueDate));
  const [priority, setPriority] = useState<"high" | "low" | "none">(
    todo.priority ?? "none",
  );
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency | "none">(
    todo.recurrence?.frequency ?? "none",
  );

  // Recurrence has no anchor without a due date — disable the picker and
  // treat the selection as "none" while there's no due date. We don't reset
  // the underlying state, so the user's prior choice is preserved if they
  // re-enter a due date in the same session.
  const recurrenceDisabled = !dueDate;
  const effectiveRecurrence: RecurrenceFrequency | "none" = recurrenceDisabled
    ? "none"
    : recurrence;

  // Check if there are unsaved changes
  const hasChanges =
    title.trim() !== todo.title ||
    notes.trim() !== (todo.notes ?? "") ||
    dueDate !== formatDate(todo.dueDate) ||
    priority !== (todo.priority ?? "none") ||
    effectiveRecurrence !== (todo.recurrence?.frequency ?? "none");

  const canSave = hasChanges && title.trim().length > 0;

  const handleSave = () => {
    const updates: {
      title?: string;
      notes?: string | null;
      dueDate?: Date | null;
      priority?: "high" | "low" | null;
      recurrence?: Recurrence | null;
    } = {};

    const trimmedTitle = title.trim();
    if (trimmedTitle !== todo.title) {
      updates.title = trimmedTitle;
    }

    const trimmedNotes = notes.trim();
    if (trimmedNotes !== (todo.notes ?? "")) {
      updates.notes = trimmedNotes || null;
    }

    if (dueDate !== formatDate(todo.dueDate)) {
      updates.dueDate = dueDate ? new Date(dueDate) : null;
    }

    if (priority !== (todo.priority ?? "none")) {
      updates.priority = priority === "none" ? null : priority;
    }

    if (effectiveRecurrence !== (todo.recurrence?.frequency ?? "none")) {
      updates.recurrence =
        effectiveRecurrence === "none"
          ? null
          : { frequency: effectiveRecurrence };
    }

    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    }
  };

  const handleClearDueDate = () => {
    setDueDate("");
  };

  const handlePriorityChange = (value: unknown) => {
    if (value === null || value === undefined) return;
    setPriority(value as "high" | "low" | "none");
  };

  const handleRecurrenceChange = (value: unknown) => {
    if (value === null || value === undefined) return;
    setRecurrence(value as RecurrenceFrequency | "none");
  };

  // Label reflects the anchor — "Weekly on Wednesday", "Monthly on the 14th".
  const recurrenceItems = (() => {
    const anchor = dueDate ? new Date(`${dueDate}T00:00:00`) : null;
    const weeklyLabel = anchor
      ? `Weekly on ${anchor.toLocaleDateString(undefined, { weekday: "long" })}`
      : "Weekly";
    const monthlyLabel = anchor
      ? `Monthly on the ${ordinal(anchor.getDate())}`
      : "Monthly";
    return [
      { value: "none", label: "None" },
      { value: "daily", label: "Daily" },
      { value: "weekly", label: weeklyLabel },
      { value: "monthly", label: monthlyLabel },
      { value: "yearly", label: "Yearly" },
    ];
  })();

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
          onChange={(e) => setTitle(e.target.value)}
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
          onChange={(e) => setNotes(e.target.value)}
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
              onChange={(e) => setDueDate(e.target.value)}
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
