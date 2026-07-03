import { Dialog } from "@base-ui/react/dialog";
import { useImportReview } from "@/hooks/useImportReview";
import { useTodos, useUpdateTodo } from "@/hooks/useTodos";
import { buildRecurrenceItems } from "@/lib/recurrence";
import type { RecurrenceFrequency, TodoWithUrls } from "@/types/database";
import { Button, Loader, Select } from "./ui";

function formatDue(dueDate: string): string {
  return new Date(dueDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * A single dated todo in the review list. Reads the *live* todo so that, as
 * background AI enrichment lands, the dropdown fills in with the guessed
 * schedule. Each change persists immediately via the normal update path.
 */
function ReviewRow({ todo }: { todo: TodoWithUrls }) {
  const updateTodo = useUpdateTodo();

  const dueDate = todo.dueDate; // guaranteed non-null: only dated todos land here
  const anchor = dueDate ? new Date(dueDate) : null;
  const value = todo.recurrence?.frequency ?? "none";

  // While enrichment is still running the dropdown may yet auto-fill, so hint
  // that a guess is on the way rather than implying "None" is settled.
  const guessing =
    (todo.aiStatus === "pending" || todo.aiStatus === "processing") &&
    !todo.recurrence;

  const handleChange = (next: unknown) => {
    if (next === null || next === undefined) return;
    const frequency = next as RecurrenceFrequency | "none";
    updateTodo.mutate({
      id: todo.id,
      input: {
        recurrence: frequency === "none" ? null : { frequency },
      },
    });
  };

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray">{todo.title}</p>
        {dueDate && (
          <p className="text-xs tabular-nums text-gray-muted">
            {formatDue(dueDate)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {guessing && (
          <span className="flex items-center gap-1 text-xs text-gray-muted">
            <Loader size="sm" />
            Guessing…
          </span>
        )}
        <div className="w-40">
          <Select
            size="sm"
            value={value}
            onValueChange={handleChange}
            items={buildRecurrenceItems(anchor)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Shown after a Google Tasks import: Google doesn't share repeat schedules over
 * its API, so we let the user set them here for the imported tasks that have a
 * due date (the only ones a schedule can anchor to).
 */
export function ImportReviewModal() {
  const { isReviewOpen, reviewTodos, closeReview } = useImportReview();
  const { data: todos } = useTodos();

  // Resolve each reviewed id against live data; fall back to the import
  // snapshot if the todos query hasn't caught up yet.
  const byId = new Map((todos ?? []).map((t) => [t.id, t]));
  const rows = reviewTodos.map((review): TodoWithUrls => {
    const live = byId.get(review.id);
    if (live) return live;
    return {
      id: review.id,
      userId: "",
      title: review.title,
      notes: null,
      completed: false,
      position: "",
      dueDate: review.dueDate,
      priority: null,
      recurrence: null,
      aiStatus: "pending",
      needsInput: false,
      createdAt: review.dueDate,
      updatedAt: review.dueDate,
      research: null,
      messages: [],
      urls: [],
    };
  });

  return (
    <Dialog.Root
      open={isReviewOpen}
      onOpenChange={(open) => {
        if (!open) closeReview();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-70 bg-black/40" />
        <Dialog.Popup className="fixed inset-0 z-80 flex items-center justify-center p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl bg-gray-surface p-6 shadow-lg">
            <div className="space-y-1.5">
              <Dialog.Title className="text-lg font-semibold text-gray">
                Set repeat schedules
              </Dialog.Title>
              <Dialog.Description className="text-xs text-gray-muted">
                Google doesn't share repeat schedules over its API, so your
                imported tasks came across as one-offs. Set how these dated
                tasks should repeat — AI fills in a best guess where it can.
              </Dialog.Description>
            </div>

            {/* Negative margin + matching padding gives the dropdown trigger's
                focus ring room before the scroll container clips overflow-x
                (which overflow-y-auto forces on), without shifting the rows. */}
            <div className="-mx-2 max-h-[50vh] divide-y divide-gray-subtle overflow-y-auto px-2">
              {rows.map((todo) => (
                <ReviewRow key={todo.id} todo={todo} />
              ))}
            </div>

            <div className="flex justify-end border-t border-gray-subtle pt-4">
              <Dialog.Close render={<Button size="sm">Done</Button>} />
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
