import { Sparkles } from "lucide-react";
import { useAcceptSuggestion, useDismissSuggestion } from "@/hooks/useTodos";
import type { TodoWithUrls } from "@/types/database";
import { Button } from "./ui";

interface SuggestionsSectionProps {
  todo: TodoWithUrls;
}

/**
 * Enrichment proposals the user accepts or dismisses individually — nothing
 * here has been applied to the todo yet. Mirrors ConversationSection's shape:
 * a labeled card under the expanded todo, gone once there's nothing pending.
 */
export function SuggestionsSection({ todo }: SuggestionsSectionProps) {
  const accept = useAcceptSuggestion();
  const dismiss = useDismissSuggestion();

  const pending = todo.suggestions.filter((s) => s.status === "pending");
  if (pending.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-muted flex items-center gap-1">
          <Sparkles size={12} />
          Suggestions
        </p>
        {pending.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              for (const s of pending) {
                accept.mutate({ todoId: todo.id, suggestionId: s.id });
              }
            }}
            disabled={accept.isPending}
          >
            Accept all
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2 rounded-lg bg-gray-surface p-3">
        {pending.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <p className="text-gray">{s.label}</p>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  accept.mutate({ todoId: todo.id, suggestionId: s.id })
                }
                disabled={accept.isPending || dismiss.isPending}
                className="bg-accent-base text-accent-muted hover:bg-accent-base"
              >
                Accept
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  dismiss.mutate({ todoId: todo.id, suggestionId: s.id })
                }
                disabled={accept.isPending || dismiss.isPending}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
