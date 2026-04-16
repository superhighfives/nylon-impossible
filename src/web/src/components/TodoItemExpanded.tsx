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
import type { SerializedTodoUrl, TodoWithUrls } from "@/types/database";
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

  const isPending = url.fetchStatus === "pending";
  const isFailed = url.fetchStatus === "failed";

  // Show hostname for pending/failed, or full title when fetched
  let validHostname: string | null = null;
  try {
    const parsed = new URL(url.url);
    if (parsed.hostname) validHostname = parsed.hostname;
  } catch {
    // invalid URL — validHostname stays null
  }

  const displayTitle =
    isPending || isFailed
      ? (validHostname ?? url.url)
      : (url.title ?? url.siteName ?? validHostname ?? url.url);

  const googleFaviconUrl = validHostname
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(validHostname)}&sz=32`
    : null;
  const favicon = url.favicon ?? googleFaviconUrl;

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
          onError={(e) => {
            // If the stored favicon fails, cascade to Google's service
            if (
              url.favicon &&
              googleFaviconUrl &&
              e.currentTarget.src !== googleFaviconUrl
            ) {
              e.currentTarget.src = googleFaviconUrl;
            } else {
              e.currentTarget.style.display = "none";
            }
          }}
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

  // Check if there are unsaved changes
  const hasChanges =
    title.trim() !== todo.title ||
    notes.trim() !== (todo.notes ?? "") ||
    dueDate !== formatDate(todo.dueDate) ||
    priority !== (todo.priority ?? "none");

  const canSave = hasChanges && title.trim().length > 0;

  const handleSave = () => {
    const updates: {
      title?: string;
      notes?: string | null;
      dueDate?: Date | null;
      priority?: "high" | "low" | null;
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

  return (
    <div className="mt-3 pl-7 space-y-4 bg-gray-surface rounded-lg p-4 shadow-sm">
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
            <span className="text-xs text-gray-muted italic">
              Not used by AI
            </span>
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
      <div className="flex flex-wrap items-start gap-4">
        {/* Due Date */}
        <div className="space-y-1.5">
          <label
            htmlFor={`due-${todo.id}`}
            className="text-xs font-medium text-gray-muted flex items-center gap-1"
          >
            <Calendar size={12} />
            Due date
          </label>
          <div className="flex items-center gap-1">
            <Input
              id={`due-${todo.id}`}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-[160px]"
              inputSize="sm"
              disabled={isUpdating}
            />
            {dueDate && (
              <Button
                variant="ghost"
                size="xs"
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

      {/* Save / Delete row */}
      <div className="flex items-center justify-between pt-2">
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
