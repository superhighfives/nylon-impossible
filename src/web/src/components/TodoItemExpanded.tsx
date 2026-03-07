import { AlertCircle, Calendar, ExternalLink, Link2, X } from "lucide-react";
import { useState } from "react";
import type { SerializedTodoUrl, TodoWithUrls } from "@/types/database";
import { Button, Input, Loader, Select, Textarea } from "./ui";

interface TodoItemExpandedProps {
  todo: TodoWithUrls;
  onUpdate: (updates: {
    title?: string;
    description?: string | null;
    dueDate?: Date | null;
    priority?: "high" | "low" | null;
  }) => void;
  isUpdating: boolean;
}

function formatDate(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toISOString().split("T")[0];
}

function UrlCard({ url }: { url: SerializedTodoUrl }) {
  const isPending = url.fetchStatus === "pending";
  const isFailed = url.fetchStatus === "failed";

  // Show hostname for pending/failed, or full title when fetched
  const displayTitle =
    isPending || isFailed
      ? new URL(url.url).hostname
      : (url.title ?? url.siteName ?? new URL(url.url).hostname);

  const favicon =
    url.favicon ??
    `https://www.google.com/s2/favicons?domain=${new URL(url.url).hostname}&sz=32`;

  return (
    <a
      href={url.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-3 rounded-md bg-gray-ui transition-colors group"
    >
      {isPending ? (
        <Loader size="sm" className="w-4 h-4 mt-0.5 shrink-0" />
      ) : isFailed ? (
        <AlertCircle
          size={16}
          className="w-4 h-4 mt-0.5 shrink-0 text-tomato-dim"
        />
      ) : (
        <img
          src={favicon}
          alt=""
          className="w-4 h-4 mt-0.5 shrink-0"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-normal truncate group-hover:underline">
          {displayTitle}
          {isPending && (
            <span className="ml-2 text-xs text-gray-dim font-normal">
              Fetching...
            </span>
          )}
          {isFailed && (
            <span className="ml-2 text-xs text-tomato-dim font-normal">
              Failed to fetch
            </span>
          )}
        </p>
        {!isPending && !isFailed && url.description && (
          <p className="text-xs text-gray-dim mt-0.5 line-clamp-2">
            {url.description}
          </p>
        )}
        <p className="text-xs text-gray-dim mt-1 truncate">{url.url}</p>
      </div>
      <ExternalLink size={14} className="text-gray-dim shrink-0 mt-0.5" />
    </a>
  );
}

export function TodoItemExpanded({
  todo,
  onUpdate,
  isUpdating,
}: TodoItemExpandedProps) {
  // Local state for form fields
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description ?? "");
  const [dueDate, setDueDate] = useState(formatDate(todo.dueDate));
  const [priority, setPriority] = useState<"high" | "low" | "none">(
    todo.priority ?? "none",
  );

  // Check if there are unsaved changes
  const hasChanges =
    title.trim() !== todo.title ||
    description.trim() !== (todo.description ?? "") ||
    dueDate !== formatDate(todo.dueDate) ||
    priority !== (todo.priority ?? "none");

  const canSave = hasChanges && title.trim().length > 0;

  const handleSave = () => {
    const updates: {
      title?: string;
      description?: string | null;
      dueDate?: Date | null;
      priority?: "high" | "low" | null;
    } = {};

    const trimmedTitle = title.trim();
    if (trimmedTitle !== todo.title) {
      updates.title = trimmedTitle;
    }

    const trimmedDesc = description.trim();
    if (trimmedDesc !== (todo.description ?? "")) {
      updates.description = trimmedDesc || null;
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
    <div className="mt-3 pl-7 space-y-4">
      {/* Title */}
      <div className="space-y-1.5">
        <label
          htmlFor={`title-${todo.id}`}
          className="text-xs font-medium text-gray-dim"
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

      {/* Description */}
      <div className="space-y-1.5">
        <label
          htmlFor={`desc-${todo.id}`}
          className="text-xs font-medium text-gray-dim"
        >
          Description
        </label>
        <Textarea
          id={`desc-${todo.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description..."
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
            className="text-xs font-medium text-gray-dim flex items-center gap-1"
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
            className="text-xs font-medium text-gray-dim"
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

      {/* Save button */}
      <div className="flex justify-end pt-2">
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

      {/* URLs */}
      {todo.urls && todo.urls.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-dim flex items-center gap-1">
            <Link2 size={12} />
            Links ({todo.urls.length})
          </p>
          <div className="space-y-2">
            {todo.urls.map((url) => (
              <UrlCard key={url.id} url={url} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
